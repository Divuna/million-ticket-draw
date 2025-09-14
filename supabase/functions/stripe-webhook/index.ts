import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Database {
  public: {
    Tables: {
      payments: {
        Insert: {
          user_id: string
          amount: number
          method: string
          status: string
          stripe_session_id?: string
        }
      }
      wallets: {
        Row: {
          user_id: string
          balance_coins: number
          balance_vouchers: number
        }
        Update: {
          balance_coins?: number
          balance_vouchers?: number
        }
      }
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    })

    const supabaseClient = createClient<Database>(
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

    // Verify webhook signature
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message)
      return new Response(
        JSON.stringify({ error: 'Webhook signature verification failed' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    console.log('Received webhook event:', event.type)

    // Handle successful payment
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      
      const userId = session.metadata?.user_id
      const amount = parseInt(session.metadata?.amount || '0')
      
      if (!userId || !amount) {
        throw new Error('Missing user_id or amount in session metadata')
      }

      console.log(`Processing payment for user ${userId}, amount: ${amount}, session: ${session.id}`)

      // Check if payment already processed (idempotency)
      const { data: existingPayment } = await supabaseClient
        .from('payments')
        .select('id')
        .eq('stripe_session_id', session.id)
        .single()

      if (existingPayment) {
        console.log(`Payment already processed for session ${session.id}`)
        return new Response(
          JSON.stringify({ received: true, message: 'Payment already processed' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        )
      }

      // Insert payment record - the database trigger will handle wallet updates
      const { error: paymentError } = await supabaseClient
        .from('payments')
        .insert({
          user_id: userId,
          amount: amount,
          method: 'stripe',
          status: 'completed',
          stripe_session_id: session.id
        })

      if (paymentError) {
        console.error('Error inserting payment:', paymentError)
        throw new Error('Failed to record payment')
      }

      console.log(`Successfully recorded payment for user ${userId}, wallet will be updated by trigger`)
    }

    return new Response(
      JSON.stringify({ received: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})