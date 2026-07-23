import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-token",
};

interface Attachment {
  filename: string;
  content: string;
  content_type?: string;
}

function getResendClient(): Resend {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error("missing_resend_api_key");
  }

  return new Resend(apiKey);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface QueueEmailRecord {
  id: string;
  email: string;
  subject: string;
  body: string;
  attachment_url?: string | null;
  attachment_storage_bucket?: string | null;
  attachment_storage_path?: string | null;
  attachment_filename?: string | null;
  attachment_content_type?: string | null;
  attachment_required?: boolean | null;
}

type AuthFailure = { status: number; error: string };

async function tokenDigest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function isInternalTokenAuthorized(req: Request): Promise<boolean> {
  const providedToken = req.headers.get("x-internal-token");
  if (!providedToken) {
    return false;
  }

  // 1) Match against the deployed Edge secret INTERNAL_FUNCTION_TOKEN.
  const expectedToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
  if (expectedToken) {
    const [expectedDigest, providedDigest] = await Promise.all([
      tokenDigest(expectedToken),
      tokenDigest(providedToken),
    ]);
    if (
      expectedToken.length === providedToken.length &&
      expectedDigest === providedDigest
    ) {
      return true;
    }
  }

  // 2) Fall back to server-side verification against the current Vault secret
  //    internal_function_token — the value pg_cron actually sends. Keeps the
  //    scheduled call working even if the Edge secret has drifted from Vault.
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) return false;
    const client = createClient(supabaseUrl, serviceKey);
    const { data, error } = await client.rpc("verify_internal_function_token", {
      p_token: providedToken,
    });
    return !error && data === true;
  } catch (_e) {
    return false;
  }
}

async function authorizeRequest(req: Request): Promise<AuthFailure | null> {
  if (await isInternalTokenAuthorized(req)) {
    return null;
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!bearerToken) {
    return { status: 401, error: "missing_authorization" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceKey && bearerToken === serviceKey) {
    return null;
  }
  if (!supabaseUrl || !serviceKey) {
    return { status: 500, error: "missing_service_configuration" };
  }

  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userError } = await adminClient.auth.getUser(bearerToken);
  if (userError || !userData?.user) {
    return { status: 401, error: "invalid_authorization_token" };
  }

  const { data: roleRow } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .in("role", ["admin", "superadmin"])
    .maybeSingle();

  if (!roleRow) {
    return { status: 403, error: "access_denied_admin_only" };
  }

  return null;
}

async function blobToAttachment(
  blob: Blob,
  filename: string,
  contentType?: string | null,
): Promise<Attachment> {
  const arrayBuffer = await blob.arrayBuffer();
  const base64Content = btoa(
    String.fromCharCode(...new Uint8Array(arrayBuffer)),
  );

  let resolvedContentType = contentType || blob.type || "application/octet-stream";
  if (!contentType) {
    if (filename.endsWith(".isdoc") || filename.endsWith(".xml")) {
      resolvedContentType = "application/xml";
    } else if (filename.endsWith(".pdf")) {
      resolvedContentType = "application/pdf";
    }
  }

  return {
    filename,
    content: base64Content,
    content_type: resolvedContentType,
  };
}

async function fetchAttachment(url: string): Promise<Attachment | null> {
  try {
    console.log(`Fetching attachment from URL: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch attachment: ${response.status} ${response.statusText}`);
      return null;
    }

    const urlParts = url.split("/");
    let filename = urlParts[urlParts.length - 1] || "attachment";
    if (filename.includes("?")) {
      filename = filename.split("?")[0];
    }

    const blob = await response.blob();
    const attachment = await blobToAttachment(blob, filename);
    console.log(`Attachment fetched: ${filename} (${attachment.content_type}, ${blob.size} bytes)`);
    return attachment;
  } catch (error) {
    console.error("Error fetching URL attachment:", error);
    return null;
  }
}

async function fetchStorageAttachment(
  supabaseClient: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  filename?: string | null,
  contentType?: string | null,
): Promise<Attachment | null> {
  try {
    console.log(`Fetching storage attachment: ${bucket}/${path}`);

    const { data, error } = await supabaseClient.storage.from(bucket).download(path);
    if (error || !data) {
      console.error("Failed to download storage attachment:", error?.message ?? "no data");
      return null;
    }

    const resolvedFilename = filename || path.split("/").pop() || "attachment";
    const attachment = await blobToAttachment(data, resolvedFilename, contentType);
    console.log(`Storage attachment fetched: ${resolvedFilename} (${attachment.content_type}, ${data.size} bytes)`);
    return attachment;
  } catch (error) {
    console.error("Error fetching storage attachment:", error);
    return null;
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authFailure = await authorizeRequest(req);
    if (authFailure) {
      return new Response(
        JSON.stringify({ error: authFailure.error }),
        { status: authFailure.status, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    let requestedEmailId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.clone().json();
        requestedEmailId = typeof body?.email_id === "string" ? body.email_id : null;
      } catch (_) {
        requestedEmailId = null;
      }
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    console.log("Processing email queue...");

    let query = supabaseClient
      .from("email_queue")
      .select("*")
      .eq("status", "pending")
      .lte("available_at", new Date().toISOString())
      .or("subject.not.ilike.%faktura%,attachment_url.not.is.null,attachment_storage_path.not.is.null")
      .order("created_at", { ascending: true })
      .limit(50);

    if (requestedEmailId) {
      query = query.eq("id", requestedEmailId).limit(1);
    }

    const { data: pendingEmails, error: selectError } = await query;

    if (selectError) {
      console.error("Error fetching pending emails:", selectError);
      throw new Error(`Failed to fetch pending emails: ${selectError.message}`);
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      console.log("No pending emails to process");
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No pending emails" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    console.log(`Found ${pendingEmails.length} pending emails`);

    const results = {
      processed: 0,
      sent: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const emailRecord of pendingEmails as QueueEmailRecord[]) {
      results.processed++;

      try {
        console.log(`Sending email to: ${emailRecord.email}`);

        const emailOptions: {
          from: string;
          to: string[];
          subject: string;
          html: string;
          attachments?: Array<{ filename: string; content: string; content_type?: string }>;
        } = {
          from: "OneMil <noreply@onemil.cz>",
          to: [emailRecord.email],
          subject: emailRecord.subject,
          html: emailRecord.body,
        };

        let attachment: Attachment | null = null;
        if (emailRecord.attachment_storage_bucket && emailRecord.attachment_storage_path) {
          attachment = await fetchStorageAttachment(
            supabaseClient,
            emailRecord.attachment_storage_bucket,
            emailRecord.attachment_storage_path,
            emailRecord.attachment_filename,
            emailRecord.attachment_content_type,
          );
        } else if (emailRecord.attachment_url) {
          attachment = await fetchAttachment(emailRecord.attachment_url);
        }

        if (attachment) {
          emailOptions.attachments = [{
            filename: attachment.filename,
            content: attachment.content,
            content_type: attachment.content_type,
          }];
          console.log(`Attachment added: ${attachment.filename}`);
        } else if (emailRecord.attachment_required) {
          throw new Error("required_attachment_unavailable");
        } else if (emailRecord.attachment_url || emailRecord.attachment_storage_path) {
          console.warn("Could not fetch optional attachment, sending email without it");
        }

        const emailResponse = await getResendClient().emails.send(emailOptions);
        if (emailResponse.error) {
          throw new Error(emailResponse.error.message);
        }

        console.log(`Email sent successfully to ${emailRecord.email}`);

        const { error: updateError } = await supabaseClient
          .from("email_queue")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", emailRecord.id);

        if (updateError) {
          console.error(`Failed to update email status for ${emailRecord.id}:`, updateError);
          results.errors.push(`Update failed for ${emailRecord.email}: ${updateError.message}`);
        } else {
          results.sent++;
        }
      } catch (sendError: unknown) {
        console.error(`Failed to send email to ${emailRecord.email}:`, sendError);
        results.failed++;
        results.errors.push(`${emailRecord.email}: ${errorMessage(sendError)}`);

        await supabaseClient
          .from("email_queue")
          .update({ status: "failed" })
          .eq("id", emailRecord.id);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log("Email queue processing complete:", results);

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
        message: `Processed: ${results.processed}, Sent: ${results.sent}, Failed: ${results.failed}`,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error("Error processing email queue:", error);
    return new Response(
      JSON.stringify({ error: errorMessage(error) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
};

serve(handler);
