import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import type { Database } from '../_shared/database.types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EventRequest {
  queue_id?: string;
  event_name: string;
  user_id?: string;
  contest_id?: string;
  metadata?: any;
  timestamp?: string;
}

const handler = async (req: Request): Promise<Response> => {
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
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // Get request data
    const { queue_id, event_name, user_id, contest_id, metadata, timestamp }: EventRequest = await req.json();

    console.log('Processing event:', { queue_id, event_name, user_id, contest_id, metadata });

    // If queue_id provided, update status to processing
    if (queue_id) {
      const { error: updateError } = await supabase
        .from('event_queue')
        .update({ status: 'processing' })
        .eq('id', queue_id);

      if (updateError) {
        console.error('Error updating queue status to processing:', updateError);
      }
    }

    // Prepare audit log data
    const auditData = {
      event: event_name,
      user_id: user_id || null,
      metadata: {
        contest_id,
        timestamp: timestamp || new Date().toISOString(),
        ...metadata
      }
    };

    // Insert into audit_logs
    const { data: auditLog, error: auditError } = await supabase
      .from('audit_logs')
      .insert(auditData)
      .select()
      .single();

    if (auditError) {
      console.error('Error inserting audit log:', auditError);
      throw new Error(`Failed to insert audit log: ${auditError.message}`);
    }

    console.log('Audit log created:', auditLog);

    // Prepare Sofinity payload
    const sofinityPayload = {
      project_id: "defababe-004b-4c63-9ff1-311540b0a3c9",
      event_name,
      user_id,
      contest_id: contest_id || null,
      source_system: 'onemil',
      metadata: metadata || {}
    };

    console.log('Sofinity payload:', JSON.stringify(sofinityPayload, null, 2));

    // Get Sofinity API credentials from environment variables
    const sofinityApiUrl = Deno.env.get('SOFINITY_API_URL');
    const sofinityApiKey = Deno.env.get('SOFINITY_API_KEY');

    if (!sofinityApiUrl) {
      console.error('Missing SOFINITY_API_URL environment variable');
      throw new Error('SOFINITY_API_URL not configured');
    }

    if (!sofinityApiKey) {
      console.error('Missing SOFINITY_API_KEY environment variable');
      throw new Error('SOFINITY_API_KEY not configured');
    }

    const bodyString = JSON.stringify(sofinityPayload);

    console.log('Sending to Sofinity API:', sofinityApiUrl);

    // Send to Sofinity API with Bearer token authorization
    const sofinityResponse = await fetch(sofinityApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sofinityApiKey}`
      },
      body: bodyString
    });

    const sofinityData = await sofinityResponse.json().catch(() => null);

    if (!sofinityResponse.ok) {
      console.error('Sofinity API error:', {
        status: sofinityResponse.status,
        statusText: sofinityResponse.statusText,
        data: sofinityData
      });
      throw new Error(`Sofinity API error: ${sofinityResponse.status} ${sofinityResponse.statusText}`);
    }

    console.log('Event sent to Sofinity successfully:', sofinityData);

    // Update queue status to completed if queue_id provided
    if (queue_id) {
      await supabase
        .from('event_queue')
        .update({ 
          status: 'completed',
          processed_at: new Date().toISOString()
        })
        .eq('id', queue_id);
    }

    return new Response(JSON.stringify({
      success: true,
      audit_log_id: auditLog.id,
      sofinity_response: sofinityData,
      queue_id
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });

  } catch (error: any) {
    console.error('Error in send_event_to_sofinity function:', error);
    
    // Try to extract queue_id from request if available
    let queue_id: string | undefined;
    try {
      const body = await req.clone().json();
      queue_id = body.queue_id;
    } catch {
      // Ignore parse errors
    }

    // Update queue status to failed if queue_id provided
    if (queue_id) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);
      
      await supabase
        .from('event_queue')
        .update({ 
          status: 'failed',
          last_error: error.message,
          retry_count: supabase.from('event_queue').select('retry_count').eq('id', queue_id).single().then(d => (d.data?.retry_count || 0) + 1)
        })
        .eq('id', queue_id);
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        queue_id
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