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

    // Get user from auth header and verify admin role
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      console.error('❌ Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: adminUser } = await supabaseClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!adminUser || !['admin', 'superadmin'].includes(adminUser.role)) {
      console.error('❌ User is not admin:', user.id);
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🚀 Spouštím hromadné odesílání emailů pro nedokončený onboarding');
    console.log('👤 Admin:', user.email);

    // Get all users
    const { data: allUsers, error: usersError } = await supabaseClient
      .from('users')
      .select('id, email, created_at');

    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      throw new Error('Failed to fetch users');
    }

    // Get profiles with date_of_birth
    const { data: profiles } = await supabaseClient
      .from('profiles')
      .select('id, date_of_birth');

    // Create set of users who have date_of_birth
    const usersWithDob = new Set(
      (profiles || [])
        .filter((p: any) => p.date_of_birth !== null)
        .map((p: any) => p.id)
    );

    // Filter users without date_of_birth
    const incompleteUsers = (allUsers || []).filter(u => !usersWithDob.has(u.id));

    console.log(`📊 Nalezeno ${incompleteUsers.length} uživatelů bez data narození`);

    if (incompleteUsers.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          sent: 0, 
          skipped: 0,
          message: 'Žádní uživatelé k odeslání' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for recent notifications (last 7 days) to avoid duplicates
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentNotifications } = await supabaseClient
      .from('notifications')
      .select('user_id')
      .eq('type', 'onboarding_reminder')
      .gte('created_at', sevenDaysAgo.toISOString());

    const recentlyNotifiedUsers = new Set(
      (recentNotifications || []).map(n => n.user_id)
    );

    console.log(`ℹ️ ${recentlyNotifiedUsers.size} uživatelů již bylo notifikováno v posledních 7 dnech`);

    const oneSignalApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
    const appId = '5e5539e1-fc71-4c4d-9fef-414293d83dbb';

    if (!oneSignalApiKey) {
      console.error('❌ ONESIGNAL_REST_API_KEY not configured');
      throw new Error('OneSignal API key not configured');
    }

    const results = {
      sent: 0,
      skipped: 0,
      errors: [] as string[]
    };

    const onboardingUrl = 'https://onemil.lovable.app/onboarding/date-of-birth';
    const emailSubject = 'Dokončete prosím registraci na OneMil';

    for (const targetUser of incompleteUsers) {
      // Skip if already notified in last 7 days
      if (recentlyNotifiedUsers.has(targetUser.id)) {
        console.log(`⏭️ Přeskakuji ${targetUser.email} - již notifikován`);
        results.skipped++;
        continue;
      }

      if (!targetUser.email) {
        console.log(`⏭️ Přeskakuji uživatele ${targetUser.id} - chybí email`);
        results.skipped++;
        continue;
      }

      try {
        console.log(`📧 Odesílám email na: ${targetUser.email}`);

        const emailResponse = await fetch('https://onesignal.com/api/v1/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${oneSignalApiKey}`
          },
          body: JSON.stringify({
            app_id: appId,
            include_email_tokens: [targetUser.email],
            email_subject: emailSubject,
            email_body: `
              <html>
                <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
                  <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px;">
                    <h2 style="color: #333; margin-bottom: 20px;">Dokončete prosím registraci</h2>
                    <p style="color: #555; line-height: 1.6;">
                      Dobrý den,
                    </p>
                    <p style="color: #555; line-height: 1.6;">
                      zaregistrovali jste se na platformě OneMil, ale zatím jste nedokončili svůj profil. 
                      Pro plnohodnotné používání aplikace prosím vyplňte své datum narození.
                    </p>
                    <p style="text-align: center; margin: 30px 0;">
                      <a href="${onboardingUrl}" 
                         style="background-color: #6366f1; color: white; padding: 12px 30px; 
                                text-decoration: none; border-radius: 6px; font-weight: bold;">
                        Dokončit registraci
                      </a>
                    </p>
                    <p style="color: #555; line-height: 1.6;">
                      Těšíme se na vás!
                    </p>
                    <p style="color: #888; margin-top: 30px; font-size: 14px;">
                      Tým OneMil
                    </p>
                  </div>
                </body>
              </html>
            `
          })
        });

        const emailData = await emailResponse.json();

        if (emailResponse.ok && !emailData.errors) {
          console.log(`✅ Email odeslán: ${targetUser.email}`);
          results.sent++;

          // Log notification to prevent duplicates
          await supabaseClient
            .from('notifications')
            .insert({
              user_id: targetUser.id,
              type: 'onboarding_reminder',
              title: emailSubject,
              message: 'Připomínka dokončení onboardingu',
              status: 'sent',
              push_delivered: false,
              push_response: { email_sent: true, email_data: emailData }
            });
        } else {
          console.error(`❌ Email error pro ${targetUser.email}:`, emailData);
          results.errors.push(`${targetUser.email}: ${emailData.errors?.[0] || 'Unknown error'}`);
        }
      } catch (e: any) {
        console.error(`❌ Exception pro ${targetUser.email}:`, e);
        results.errors.push(`${targetUser.email}: ${e.message}`);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('📊 Výsledky hromadného odeslání:', results);

    return new Response(
      JSON.stringify({ 
        success: true, 
        ...results,
        message: `Odesláno: ${results.sent}, Přeskočeno: ${results.skipped}, Chyby: ${results.errors.length}`
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
