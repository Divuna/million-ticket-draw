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

function normalizeUserId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const s = value.trim().toLowerCase()
  return UUID_RE.test(s) ? s : null
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
        status: 400,
      },
    )
  }
})
