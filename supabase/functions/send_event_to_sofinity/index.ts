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

    // Get Sofinity API key from settings
    const { data: settingsData, error: settingsError } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'sofinity_api_key')
      .single();

    if (settingsError || !settingsData?.value) {
      console.error('Failed to retrieve Sofinity API key from settings:', settingsError);
      throw new Error('Sofinity API key not configured in settings');
    }

    const sofinityApiKey = settingsData.value;
    const sofinityUrl = Deno.env.get('SOFINITY_URL');

    if (!sofinityUrl) {
      console.error('Missing Sofinity URL configuration');
      throw new Error('Sofinity URL not found');
    }

    // Generate security headers
    const requestTimestamp = new Date().toISOString();
    const idempotencyKey = crypto.randomUUID();
    const bodyString = JSON.stringify(sofinityPayload);

    // Generate HMAC-SHA256 signature
    const encoder = new TextEncoder();
    const keyData = encoder.encode(sofinityApiKey);
    const messageData = encoder.encode(bodyString + requestTimestamp);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    const signature = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');

    console.log('Security headers:', {
      timestamp: requestTimestamp,
      idempotencyKey,
      signatureLength: signature.length
    });

    // Send to Sofinity edge function endpoint
    const sofinityResponse = await fetch(`${sofinityUrl}/functions/v1/sofinity-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': sofinityApiKey,
        'x-api-key': sofinityApiKey,
        'x-signature': signature,
        'x-timestamp': requestTimestamp,
        'x-idempotency-key': idempotencyKey,
        'Prefer': 'return=representation'
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