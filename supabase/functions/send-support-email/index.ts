import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SupportRequest {
  name: string;
  email: string;
  category: string;
  message: string;
}

const categoryLabels: Record<string, string> = {
  technical: "Technický problém",
  payment: "Platby a transakce",
  account: "Účet a přihlášení",
  contest: "Soutěže a výhry",
  other: "Jiné",
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, category, message }: SupportRequest = await req.json();

    // Validate required fields
    if (!name || !email || !category || !message) {
      return new Response(
        JSON.stringify({ error: "Všechna pole jsou povinná" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Neplatný formát e-mailu" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get support email from env or use fallback
    const supportEmail = Deno.env.get("SUPPORT_EMAIL") || "podpora@onemil.cz";
    const categoryLabel = categoryLabels[category] || category;

    const emailResponse = await resend.emails.send({
      from: "OneMil Support <noreply@onemil.cz>",
      to: [supportEmail],
      replyTo: email,
      subject: `[Podpora] ${categoryLabel} - ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Nová zpráva z formuláře podpory</h2>
          
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; width: 120px;">Jméno:</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee;">${name}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">E-mail:</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee;"><a href="mailto:${email}">${email}</a></td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Kategorie:</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee;">${categoryLabel}</td>
            </tr>
          </table>
          
          <div style="margin-top: 20px;">
            <h3 style="color: #333;">Zpráva:</h3>
            <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; white-space: pre-wrap;">${message}</div>
          </div>
          
          <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;" />
          <p style="color: #999; font-size: 12px;">Tato zpráva byla odeslána z formuláře podpory na webu OneMil.</p>
        </div>
      `,
    });

    console.log("Support email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, message: "E-mail byl úspěšně odeslán" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-support-email function:", error);
    return new Response(
      JSON.stringify({ error: "Nepodařilo se odeslat e-mail. Zkuste to prosím později." }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
