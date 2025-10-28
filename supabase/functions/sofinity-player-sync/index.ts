import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PlayerSyncRequest {
  email: string;
  player_id: string;
  device_type?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get JWT from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[sofinity-player-sync] Missing Authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { email, player_id, device_type = 'web' } = await req.json() as PlayerSyncRequest;

    if (!email || !player_id) {
      console.error('[sofinity-player-sync] Missing required fields:', { email, player_id });
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, player_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sofinity-player-sync] Syncing player for email: ${email}, player_id: ${player_id}`);

    // Step 1: Save player_id to OneMil users table
    const { data: updateData, error: updateError } = await supabase
      .from('users')
      .update({ onesignal_player_id: player_id })
      .eq('email', email)
      .select('id, email, onesignal_player_id');

    if (updateError) {
      console.error('[sofinity-player-sync] Failed to update OneMil user:', updateError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Database update failed',
          details: updateError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!updateData || updateData.length === 0) {
      console.warn(`[sofinity-player-sync] No user found with email: ${email}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'User not found' 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[sofinity-player-sync] OneMil user updated successfully:', updateData[0]);

    // Step 2: Forward to Sofinity endpoint
    const sofinityUrl = 'https://rrmvxsldrjgbdxluklka.supabase.co/functions/v1/player-sync-receiver';
    const sofinityPayload = {
      email,
      player_id,
      device_type,
      user_id: updateData[0].id,
      timestamp: new Date().toISOString(),
    };

    console.log('[sofinity-player-sync] Forwarding to Sofinity:', sofinityPayload);

    const sofinityResponse = await fetch(sofinityUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify(sofinityPayload),
    });

    const sofinityData = await sofinityResponse.json();
    
    if (!sofinityResponse.ok) {
      console.error('[sofinity-player-sync] Sofinity forwarding failed:', sofinityData);
      // Still return success since OneMil DB was updated
      return new Response(
        JSON.stringify({ 
          success: true, 
          onemil_updated: true,
          sofinity_updated: false,
          sofinity_error: sofinityData,
          message: 'Player ID uložen v OneMil, ale synchronizace se Sofinity selhala'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[sofinity-player-sync] Sofinity forwarding successful:', sofinityData);

    // Log success to event_forward_log
    await supabase
      .from('event_forward_log')
      .insert({
        table_name: 'users',
        record_id: updateData[0].id,
        event_name: 'player_sync',
        payload: sofinityPayload,
        status: 'success',
        response_data: sofinityData,
      });

    return new Response(
      JSON.stringify({ 
        success: true, 
        onemil_updated: true,
        sofinity_updated: true,
        user: updateData[0],
        sofinity_response: sofinityData,
        message: 'Player ID úspěšně synchronizován'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[sofinity-player-sync] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
