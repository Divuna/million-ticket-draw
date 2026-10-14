import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0'
import { getSupabaseSecretKey } from "../_shared/supabaseSecretKey.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LOG_SOURCE = 'onemil_edge_create_stripe_checkout'

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

/**
 * Bonus packages: CZK charged → total MioCoins (must match Homepage + Profile COIN_PACKAGES).
 */
const CZK_TO_COINS: Record<number, number> = {
  50: 50,
  300: 310,
  500: 525,
  1200: 1280,
}

/**
 * Derive MioCoins only from the CZK price (server truth). Allowlisted tiers include bonuses;
 * any other whole CZK ≥ 1 is 1:1 (Profile custom amount).
 */
function miocoinsForCzkPrice(priceCzk: number): number {
  if (!Number.isInteger(priceCzk) || priceCzk < 1) return 0
  const tier = CZK_TO_COINS[priceCzk]
  if (tier !== undefined) return tier
  return priceCzk
}

function getTrustedSiteBase(): string {
  const raw = (Deno.env.get('PUBLIC_APP_URL') ?? Deno.env.get('SITE_URL') ?? '').trim()
  const base = raw.replace(/\/+$/, '')
  if (!base) {
    throw new Error(
      'Set PUBLIC_APP_URL or SITE_URL (e.g. https://your-domain.com) for Stripe redirects',
    )
  }
  let url: URL
  try {
    url = new URL(base)
  } catch {
    throw new Error('PUBLIC_APP_URL / SITE_URL must be a valid absolute URL')
  }
  const host = url.hostname
  const isLocal = host === 'localhost' || host === '127.0.0.1'
  if (url.protocol !== 'https:' && !isLocal) {
    throw new Error('PUBLIC_APP_URL must use https:// in production')
  }
  return `${url.protocol}//${url.host}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      omLog('warn', 'checkout_auth_failed', {
        action: 'create_stripe_checkout',
        reason: 'invalid_or_expired_jwt',
        message: authError?.message,
      })
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getSupabaseSecretKey(),
    )

    omLog('info', 'checkout_request', {
      user_id: user.id,
      action: 'create_stripe_checkout',
    })

    let body: { priceInCzk?: unknown; totalCoins?: unknown; immediateUseConsent?: unknown } = {}
    try {
      const rawBody = await req.text()
      if (rawBody && rawBody.trim()) {
        body = JSON.parse(rawBody)
      }
    } catch (parseError) {
      omLog('error', 'checkout_body_parse_error', {
        user_id: user.id,
        action: 'create_stripe_checkout',
        message: parseError instanceof Error ? parseError.message : String(parseError),
      })
      throw new Error('Invalid JSON body')
    }

    // totalCoins from client is ignored — credits are derived from paid CZK in webhook only.
    if (body.totalCoins !== undefined) {
      omLog('warn', 'checkout_ignored_client_total_coins', {
        user_id: user.id,
        action: 'create_stripe_checkout',
      })
    }

    const rawPrice = Number(body.priceInCzk)
    const priceInCzk = Math.round(rawPrice)
    if (
      body.priceInCzk === undefined ||
      body.priceInCzk === null ||
      Number.isNaN(rawPrice) ||
      !Number.isInteger(priceInCzk) ||
      priceInCzk < 1
    ) {
      throw new Error('Invalid or missing priceInCzk (positive integer CZK required)')
    }

    const totalCoins = miocoinsForCzkPrice(priceInCzk)
    if (totalCoins < 1) {
      throw new Error('Invalid price tier')
    }

    // Souhlas s okamžitým použitím MIO. Znění a verzi spravuje OneMil v `settings`
    // (get_immediate_use_consent_config); dokud není schválené, je `required=false`
    // a nic se nevynucuje. Klient posílá jen potvrzení a verzi, kterou viděl.
    const { data: consentCfgRaw, error: consentCfgError } = await supabaseClient.rpc(
      'get_immediate_use_consent_config',
    )
    if (consentCfgError) {
      throw new Error('Could not load immediate-use consent configuration')
    }
    const consentCfg = (consentCfgRaw ?? {}) as { required?: boolean; version?: string; text?: string }
    const consentInput = body.immediateUseConsent as { accepted?: unknown; version?: unknown } | undefined
    const consentConfigured = typeof consentCfg.version === 'string' && consentCfg.version.length > 0 &&
      typeof consentCfg.text === 'string' && consentCfg.text.length > 0
    const consentAccepted = consentConfigured &&
      consentInput?.accepted === true &&
      consentInput?.version === consentCfg.version

    if (consentCfg.required === true && !consentAccepted) {
      omLog('warn', 'checkout_missing_immediate_use_consent', {
        user_id: user.id,
        action: 'create_stripe_checkout',
      })
      return new Response(
        JSON.stringify({
          error: 'Před platbou je nutné potvrdit souhlas s okamžitým použitím MIO.',
          code: 'immediate_use_consent_required',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let consentId: string | null = null
    if (consentAccepted) {
      const { data: consentRow, error: consentError } = await supabaseClient
        .from('payment_immediate_use_consents')
        .insert({
          user_id: user.id,
          consent_version: consentCfg.version,
          consent_text: consentCfg.text,
          price_czk: priceInCzk,
        })
        .select('id')
        .single()
      if (consentError || !consentRow) {
        throw new Error('Could not record immediate-use consent')
      }
      consentId = consentRow.id as string
    }

    const { data: userData } = await supabaseClient
      .from('users')
      .select('email')
      .eq('id', user.id)
      .maybeSingle()

    const userEmail = userData?.email || user.email

    const siteBase = getTrustedSiteBase()
    const unitAmountHalere = priceInCzk * 100
    if (!Number.isInteger(unitAmountHalere) || unitAmountHalere < 100) {
      throw new Error('Invalid Stripe unit amount')
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'czk',
            product_data: {
              name: 'OneMil MIO',
              description: `${totalCoins} MIO pro OneMil`,
            },
            unit_amount: unitAmountHalere,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: userEmail ?? undefined,
      metadata: {
        user_id: user.id,
        price_czk: String(priceInCzk),
        immediate_use_consent_id: consentId ?? '',
      },
      success_url: `${siteBase}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteBase}/payment-cancel`,
    })

    if (consentId) {
      const { error: consentLinkError } = await supabaseClient
        .from('payment_immediate_use_consents')
        .update({ stripe_session_id: session.id })
        .eq('id', consentId)
      if (consentLinkError) {
        omLog('error', 'checkout_consent_link_failed', {
          user_id: user.id,
          action: 'create_stripe_checkout',
          stripe_session_id: session.id,
          message: consentLinkError.message,
        })
      }
    }

    omLog('info', 'checkout_session_created', {
      user_id: user.id,
      action: 'create_stripe_checkout',
      stripe_session_id: session.id,
      price_czk: priceInCzk,
      miocoins_credited_plan: totalCoins,
    })

    return new Response(JSON.stringify({ checkout_url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    omLog('error', 'checkout_error', {
      action: 'create_stripe_checkout',
      message: errorMessage,
    })
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
