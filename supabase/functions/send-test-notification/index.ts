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

    // Resolve OneSignal recipient with fallback chain:
    // 1) user_devices.onesignal_player_id (latest device)
    // 2) users.onesignal_player_id
    // 3) user_devices.player_id
    let playerId: string | null = null;

    const { data: deviceRows } = await supabaseClient
      .from('user_devices')
      .select('onesignal_player_id, player_id, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (deviceRows && deviceRows.length > 0) {
      playerId = deviceRows.find((d: { onesignal_player_id?: string | null }) => d.onesignal_player_id)?.onesignal_player_id ?? null;
    }

    if (!playerId) {
      const { data: userRow } = await supabaseClient
        .from('users')
        .select('onesignal_player_id')
        .eq('id', user.id)
        .single();
      playerId = userRow?.onesignal_player_id ?? null;
    }

    if (!playerId && deviceRows && deviceRows.length > 0) {
      playerId = deviceRows.find((d: { player_id?: string | null }) => d.player_id)?.player_id ?? null;
    }

    if (!playerId) {
      console.error('❌ OneSignal recipient nenalezen pro uživatele:', user.id);
      return new Response(
        JSON.stringify({ error: 'Pro toto zařízení nebylo nalezeno žádné OneSignal ID. Povolte nejprve notifikace v prohlížeči.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('📲 Odesílám test notifikaci na player_id:', playerId);

    // Send notification via OneSignal API
    const oneSignalResponse = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Deno.env.get('ONESIGNAL_REST_API_KEY')}`
      },
      body: JSON.stringify({
        app_id: '357be038-dbaf-4551-9a16-96d9897197a3',
        include_player_ids: [playerId],
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
        player_id: playerId,
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
