import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client without strict typing
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { days = 7 } = await req.json().catch(() => ({}));
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    console.log(`Repairing missing events for the last ${days} days from ${startDate.toISOString()}`);

    let generatedCount = 0;

    // Generate sample repair events for testing
    const sampleEvents = [
      'user_registered',
      'voucher_purchased',
      'coin_redeemed',
      'contest_closed',
      'prize_won',
      'notification_sent'
    ];

    for (const eventType of sampleEvents) {
      try {
        const { error } = await supabase
          .from('event_logs')
          .insert({
            event_name: eventType,
            user_id: null,
            metadata: {
              generated_by_repair: true,
              repair_date: new Date().toISOString(),
              test_event: true
            },
            timestamp: new Date().toISOString()
          });

        if (!error) {
          generatedCount++;
          console.log(`Generated ${eventType} event for testing`);
        }
      } catch (insertError) {
        console.error(`Error inserting ${eventType}:`, insertError);
      }
    }

    const response = {
      success: true,
      message: `Successfully generated ${generatedCount} test events for repair simulation`,
      generated_count: generatedCount,
      time_period: {
        days,
        from: startDate.toISOString(),
        to: new Date().toISOString()
      }
    };

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error in repair-missing-events function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        message: errorMessage 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})