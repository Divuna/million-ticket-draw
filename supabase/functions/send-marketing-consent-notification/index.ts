import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {
  escapeEmailHtml,
  renderOneMilDetailRows,
  renderOneMilEmail,
} from '../_shared/oneMilEmailTemplate.ts';

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
    const appId = '357be038-dbaf-4551-9a16-96d9897197a3';

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
            email_body: renderOneMilEmail({
              preheader: 'Potvrzení změny nastavení marketingových sdělení.',
              eyebrow: 'Nastavení účtu',
              title,
              bodyHtml: `
                <p style="margin:0 0 18px;">Došlo ke změně nastavení marketingových sdělení ve vašem účtu OneMil.</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7EBDD;border:1px solid #F2A16B;border-radius:12px;border-collapse:separate;overflow:hidden;">
                  ${renderOneMilDetailRows([
                    { label: 'Změna', value: escapeEmailHtml(actionType) },
                    { label: 'Datum a čas', value: escapeEmailHtml(datetime) },
                  ])}
                </table>
              `,
              action: {
                label: 'Zkontrolovat nastavení',
                url: 'https://onemil.cz/profile',
              },
              footerNote: 'Pokud jste změnu neprovedli vy, kontaktujte podporu OneMil.',
            })
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
