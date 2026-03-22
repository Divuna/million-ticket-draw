import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Internal authorization guard
  const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
  if (req.headers.get("x-internal-token") !== internalToken) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  try {
    console.log("Starting daily onboarding reminder job...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const oneSignalAppId = "357be038-dbaf-4551-9a16-96d9897197a3";
    const oneSignalApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all users
    const { data: allUsers, error: usersError } = await supabase
      .from("users")
      .select("id, email, onesignal_player_id");

    if (usersError) {
      console.error("Error fetching users:", usersError);
      throw new Error("Failed to fetch users");
    }

    // Get all profiles with date_of_birth set
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, date_of_birth");

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw new Error("Failed to fetch profiles");
    }

    // Create a set of user IDs that have date_of_birth
    const usersWithDob = new Set(
      (profiles || [])
        .filter((p: any) => p.date_of_birth !== null)
        .map((p: any) => p.id)
    );

    // Filter users who don't have date_of_birth
    const incompleteUsers = (allUsers || []).filter((u: any) => !usersWithDob.has(u.id));

    console.log(`Found ${incompleteUsers.length} users with incomplete onboarding`);

    if (incompleteUsers.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No users with incomplete onboarding found",
          sent: 0,
          skipped: 0 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get notifications sent in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentNotifications, error: notifError } = await supabase
      .from("notifications")
      .select("user_id")
      .eq("type", "onboarding_reminder")
      .gte("created_at", sevenDaysAgo.toISOString());

    if (notifError) {
      console.error("Error fetching recent notifications:", notifError);
    }

    const recentlyNotifiedUsers = new Set(
      (recentNotifications || []).map((n: any) => n.user_id)
    );

    // Filter out users who were recently notified
    const usersToNotify = incompleteUsers.filter(
      (u: any) => !recentlyNotifiedUsers.has(u.id)
    );

    console.log(`${usersToNotify.length} users to notify (${incompleteUsers.length - usersToNotify.length} recently notified, skipping)`);

    let sent = 0;
    let skipped = incompleteUsers.length - usersToNotify.length;

    const appUrl = Deno.env.get("APP_URL") || "https://xkzhjldrojjlrkezorey.lovableproject.com";

    for (const user of usersToNotify) {
      try {
        // Log the notification to prevent duplicates
        const { error: insertError } = await supabase.from("notifications").insert({
          user_id: user.id,
          type: "onboarding_reminder",
          title: "Dokončete prosím registraci na OneMil",
          message: `Dobrý den, pro plné využití OneMil potřebujeme znát váš věk. Prosíme, dokončete registraci zde: ${appUrl}/onboarding/date-of-birth`,
          status: "sent",
          sent_at: new Date().toISOString(),
        });

        if (insertError) {
          console.error(`Error logging notification for user ${user.id}:`, insertError);
          skipped++;
          continue;
        }

        // Send via OneSignal if player_id exists and OneSignal is configured
        if (user.onesignal_player_id && oneSignalAppId && oneSignalApiKey) {
          try {
            const oneSignalResponse = await fetch("https://onesignal.com/api/v1/notifications", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Basic ${oneSignalApiKey}`,
              },
              body: JSON.stringify({
                app_id: oneSignalAppId,
                include_player_ids: [user.onesignal_player_id],
                headings: { cs: "Dokončete prosím registraci na OneMil" },
                contents: { 
                  cs: "Pro plné využití OneMil potřebujeme znát váš věk. Klikněte pro dokončení registrace." 
                },
                url: `${appUrl}/onboarding/date-of-birth`,
              }),
            });

            if (!oneSignalResponse.ok) {
              console.warn(`OneSignal notification failed for user ${user.id}`);
            }
          } catch (oneSignalError) {
            console.warn(`OneSignal error for user ${user.id}:`, oneSignalError);
          }
        }

        sent++;
        console.log(`Notification sent to user ${user.id} (${user.email})`);
      } catch (err) {
        console.error(`Error processing user ${user.id}:`, err);
        skipped++;
      }
    }

    console.log(`Daily onboarding reminder completed: sent=${sent}, skipped=${skipped}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Odesláno: ${sent}, Přeskočeno: ${skipped}`,
        sent,
        skipped,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in daily-onboarding-reminder:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
