import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import type { Database } from '../_shared/database.types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EventRequest {
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get request data
    const { event_name, user_id, contest_id, metadata, timestamp }: EventRequest = await req.json();

    console.log('Processing event:', { event_name, user_id, contest_id, metadata });

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

    // Send to Sofinity API with all security headers
    const sofinityResponse = await fetch(`${sofinityUrl}/rest/v1/EventLogs`, {
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

    return new Response(JSON.stringify({
      success: true,
      audit_log_id: auditLog.id,
      sofinity_response: sofinityData
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });

  } catch (error: any) {
    console.error('Error in send_event_to_sofinity function:', error);
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