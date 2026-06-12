import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Authorization (12. 06. 2026):
 *  1. backend/automation path — `x-internal-token` matching INTERNAL_FUNCTION_TOKEN
 *     (same pattern as pg_cron jobs 23/24) OR service-role bearer token
 *  2. admin fallback path — logged-in admin/superadmin JWT (no secret in browser)
 */
async function authorizeRequest(req: Request): Promise<{ status: number; error: string } | null> {
  const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
  const provided = req.headers.get("x-internal-token");
  if (internalToken && provided && provided === internalToken) return null;

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, error: "missing_authorization" };

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceKey && token === serviceKey) return null;

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) return { status: 401, error: "invalid_authorization_token" };

  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .in("role", ["admin", "superadmin"])
    .maybeSingle();
  if (!roleRow) return { status: 403, error: "access_denied_admin_only" };

  return null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authFailure = await authorizeRequest(req);
  if (authFailure) {
    return new Response(
      JSON.stringify({ error: authFailure.error }),
      { status: authFailure.status, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    const { invoice_id } = await req.json();
    if (!invoice_id) {
      throw new Error("Missing invoice_id");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Load invoice with partner info
    const { data: invoice, error: invError } = await supabaseClient
      .from("partner_invoices")
      .select("*, partner:partners(name, company_name, contact_email)")
      .eq("id", invoice_id)
      .maybeSingle();

    if (invError) throw new Error(`Chyba při načítání faktury: ${invError.message}`);
    if (!invoice) throw new Error("Faktura nenalezena");

    // 1a. Only send if status is 'draft'
    if (invoice.status !== "draft") {
      console.log(`⏭️ Invoice ${invoice_id} has status '${invoice.status}', skipping (only 'draft' allowed)`);
      return new Response(
        JSON.stringify({ success: false, skipped: true, reason: `Faktura má stav '${invoice.status}', odesílání je povoleno pouze pro stav 'draft'.` }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const partner = invoice.partner;
    if (!partner) throw new Error("Partner nenalezen");

    const recipientEmail = partner.contact_email;
    if (!recipientEmail) throw new Error("Partner nemá nastaven kontaktní e-mail");

    // 2. Load latest PDF export
    const { data: pdfExport } = await supabaseClient
      .from("partner_invoice_exports")
      .select("file_url")
      .eq("invoice_id", invoice_id)
      .eq("format", "pdf")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const pdfUrl = pdfExport?.file_url ?? null;

    // 3. Build email
    const partnerName = partner.company_name || partner.name;
    const periodStart = invoice.period_start;
    const periodEnd = invoice.period_end;
    const amountGross = Number(invoice.amount_gross ?? 0);

    const formattedAmount = new Intl.NumberFormat("cs-CZ", {
      style: "currency",
      currency: "CZK",
    }).format(amountGross);

    let pdfSection = "";
    const attachments: Array<{ filename: string; content: string; content_type?: string }> = [];

    if (pdfUrl) {
      // Fetch and attach the PDF
      try {
        console.log(`📎 Fetching PDF from: ${pdfUrl}`);
        const pdfResponse = await fetch(pdfUrl);
        if (pdfResponse.ok) {
          const arrayBuffer = await pdfResponse.arrayBuffer();
          const base64Content = btoa(
            String.fromCharCode(...new Uint8Array(arrayBuffer))
          );
          attachments.push({
            filename: `faktura-${periodStart}-${periodEnd}.pdf`,
            content: base64Content,
            content_type: "application/pdf",
          });
          pdfSection = `<p>PDF faktura je přiložena k tomuto e-mailu.</p>`;
          console.log(`✅ PDF attached (${arrayBuffer.byteLength} bytes)`);
        } else {
          console.warn(`⚠️ Could not fetch PDF (${pdfResponse.status}), including link instead`);
          pdfSection = `<p><a href="${pdfUrl}">Stáhnout PDF fakturu</a></p>`;
        }
      } catch (fetchErr) {
        console.warn("⚠️ PDF fetch failed, including link instead:", fetchErr);
        pdfSection = `<p><a href="${pdfUrl}">Stáhnout PDF fakturu</a></p>`;
      }
    } else {
      pdfSection = `<p><em>PDF faktura zatím nebyla vygenerována.</em></p>`;
    }

    const htmlBody = `
      <h2>Faktura – ${partnerName}</h2>
      <p>Dobrý den,</p>
      <p>zasíláme Vám fakturu za období <strong>${periodStart}</strong> – <strong>${periodEnd}</strong>.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Celková částka:</td><td style="font-weight:bold">${formattedAmount}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Stav:</td><td>${invoice.status}</td></tr>
      </table>
      ${pdfSection}
      <p>S pozdravem,<br/>Tým OneMil</p>
    `;

    // 4. Send via Resend
    console.log(`📧 Sending invoice email to: ${recipientEmail}`);

    const emailOptions: {
      from: string;
      to: string[];
      subject: string;
      html: string;
      attachments?: typeof attachments;
    } = {
      from: "OneMil <noreply@onemil.cz>",
      to: [recipientEmail],
      subject: `Faktura OneMil – ${periodStart} – ${periodEnd}`,
      html: htmlBody,
    };

    if (attachments.length > 0) {
      emailOptions.attachments = attachments;
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      // Controlled failure: nothing sent, invoice status unchanged
      console.warn("⚠️ RESEND_API_KEY not configured — email not sent");
      return new Response(
        JSON.stringify({ error: "email_service_not_configured" }),
        { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const resend = new Resend(resendApiKey);
    const emailResponse = await resend.emails.send(emailOptions);

    if (emailResponse.error) {
      throw new Error(`Resend chyba: ${emailResponse.error.message}`);
    }

    console.log(`✅ Invoice email sent successfully to ${recipientEmail}`);

    // 5. Update invoice status to 'issued' and set issued_at
    const { error: updateError } = await supabaseClient
      .from("partner_invoices")
      .update({ status: "issued", issued_at: new Date().toISOString() })
      .eq("id", invoice_id)
      .eq("status", "draft"); // extra guard against race conditions

    if (updateError) {
      console.warn(`⚠️ Email sent but status update failed:`, updateError.message);
    } else {
      console.log(`✅ Invoice ${invoice_id} status updated to 'issued'`);
    }

    return new Response(
      JSON.stringify({ success: true, sent_to: recipientEmail, status_updated: !updateError }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("❌ send-partner-invoice-email error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
