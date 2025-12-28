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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from auth header
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action } = await req.json();
    const actionType = action === 'subscribe' ? 'přihlášení' : 'odhlášení';
    
    const now = new Date();
    const datetime = now.toLocaleString('cs-CZ', { 
      timeZone: 'Europe/Prague',
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const title = 'Změna marketingových sdělení';
    const message = `Došlo ke změně nastavení marketingových sdělení ve vašem účtu OneMil.\n\nDatum a čas: ${datetime}\n\nPokud jste změnu neprovedli vy, kontaktujte podporu.`;

    console.log(`📧 Odesílám notifikaci o ${actionType} marketingu pro uživatele:`, user.id);

    // Get user's device player_id for push notification
    const { data: devices } = await supabaseClient
      .from('user_devices')
      .select('player_id')
      .eq('user_id', user.id)
      .eq('device_type', 'web')
      .limit(1)
      .maybeSingle();

    const results = {
      push_sent: false,
      email_sent: false,
      push_error: null as string | null,
      email_error: null as string | null
    };

    const oneSignalApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
    const appId = '5e5539e1-fc71-4c4d-9fef-414293d83dbb';

    // Send push notification if player_id exists
    if (devices?.player_id && oneSignalApiKey) {
      try {
        console.log('📲 Odesílám push notifikaci na player_id:', devices.player_id);
        
        const pushResponse = await fetch('https://onesignal.com/api/v1/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${oneSignalApiKey}`
          },
          body: JSON.stringify({
            app_id: appId,
            include_player_ids: [devices.player_id],
            headings: { cs: title, en: title },
            contents: { cs: message, en: message },
            web_url: 'https://onemil.lovable.app/profile'
          })
        });

        const pushData = await pushResponse.json();
        
        if (pushResponse.ok) {
          results.push_sent = true;
          console.log('✅ Push notifikace odeslána:', pushData);
        } else {
          results.push_error = pushData.errors?.[0] || 'Push notification failed';
          console.error('❌ Push error:', pushData);
        }
      } catch (e: any) {
        results.push_error = e.message;
        console.error('❌ Push exception:', e);
      }
    } else {
      console.log('ℹ️ Push notifikace přeskočena - player_id nenalezen');
    }

    // Send email via OneSignal
    if (user.email && oneSignalApiKey) {
      try {
        console.log('📧 Odesílám email na:', user.email);
        
        const emailResponse = await fetch('https://onesignal.com/api/v1/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${oneSignalApiKey}`
          },
          body: JSON.stringify({
            app_id: appId,
            include_email_tokens: [user.email],
            email_subject: title,
            email_body: `
              <html>
                <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
                  <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px;">
                    <h2 style="color: #333; margin-bottom: 20px;">${title}</h2>
                    <p style="color: #555; line-height: 1.6;">
                      Došlo ke změně nastavení marketingových sdělení ve vašem účtu OneMil.
                    </p>
                    <p style="color: #555; line-height: 1.6;">
                      <strong>Datum a čas:</strong> ${datetime}
                    </p>
                    <p style="color: #888; margin-top: 30px; font-size: 14px;">
                      Pokud jste změnu neprovedli vy, kontaktujte podporu.
                    </p>
                  </div>
                </body>
              </html>
            `
          })
        });

        const emailData = await emailResponse.json();
        
        if (emailResponse.ok && !emailData.errors) {
          results.email_sent = true;
          console.log('✅ Email odeslán:', emailData);
        } else {
          results.email_error = emailData.errors?.[0] || 'Email sending failed';
          console.error('❌ Email error:', emailData);
        }
      } catch (e: any) {
        results.email_error = e.message;
        console.error('❌ Email exception:', e);
      }
    } else {
      console.log('ℹ️ Email přeskočen - chybí email nebo API klíč');
    }

    // Log to notifications table
    await supabaseClient
      .from('notifications')
      .insert({
        user_id: user.id,
        type: 'marketing_consent_change',
        title: title,
        message: message,
        status: 'sent',
        push_delivered: results.push_sent,
        push_response: results
      });

    console.log('📊 Výsledky notifikace:', results);

    return new Response(
      JSON.stringify({ 
        success: true, 
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('💥 Chyba:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
