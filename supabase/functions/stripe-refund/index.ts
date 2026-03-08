import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Verify JWT and admin role
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Verify admin role
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: admin role required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    const { payment_id } = await req.json()

    if (!payment_id) {
      return new Response(
        JSON.stringify({ error: 'Missing payment_id' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Fetch the payment record
    const { data: payment, error: paymentError } = await supabaseClient
      .from('payments')
      .select('*')
      .eq('id', payment_id)
      .single()

    if (paymentError || !payment) {
      return new Response(
        JSON.stringify({ error: 'Payment not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    if (payment.status === 'refunded') {
      return new Response(
        JSON.stringify({ error: 'Payment already refunded' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (payment.status !== 'completed') {
      return new Response(
        JSON.stringify({ error: 'Only completed payments can be refunded' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (!payment.stripe_session_id) {
      return new Response(
        JSON.stringify({ error: 'No Stripe session ID found for this payment' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Initialize Stripe and retrieve the payment intent from the checkout session
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    })

    const session = await stripe.checkout.sessions.retrieve(payment.stripe_session_id)

    if (!session.payment_intent) {
      return new Response(
        JSON.stringify({ error: 'No payment intent found for this Stripe session' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent.id

    // Issue Stripe refund
    console.log(`Issuing Stripe refund for payment_intent: ${paymentIntentId}`)
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
    })

    console.log(`Stripe refund created: ${refund.id}, status: ${refund.status}`)

    if (refund.status !== 'succeeded' && refund.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: `Stripe refund failed with status: ${refund.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Update payment status to 'refunded'
    const { error: updateError } = await supabaseClient
      .from('payments')
      .update({ status: 'refunded' })
      .eq('id', payment_id)

    if (updateError) {
      console.error('Error updating payment status:', updateError)
      // Stripe refund succeeded but DB update failed — log but don't fail
    }

    // Subtract coins from user's wallet
    const coinsToSubtract = payment.amount
    const { data: wallet } = await supabaseClient
      .from('wallets')
      .select('balance_coins')
      .eq('user_id', payment.user_id)
      .maybeSingle()

    if (wallet) {
      const newBalance = Math.max(0, wallet.balance_coins - coinsToSubtract)
      const { error: walletError } = await supabaseClient
        .from('wallets')
        .update({ balance_coins: newBalance })
        .eq('user_id', payment.user_id)

      if (walletError) {
        console.error('Error updating wallet:', walletError)
      } else {
        console.log(`Wallet updated for user ${payment.user_id}: ${wallet.balance_coins} -> ${newBalance}`)
      }
    }

    // Write audit log
    const { error: auditError } = await supabaseClient
      .from('audit_logs')
      .insert({
        event: 'payment_refunded',
        user_id: payment.user_id,
        metadata: {
          payment_id: payment_id,
          stripe_session_id: payment.stripe_session_id,
          stripe_refund_id: refund.id,
          amount: coinsToSubtract,
          admin_id: user.id,
        },
      })

    if (auditError) {
      console.error('Error writing audit log:', auditError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Platba byla úspěšně refundována.',
        refund_id: refund.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Refund error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
