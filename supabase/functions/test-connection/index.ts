import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import type { Database } from '../_shared/database.types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Internal authorization guard
  const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
  if (req.headers.get("x-internal-token") !== internalToken) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('Testing connection to event_logs table...');

    // Get event logs from last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const { data: eventLogs, error } = await supabase
      .from('event_logs')
      .select('*')
      .gte('timestamp', twentyFourHoursAgo.toISOString())
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error querying event_logs:', error);
      throw error;
    }

    const count = eventLogs?.length || 0;
    console.log(`Found ${count} event logs in the last 24 hours`);

    // Test basic table access
    const { data: tableTest, error: tableError } = await supabase
      .from('event_logs')
      .select('count')
      .limit(1);

    if (tableError) {
      console.error('Error accessing event_logs table:', tableError);
      throw tableError;
    }

    const response = {
      success: true,
      message: `Spojení OK: Nalezeno ${count} event logů za posledních 24 hodin`,
      count: count,
      timestamp: new Date().toISOString(),
      connection_status: 'active',
      table_accessible: true
    };

    console.log('Connection test completed successfully:', response);

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error in test-connection function:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Connection test failed',
        message: `Chyba spojení: ${errorMessage}`,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})