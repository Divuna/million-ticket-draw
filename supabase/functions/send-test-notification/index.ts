import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // JWT auth guard
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🧪 Test notifikace pro uživatele:', user.id);

    // Get user's device player_id
    const { data: devices, error: deviceError } = await supabaseClient
      .from('user_devices')
      .select('player_id')
      .eq('user_id', user.id)
      .eq('device_type', 'web')
      .limit(1)
      .single();

    if (deviceError || !devices?.player_id) {
      console.error('❌ Player ID nenalezen:', deviceError);
      return new Response(
        JSON.stringify({ error: 'Player ID nenalezen. Povolte nejprve notifikace.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('📲 Odesílám test notifikaci na player_id:', devices.player_id);

    // Send notification via OneSignal API
    const oneSignalResponse = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Deno.env.get('ONESIGNAL_REST_API_KEY')}`
      },
      body: JSON.stringify({
        app_id: '5e5539e1-fc71-4c4d-9fef-414293d83dbb',
        include_player_ids: [devices.player_id],
        headings: { en: 'Test notifikace' },
        contents: { en: 'Gratulujeme! Notifikace fungují správně. 🎉' },
        web_url: Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.lovable.app') || 'https://onemil.lovable.app'
      })
    });

    const oneSignalData = await oneSignalResponse.json();

    if (!oneSignalResponse.ok) {
      console.error('❌ OneSignal API error:', oneSignalData);
      return new Response(
        JSON.stringify({ error: 'Chyba při odeslání notifikace', details: oneSignalData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Test notifikace odeslána:', oneSignalData);

    // Log to notifications table
    await supabaseClient
      .from('notifications')
      .insert({
        user_id: user.id,
        type: 'test',
        title: 'Test notifikace',
        message: 'Gratulujeme! Notifikace fungují správně. 🎉',
        status: 'sent',
        push_delivered: true,
        push_response: oneSignalData
      });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Notifikace odeslána',
        player_id: devices.player_id,
        notification_id: oneSignalData.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('💥 Chyba:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
