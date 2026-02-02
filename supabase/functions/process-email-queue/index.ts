import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("📧 Processing email queue...");

    // Select pending emails
    const { data: pendingEmails, error: selectError } = await supabaseClient
      .from("email_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50);

    if (selectError) {
      console.error("❌ Error fetching pending emails:", selectError);
      throw new Error(`Failed to fetch pending emails: ${selectError.message}`);
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      console.log("ℹ️ No pending emails to process");
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No pending emails" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`📬 Found ${pendingEmails.length} pending emails`);

    const results = {
      processed: 0,
      sent: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const emailRecord of pendingEmails) {
      results.processed++;

      try {
        console.log(`📤 Sending email to: ${emailRecord.email}`);

        const emailResponse = await resend.emails.send({
          from: "OneMil <noreply@onemil.cz>",
          to: [emailRecord.email],
          subject: emailRecord.subject,
          html: emailRecord.body,
        });

        if (emailResponse.error) {
          throw new Error(emailResponse.error.message);
        }

        console.log(`✅ Email sent successfully to ${emailRecord.email}`);

        // Update status to 'sent' and set sent_at
        const { error: updateError } = await supabaseClient
          .from("email_queue")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", emailRecord.id);

        if (updateError) {
          console.error(`❌ Failed to update email status for ${emailRecord.id}:`, updateError);
          results.errors.push(`Update failed for ${emailRecord.email}: ${updateError.message}`);
        } else {
          results.sent++;
        }
      } catch (sendError: any) {
        console.error(`❌ Failed to send email to ${emailRecord.email}:`, sendError);
        results.failed++;
        results.errors.push(`${emailRecord.email}: ${sendError.message}`);

        // Optionally mark as failed in the queue
        await supabaseClient
          .from("email_queue")
          .update({ status: "failed" })
          .eq("id", emailRecord.id);
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log("📊 Email queue processing complete:", results);

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
        message: `Processed: ${results.processed}, Sent: ${results.sent}, Failed: ${results.failed}`,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("💥 Error processing email queue:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
