import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { decode } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PlayerSyncRequest {
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

    // Get JWT from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[sofinity-player-sync] Missing Authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract and decode JWT to get user_id and email
    const token = authHeader.replace('Bearer ', '');
    
    let userId: string;
    let userEmail: string;
    
    try {
      // JWT structure: header.payload.signature
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }
      
      // Decode the payload (second part)
      const payload = parts[1];
      // Add padding if needed for base64 decoding
      const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
      const decodedBytes = decode(paddedPayload);
      const decodedPayload = JSON.parse(new TextDecoder().decode(decodedBytes));
      
      console.log('[sofinity-player-sync] Decoded JWT payload:', {
        sub: decodedPayload.sub,
        email: decodedPayload.email,
        hasOtherClaims: Object.keys(decodedPayload).length
      });
      
      // Extract user_id (sub claim) and email
      userId = decodedPayload.sub;
      userEmail = decodedPayload.email;
      
      if (!userId) {
        console.error('[sofinity-player-sync] CRITICAL: user_id (sub claim) is missing from JWT payload');
      }
      
      if (!userId || !userEmail) {
        throw new Error('Missing sub or email in JWT payload');
      }
    } catch (decodeError) {
      console.error('[sofinity-player-sync] JWT decode error:', decodeError);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid JWT token', 
          details: decodeError instanceof Error ? decodeError.message : String(decodeError)
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sofinity-player-sync] Authenticated user from JWT: user_id=${userId}, email=${userEmail}`);

    // Parse request body
    const { player_id, device_type = 'web' } = await req.json() as PlayerSyncRequest;

    if (!player_id) {
      console.error('[sofinity-player-sync] Missing required field: player_id');
      return new Response(
        JSON.stringify({ error: 'Missing required field: player_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sofinity-player-sync] Syncing player for user_id: ${userId}, email: ${userEmail}, player_id: ${player_id}`);

    // Use service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Save player_id to OneMil users table
    const { data: updateData, error: updateError } = await supabase
      .from('users')
      .update({ onesignal_player_id: player_id })
      .eq('id', userId)
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
      console.warn(`[sofinity-player-sync] No user found with id: ${userId}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'User not found' 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[sofinity-player-sync] OneMil user updated successfully:', {
      userId,
      email: updateData[0].email,
      onesignal_player_id: updateData[0].onesignal_player_id
    });

    // Step 2: Forward to Sofinity endpoint with user_id and email from JWT
    const sofinityUrl = 'https://rrmvxsldrjgbdxluklka.supabase.co/functions/v1/player-sync-receiver';
    const sofinityPayload = {
      email: userEmail,
      player_id,
      device_type,
      user_id: userId,
      timestamp: new Date().toISOString(),
    };

    console.log('[sofinity-player-sync] Forwarding to Sofinity with user_id:', {
      ...sofinityPayload,
      user_id_confirmed: !!userId
    });

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
