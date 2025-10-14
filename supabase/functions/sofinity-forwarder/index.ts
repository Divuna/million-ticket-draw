import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ForwardRequest {
  table_name: string;
  record_id: string;
  event_name: string;
  metadata: any;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff in ms

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get request data
    const { table_name, record_id, event_name, metadata }: ForwardRequest = await req.json();

    console.log('Processing forward request:', { table_name, record_id, event_name });

    // Prepare payload for Sofinity
    const sofinityPayload = {
      project_id: "defababe-004b-4c63-9ff1-311540b0a3c9",
      event_name,
      metadata: {
        ...metadata,
        source_table: table_name,
        record_id
      },
      source_system: "onemil",
      user_id: metadata.user_id || null,
      contest_id: metadata.contest_id || null
    };

    // Log the attempt to event_forward_log
    const { data: logEntry, error: logError } = await supabase
      .from('event_forward_log')
      .insert({
        table_name,
        record_id,
        event_name,
        payload: sofinityPayload,
        status: 'pending'
      })
      .select()
      .single();

    if (logError) {
      console.error('Error creating log entry:', logError);
      throw new Error(`Failed to create log entry: ${logError.message}`);
    }

    console.log('Log entry created:', logEntry.id);

    // Get Sofinity configuration
    const sofinityUrl = Deno.env.get('SOFINITY_URL');
    const sofinityServiceKey = Deno.env.get('SOFINITY_SERVICE_KEY');

    if (!sofinityUrl || !sofinityServiceKey) {
      console.error('Missing Sofinity configuration');
      
      // Update log entry with error
      await supabase
        .from('event_forward_log')
        .update({
          status: 'failed',
          error_message: 'Sofinity configuration not found',
          updated_at: new Date().toISOString()
        })
        .eq('id', logEntry.id);

      throw new Error('Sofinity configuration not found');
    }

    // Send to Sofinity with retry logic
    let lastError: Error | null = null;
    let sofinityResponse: Response | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        console.log(`Sending to Sofinity (attempt ${attempt + 1}/${MAX_RETRIES})`);
        
        sofinityResponse = await fetch(`${sofinityUrl}/rest/v1/EventLogs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sofinityServiceKey}`,
            'apikey': sofinityServiceKey,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(sofinityPayload)
        });

        if (sofinityResponse.ok) {
          // Success - break the retry loop
          break;
        } else {
          // Log the error but continue to retry
          const errorData = await sofinityResponse.json().catch(() => null);
          console.error(`Sofinity API error (attempt ${attempt + 1}):`, {
            status: sofinityResponse.status,
            statusText: sofinityResponse.statusText,
            data: errorData
          });
          lastError = new Error(`Sofinity API error: ${sofinityResponse.status} ${sofinityResponse.statusText}`);
        }
      } catch (error: any) {
        console.error(`Network error on attempt ${attempt + 1}:`, error);
        lastError = error;
      }

      // Wait before retrying (if not the last attempt)
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
      }
    }

    // Check if we succeeded
    if (!sofinityResponse || !sofinityResponse.ok) {
      // All retries failed
      await supabase
        .from('event_forward_log')
        .update({
          status: 'failed',
          error_message: lastError?.message || 'Unknown error',
          retry_count: MAX_RETRIES,
          updated_at: new Date().toISOString()
        })
        .eq('id', logEntry.id);

      throw lastError || new Error('Failed to send to Sofinity after retries');
    }

    // Success
    const sofinityData = await sofinityResponse.json().catch(() => null);
    console.log('Event sent to Sofinity successfully:', sofinityData);

    // Update log entry with success
    await supabase
      .from('event_forward_log')
      .update({
        status: 'success',
        response_data: sofinityData,
        updated_at: new Date().toISOString()
      })
      .eq('id', logEntry.id);

    return new Response(JSON.stringify({
      success: true,
      log_id: logEntry.id,
      sofinity_response: sofinityData
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });

  } catch (error: any) {
    console.error('Error in sofinity-forwarder function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      {
        status: 500,
        headers: { 
          'Content-Type': 'application/json', 
          ...corsHeaders 
        },
      }
    );
  }
};

serve(handler);
