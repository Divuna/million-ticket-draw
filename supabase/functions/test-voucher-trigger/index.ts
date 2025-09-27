import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Database } from '../_shared/database.types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient<Database>(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { testUserId } = await req.json()
    
    if (!testUserId) {
      return new Response(
        JSON.stringify({ error: 'testUserId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Clear any existing test vouchers
    await supabase
      .from('vouchers')
      .delete()
      .or('name.like.Test Voucher%,name.like.Premium Shopping%')

    // Create test voucher (should NOT trigger notification)
    console.log('Creating test voucher...')
    const { data: testVoucher, error: testError } = await supabase
      .from('vouchers')
      .insert({
        name: 'Test Voucher 1',
        image_url: '/placeholder.svg',
        banner_url: '/placeholder_banner.svg',
        max_quantity: 5,
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        user_id: testUserId,
        redeemed_count: 0
      })
      .select()
      .single()

    if (testError) {
      console.error('Test voucher error:', testError)
      return new Response(
        JSON.stringify({ error: 'Failed to create test voucher', details: testError }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Create real voucher (should trigger notification)
    console.log('Creating real voucher...')
    const { data: realVoucher, error: realError } = await supabase
      .from('vouchers')
      .insert({
        name: 'Premium Shopping Voucher',
        image_url: '/placeholder.svg',
        banner_url: '/placeholder_banner.svg',
        max_quantity: 10,
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        user_id: testUserId,
        redeemed_count: 0
      })
      .select()
      .single()

    if (realError) {
      console.error('Real voucher error:', realError)
      return new Response(
        JSON.stringify({ error: 'Failed to create real voucher', details: realError }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Wait a moment for potential trigger execution
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Check for notifications in event_logs
    const { data: eventLogs, error: logError } = await supabase
      .from('event_logs')
      .select('*')
      .eq('event_name', 'voucher_purchased')
      .gte('timestamp', new Date(Date.now() - 5000).toISOString()) // Last 5 seconds
      .order('timestamp', { ascending: false })

    if (logError) {
      console.error('Event log error:', logError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        testVoucher,
        realVoucher,
        eventLogs: eventLogs || [],
        triggerTest: {
          testVoucherShouldNotTrigger: !eventLogs?.some(log => 
            log.metadata?.voucher_id === testVoucher.id
          ),
          realVoucherShouldTrigger: eventLogs?.some(log => 
            log.metadata?.voucher_id === realVoucher.id
          )
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Function error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})