import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Chyby přípravy se mapují na HTTP kód. Text zůstává český a jde přímo do UI.
const PREPARE_ERROR_STATUS: Record<string, number> = {
  invalid_input: 400,
  not_found: 404,
  already_refunded: 409,
  refund_failed_needs_manual_review: 409,
  invalid_status: 400,
  missing_stripe_session: 400,
  invalid_amount: 400,
  insufficient_balance: 409,
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  let paymentId: string | null = null

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // 1. Ověření JWT a role administrátora (beze změny oproti původní verzi).
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

    if (authError || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (!roleData) {
      return json({ error: 'Forbidden: admin role required' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const rawPaymentId = (body as { payment_id?: unknown }).payment_id

    if (typeof rawPaymentId !== 'string' || !UUID_RE.test(rawPaymentId)) {
      return json({ error: 'Missing or invalid payment_id' }, 400)
    }
    paymentId = rawPaymentId

    // 2. Příprava refundace PŘED jakýmkoli voláním Stripe.
    //    Jediná operace, která odečítá MioCoiny. Zamkne platbu i peněženku,
    //    vyžaduje celý zůstatek z dané platby a je idempotentní.
    //    Ze stavu `refund_failed` odmítne pokračovat — ten vyžaduje ruční kontrolu.
    const { data: prepared, error: prepareError } = await supabaseClient.rpc(
      'prepare_stripe_refund',
      { p_payment_id: paymentId },
    )

    if (prepareError) {
      console.error('prepare_stripe_refund failed', {
        payment_id: paymentId,
        code: prepareError.code,
        message: prepareError.message,
      })
      return json({ error: 'Refundaci se nepodařilo připravit. Zkuste to prosím znovu.' }, 500)
    }

    const prep = prepared as {
      ok: boolean
      code?: string
      message?: string
      already_prepared?: boolean
      amount?: number
      stripe_session_id?: string
      stripe_refund_id?: string | null
    } | null

    if (!prep || prep.ok !== true) {
      const code = prep?.code ?? 'prepare_failed'
      console.warn('refund blocked before Stripe', { payment_id: paymentId, code })
      return json(
        { error: prep?.message ?? 'Refundaci nelze provést.', code },
        PREPARE_ERROR_STATUS[code] ?? 400,
      )
    }

    // Od tohoto bodu jsou MioCoiny odečtené a platba je ve stavu `refund_pending`.
    // Při jakémkoli dalším selhání se stav ZÁMĚRNĚ nevrací zpět, aby šlo akci
    // bezpečně zopakovat bez druhého odečtu.
    const sessionId = prep.stripe_session_id as string
    const amount = prep.amount as number
    const knownRefundId = prep.stripe_refund_id ?? null

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    })

    let refundId: string
    let refundStatus: string | null

    try {
      if (knownRefundId) {
        // Refundace už existuje — jen si přečteme její AKTUÁLNÍ stav.
        // Opakovaný create se stejným idempotency key by vrátil původní
        // uloženou odpověď, takže by aktuální stav neukázal.
        const existing = await stripe.refunds.retrieve(knownRefundId)
        refundId = existing.id
        refundStatus = existing.status ?? null
      } else {
        const session = await stripe.checkout.sessions.retrieve(sessionId)

        if (!session.payment_intent) {
          console.error('no payment intent on session', { payment_id: paymentId })
          return json(
            {
              error: 'Ke Stripe platbě se nepodařilo dohledat platební záměr. Refundace zůstává rozpracovaná.',
              code: 'stripe_payment_intent_missing',
              status: 'refund_pending',
            },
            502,
          )
        }

        const paymentIntentId = typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent.id

        // Idempotency key odvozený z payment_id — pokud předchozí pokus skončil
        // síťovou chybou, tentýž request Stripe nevytvoří druhou refundaci.
        const refund = await stripe.refunds.create(
          {
            payment_intent: paymentIntentId,
            metadata: { onemil_payment_id: paymentId },
          },
          { idempotencyKey: `onemil-refund-${paymentId}` },
        )

        refundId = refund.id
        refundStatus = refund.status ?? null
      }
    } catch (stripeError) {
      // Nejasný výsledek (síť, timeout, výpadek Stripe) — stav zůstává
      // `refund_pending`, aby šlo akci bezpečně zopakovat.
      const message = stripeError instanceof Error ? stripeError.message : String(stripeError)
      console.error('Stripe refund call failed', { payment_id: paymentId, message })
      return json(
        {
          error: 'Stripe refundaci se nepodařilo dokončit. Refundace zůstává rozpracovaná, akci lze bezpečně zopakovat.',
          code: 'stripe_call_failed',
          status: 'refund_pending',
        },
        502,
      )
    }

    // 3. Okamžité uložení ID a stavu refundace, aby další pokus mohl použít
    //    `retrieve` místo `create`.
    const { data: recorded, error: recordError } = await supabaseClient.rpc(
      'record_stripe_refund_status',
      { p_payment_id: paymentId, p_refund_id: refundId, p_status: refundStatus ?? 'unknown' },
    )

    const rec = recorded as { ok?: boolean; code?: string } | null

    if (recordError || !rec || rec.ok !== true) {
      console.error('record_stripe_refund_status failed', {
        payment_id: paymentId,
        code: recordError?.code ?? rec?.code ?? 'unknown',
      })
      return json(
        {
          error: 'Stripe refundaci se nepodařilo uložit k platbě. Refundace zůstává rozpracovaná, akci lze bezpečně zopakovat.',
          code: 'record_failed',
          status: 'refund_pending',
        },
        500,
      )
    }

    // 4. Rozpad podle skutečného Stripe stavu.
    if (refundStatus === 'failed' || refundStatus === 'canceled') {
      const { data: reversed, error: reverseError } = await supabaseClient.rpc(
        'reverse_failed_stripe_refund',
        { p_payment_id: paymentId, p_stripe_status: refundStatus },
      )

      const rev = reversed as { ok?: boolean; code?: string } | null

      if (reverseError || !rev || rev.ok !== true) {
        console.error('reverse_failed_stripe_refund failed', {
          payment_id: paymentId,
          code: reverseError?.code ?? rev?.code ?? 'unknown',
        })
        return json(
          {
            error: 'Stripe refundace selhala a MioCoiny se nepodařilo vrátit. Je nutná ruční kontrola.',
            code: 'reverse_failed',
            status: 'refund_pending',
          },
          500,
        )
      }

      return json(
        {
          success: false,
          error: 'Stripe refundace selhala. MioCoiny byly vráceny zpět, platba je označená jako Refundace selhala a vyžaduje ruční kontrolu.',
          code: 'stripe_refund_failed',
          status: 'refund_failed',
        },
        409,
      )
    }

    if (refundStatus === 'pending' || refundStatus === 'requires_action') {
      // Platba zůstává `refund_pending`. Dokončí ji buď webhook, nebo další
      // ruční ověření stavu z administrace.
      return json(
        {
          success: true,
          pending: true,
          message: 'Refundace byla přijata a čeká na dokončení u Stripe.',
          refund_id: refundId,
          status: 'refund_pending',
          stripe_refund_status: refundStatus,
        },
        202,
      )
    }

    if (refundStatus !== 'succeeded') {
      console.error('unexpected Stripe refund status', { payment_id: paymentId, refund_status: refundStatus })
      return json(
        {
          error: `Stripe refundace je ve stavu: ${refundStatus ?? 'neznámý'}. Refundace zůstává rozpracovaná.`,
          code: 'stripe_refund_unexpected_status',
          status: 'refund_pending',
        },
        502,
      )
    }

    // 5. Dokončení stavu — jen po `succeeded`.
    //    Bez úspěšného uložení se NIKDY nevrací úspěch.
    const { data: finalized, error: finalizeError } = await supabaseClient.rpc(
      'finalize_stripe_refund',
      { p_payment_id: paymentId },
    )

    const fin = finalized as { ok?: boolean; code?: string } | null

    if (finalizeError || !fin || fin.ok !== true) {
      console.error('finalize_stripe_refund failed', {
        payment_id: paymentId,
        code: finalizeError?.code ?? fin?.code ?? 'unknown',
      })
      return json(
        {
          error: 'Peníze byly u Stripe vráceny, ale nepodařilo se uložit stav platby. Zopakujte akci — druhá refundace nevznikne.',
          code: 'finalize_failed',
          status: 'refund_pending',
        },
        500,
      )
    }

    // 6. Audit — bez Stripe session ID, bez tokenů a bez osobních údajů.
    const { error: auditError } = await supabaseClient
      .from('audit_logs')
      .insert({
        event: 'payment_refunded',
        user_id: user.id,
        metadata: {
          payment_id: paymentId,
          stripe_refund_id: refundId,
          amount,
          admin_id: user.id,
          already_prepared: prep.already_prepared === true,
        },
      })

    if (auditError) {
      console.error('audit log write failed', { payment_id: paymentId, code: auditError.code })
    }

    return json(
      {
        success: true,
        message: 'Platba byla refundována a MioCoiny odečteny.',
        refund_id: refundId,
        status: 'refunded',
      },
      200,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Refund error', { payment_id: paymentId, message })
    return json({ error: 'Refundaci se nepodařilo dokončit.' }, 500)
  }
})
