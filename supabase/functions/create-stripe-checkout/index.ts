import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Get user from JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }
    
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

    if (authError || !user) {
      console.error('Auth error:', authError)
      throw new Error('Unauthorized - could not verify user')
    }

    console.log('Creating checkout for user:', user.id)

    const body = await req.json()
    console.log('Received body:', JSON.stringify(body))
    
    // Extract and convert to clean numbers
    const priceInCzk = Number(body.priceInCzk)
    const totalCoins = Number(body.totalCoins)
    
    console.log('Parsed values:', { priceInCzk, totalCoins })

    // Validate inputs
    if (isNaN(priceInCzk) || priceInCzk < 50) {
      throw new Error(`Minimum price is 50 CZK. Received: ${body.priceInCzk} (type: ${typeof body.priceInCzk})`)
    }

    if (isNaN(totalCoins) || totalCoins < 50) {
      throw new Error(`Minimum coins is 50. Received: ${body.totalCoins} (type: ${typeof body.totalCoins})`)
    }

    // Get user email
    const { data: userData } = await supabaseClient
      .from('users')
      .select('email')
      .eq('id', user.id)
      .maybeSingle()

    const userEmail = userData?.email || user.email

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'czk',
            product_data: {
              name: 'OneMil MioCoiny',
              description: `${totalCoins} MioCoinů pro OneMil`,
            },
            unit_amount: priceInCzk * 100, // Stripe expects amount in smallest currency unit (haléře)
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: userEmail,
      metadata: {
        user_id: user.id,
        price_czk: priceInCzk.toString(),
        total_coins: totalCoins.toString(),
      },
      success_url: `${req.headers.get('origin')}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get('origin')}/payment-cancel`,
    })

    console.log('Stripe checkout session created:', session.id, 'for', totalCoins, 'coins at', priceInCzk, 'CZK')

    return new Response(
      JSON.stringify({ checkout_url: session.url }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error creating checkout session:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
