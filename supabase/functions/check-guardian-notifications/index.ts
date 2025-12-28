import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * This edge function runs daily to check for missed guardian notifications.
 * It finds all physical guardian-required prizes won by users under 18
 * and creates notifications if they don't already exist.
 * 
 * Can be triggered:
 * 1. Manually via HTTP request (for testing)
 * 2. Via Supabase scheduled job (pg_cron)
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startTime = Date.now()
  console.log('Starting guardian notifications check...')

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Call the batch function that checks all guardian-required prizes
    const { data, error } = await supabaseAdmin.rpc('check_guardian_notifications_batch')

    if (error) {
      console.error('Error running batch check:', error)
      throw error
    }

    const elapsedMs = Date.now() - startTime
    console.log(`Guardian notifications check completed in ${elapsedMs}ms:`, data)

    return new Response(
      JSON.stringify({
        success: true,
        ...data,
        elapsed_ms: elapsedMs
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    const elapsedMs = Date.now() - startTime
    console.error('Error in check-guardian-notifications:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        elapsed_ms: elapsedMs
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})