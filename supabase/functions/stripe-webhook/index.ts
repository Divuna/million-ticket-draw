import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LOG_SOURCE = 'onemil_edge_stripe_webhook'

function omLog(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const payload = {
    ts: new Date().toISOString(),
    source: LOG_SOURCE,
    v: '1',
    level,
    event,
    ...fields,
  }
  const line = JSON.stringify(payload)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

/** Must match create-stripe-checkout / Homepage / Profile. */
const CZK_TO_COINS: Record<number, number> = {
  50: 50,
  300: 310,
  500: 525,
  1200: 1280,
}

function miocoinsForCzkPrice(priceCzk: number): number {
  if (!Number.isInteger(priceCzk) || priceCzk < 1) return 0
  const tier = CZK_TO_COINS[priceCzk]
  if (tier !== undefined) return tier
  return priceCzk
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const s = value.trim().toLowerCase()
  return UUID_RE.test(s) ? s : null
}

function normalizeUserId(value: unknown): string | null {
  return normalizeUuid(value)
}

/**
 * Stripe refundační události.
 *
 * Stav refundace může být `pending`, `requires_action`, `succeeded`, `failed`
 * nebo `canceled`. Webhook je jediné místo, které se o dokončení dozví
 * spolehlivě — opakovaný `refunds.create` se stejným idempotency key vrací
 * původní uloženou odpověď, takže aktuální stav neukazuje.
 *
 * Idempotence: veškerá práce s penězi je uvnitř databázových funkcí, které
 * jsou jištěné unikátními indexy (`refund_debit` / `refund_reversal` na platbu).
 * Opakovaná událost proto nemůže změnit zůstatek podruhé ani vytvořit druhý
 * ledger řádek, a `refunded` se nikdy nevrací zpět.
 */
const REFUND_EVENT_TYPES = new Set(['refund.created', 'refund.updated', 'refund.failed'])

type RefundLike = {
  id?: string
  status?: string | null
  metadata?: Record<string, string> | null
  payment_intent?: unknown
}

async function handleRefundEvent(
  supabaseClient: ReturnType<typeof createClient>,
  eventType: string,
  refund: RefundLike,
): Promise<{ handled: boolean; reason?: string }> {
  const refundId = typeof refund.id === 'string' ? refund.id : null
  const refundStatus = typeof refund.status === 'string' ? refund.status : null

  if (!refundId) {
    omLog('warn', 'refund_event_missing_id', { action: 'stripe_webhook', event_type: eventType })
    return { handled: false, reason: 'missing_refund_id' }
  }

  // Platbu hledáme primárně přes metadata, která zapisuje stripe-refund.
  let paymentId = normalizeUuid(refund.metadata?.onemil_payment_id)

  if (!paymentId) {
    // Záloha: refundace založená ručně ve Stripe dashboardu metadata nemá.
    const { data: byRefundId } = await supabaseClient
      .from('payments')
      .select('id')
      .eq('stripe_refund_id', refundId)
      .maybeSingle()
    paymentId = (byRefundId?.id as string | undefined) ?? null
  }

  if (!paymentId) {
    omLog('warn', 'refund_event_payment_not_found', {
      action: 'stripe_webhook',
      event_type: eventType,
      stripe_refund_id: refundId,
    })
    return { handled: false, reason: 'payment_not_found' }
  }

  // Uložení aktuálního Stripe stavu — nikdy nemění stav platby ani zůstatky.
  const { data: recorded, error: recordError } = await supabaseClient.rpc(
    'record_stripe_refund_status',
    { p_payment_id: paymentId, p_refund_id: refundId, p_status: refundStatus ?? 'unknown' },
  )

  const rec = recorded as { ok?: boolean; code?: string } | null

  if (recordError || !rec || rec.ok !== true) {
    omLog('error', 'refund_event_record_failed', {
      action: 'stripe_webhook',
      event_type: eventType,
      payment_id: paymentId,
      code: recordError?.code ?? rec?.code ?? 'unknown',
    })
    return { handled: false, reason: 'record_failed' }
  }

  if (refundStatus === 'succeeded') {
    const { data: finalized, error: finalizeError } = await supabaseClient.rpc(
      'finalize_stripe_refund',
      { p_payment_id: paymentId },
    )
    const fin = finalized as { ok?: boolean; code?: string } | null

    if (finalizeError || !fin || fin.ok !== true) {
      omLog('error', 'refund_event_finalize_failed', {
        action: 'stripe_webhook',
        payment_id: paymentId,
        code: finalizeError?.code ?? fin?.code ?? 'unknown',
      })
      return { handled: false, reason: 'finalize_failed' }
    }

    omLog('info', 'refund_succeeded', { action: 'stripe_webhook', payment_id: paymentId })
    return { handled: true }
  }

  if (refundStatus === 'failed' || refundStatus === 'canceled') {
    const { data: reversed, error: reverseError } = await supabaseClient.rpc(
      'reverse_failed_stripe_refund',
      { p_payment_id: paymentId, p_stripe_status: refundStatus },
    )
    const rev = reversed as { ok?: boolean; code?: string } | null

    if (reverseError || !rev || rev.ok !== true) {
      omLog('error', 'refund_event_reverse_failed', {
        action: 'stripe_webhook',
        payment_id: paymentId,
        code: reverseError?.code ?? rev?.code ?? 'unknown',
      })
      return { handled: false, reason: 'reverse_failed' }
    }

    omLog('info', 'refund_reversed', { action: 'stripe_webhook', payment_id: paymentId })
    return { handled: true }
  }

  // pending / requires_action — platba zůstává `refund_pending`.
  omLog('info', 'refund_still_pending', {
    action: 'stripe_webhook',
    payment_id: paymentId,
    stripe_refund_status: refundStatus,
  })
  return { handled: true }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    })

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const signature = req.headers.get('stripe-signature')
    const body = await req.text()

    if (!signature) {
      throw new Error('No Stripe signature found')
    }

    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    if (!webhookSecret) {
      throw new Error('Webhook secret not configured')
    }

    let event: Stripe.Event
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      omLog('error', 'webhook_signature_invalid', {
        action: 'stripe_webhook',
        message: errorMessage,
      })
      return new Response(
        JSON.stringify({ error: 'Webhook signature verification failed' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      )
    }

    console.log('Received webhook event:', event.type)

    // Refundační události. Tok `checkout.session.completed` níže zůstává beze změny.
    if (REFUND_EVENT_TYPES.has(event.type)) {
      const result = await handleRefundEvent(
        supabaseClient,
        event.type,
        event.data.object as RefundLike,
      )

      if (!result.handled) {
        // 500 → Stripe událost zopakuje. Opakování je bezpečné: práce s penězi
        // je jištěná unikátními indexy, takže druhý zápis nevznikne.
        return new Response(
          JSON.stringify({ received: true, error: result.reason ?? 'refund_event_failed' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: result.reason === 'payment_not_found' || result.reason === 'missing_refund_id'
              ? 200
              : 500,
          },
        )
      }

      return new Response(JSON.stringify({ received: true, handled: event.type }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session

      if (session.payment_status !== 'paid') {
        omLog('info', 'payment_skipped_not_paid', {
          action: 'stripe_webhook',
          stripe_session_id: session.id,
          payment_status: session.payment_status,
        })
        return new Response(JSON.stringify({ received: true, skipped: 'not_paid' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }

      const cur = (session.currency || '').toLowerCase()
      if (cur !== 'czk') {
        console.error('STRIPE WEBHOOK FAILURE', { session_id: session.id, reason: `Unsupported currency: ${session.currency}`, user_id: session.metadata?.user_id ?? null, amount: session.amount_total ?? null })
        return new Response(JSON.stringify({ error: 'Unsupported currency' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }

      const amountTotal = session.amount_total
      if (amountTotal == null || !Number.isInteger(amountTotal) || amountTotal < 100) {
        console.error('STRIPE WEBHOOK FAILURE', { session_id: session.id, reason: 'Invalid or missing amount_total', user_id: session.metadata?.user_id ?? null, amount: amountTotal })
        return new Response(JSON.stringify({ error: 'Invalid amount_total' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }
      if (amountTotal % 100 !== 0) {
        console.error('STRIPE WEBHOOK FAILURE', { session_id: session.id, reason: 'amount_total is not a whole CZK amount', user_id: session.metadata?.user_id ?? null, amount: amountTotal })
        return new Response(JSON.stringify({ error: 'amount_total not whole CZK' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }

      const priceCzk = amountTotal / 100
      const coinsToCredit = miocoinsForCzkPrice(priceCzk)
      if (coinsToCredit < 1) {
        console.error('STRIPE WEBHOOK FAILURE', { session_id: session.id, reason: 'Could not derive MioCoin amount from paid total', user_id: session.metadata?.user_id ?? null, amount: amountTotal })
        return new Response(JSON.stringify({ error: 'Could not derive MioCoin amount' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }

      const userId = normalizeUserId(session.metadata?.user_id)
      if (!userId) {
        console.error('STRIPE WEBHOOK FAILURE', { session_id: session.id, reason: 'Missing or invalid user_id in session metadata', user_id: session.metadata?.user_id ?? null, amount: amountTotal })
        return new Response(JSON.stringify({ error: 'Missing or invalid user_id' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }

      omLog('info', 'payment_credit_pending', {
        user_id: userId,
        action: 'stripe_checkout_completed',
        stripe_session_id: session.id,
        amount_total_haler: amountTotal,
        price_czk_verified: priceCzk,
        miocoins_to_credit: coinsToCredit,
      })

      const { data: existingPayment } = await supabaseClient
        .from('payments')
        .select('id')
        .eq('stripe_session_id', session.id)
        .maybeSingle()

      if (existingPayment) {
        console.log('STRIPE WEBHOOK DUPLICATE', { session_id: session.id })
        return new Response(
          JSON.stringify({ received: true, message: 'Payment already processed' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          },
        )
      }

      const { error: paymentError } = await supabaseClient.from('payments').insert({
        user_id: userId,
        amount: coinsToCredit,
        method: 'stripe',
        status: 'completed',
        stripe_session_id: session.id,
      })

      if (paymentError) {
        omLog('error', 'payment_insert_failed', {
          user_id: userId,
          action: 'stripe_webhook',
          stripe_session_id: session.id,
          message: paymentError.message,
          code: paymentError.code,
        })
        console.error('STRIPE WEBHOOK FAILURE', { session_id: session.id, reason: 'Failed to record payment', user_id: userId, amount: coinsToCredit, db_error: paymentError.message, db_code: paymentError.code })
        return new Response(JSON.stringify({ error: 'Failed to record payment' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }

      omLog('info', 'payment_credited', {
        user_id: userId,
        action: 'wallet_credit_from_stripe',
        stripe_session_id: session.id,
        miocoins_credited: coinsToCredit,
        price_czk: priceCzk,
      })
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    omLog('error', 'webhook_handler_error', {
      action: 'stripe_webhook',
      message: errorMessage,
    })
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
