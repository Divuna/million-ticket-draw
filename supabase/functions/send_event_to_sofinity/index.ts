import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

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
      event_name,
      user_id,
      contest_id,
      metadata,
      timestamp: timestamp || new Date().toISOString(),
      audit_log_id: auditLog.id
    };

    // Send to Sofinity API
    const sofinityUrl = Deno.env.get('SOFINITY_URL');
    const sofinityKey = Deno.env.get('SOFINITY_SHARED_KEY');

    if (!sofinityUrl || !sofinityKey) {
      console.error('Missing Sofinity configuration');
      throw new Error('Sofinity configuration not found');
    }

    const sofinityResponse = await fetch(sofinityUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sofinityKey}`,
        'X-Shared-Key': sofinityKey
      },
      body: JSON.stringify(sofinityPayload)
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