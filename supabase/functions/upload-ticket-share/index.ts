import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * upload-ticket-share — uložení sdíleného obrázku tiketu.
 *
 * Bezpečnostní oprava A5. Dřív byl endpoint zcela veřejný (`auth skipped`),
 * pod service-role klíčem a s `upsert: true` nad názvem `${ticketId}.png`,
 * takže kdokoli mohl přepsat sdílený obrázek cizího tiketu nebo plnit bucket
 * libovolnými soubory.
 *
 * Pravidla (neměnit):
 * - Vyžaduje platný JWT; uživatele určuje výhradně token, ne tělo požadavku.
 * - `ticketId` musí být platné UUID a musí odpovídat `tickets.id`, jehož
 *   `user_id` je přihlášený uživatel. Nikdy nedůvěřovat `user_id` z těla.
 * - Přijímá jen PNG — kontroluje se deklarovaný data URL prefix i skutečná
 *   PNG signatura po dekódování.
 * - `upsert: false` — existující obrázek se nikdy nepřepíše.
 * - Do logu nepatří tokeny, klíče ani obsah obrázku.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** 8bajtová PNG signatura: \x89 P N G \r \n \x1a \n */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_BASE64_LENGTH = 1_500_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hasPngSignature = (bytes: Uint8Array): boolean =>
  bytes.length > PNG_SIGNATURE.length &&
  PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);

serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    // ── 1. Autentizace — uživatele určuje výhradně JWT ───────────────────────
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    if (!token) {
      return json({ ok: false, error: "missing_authorization_header" }, 401);
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    const userId = userData?.user?.id ?? null;

    if (userError || !userId) {
      return json({ ok: false, error: "invalid_authorization_token" }, 401);
    }

    // ── 2. Vstup ────────────────────────────────────────────────────────────
    const { ticketId, imageBase64 } = await req.json();

    if (typeof ticketId !== "string" || typeof imageBase64 !== "string" || !imageBase64) {
      return json({ ok: false, error: "missing_fields" }, 400);
    }

    if (!UUID_RE.test(ticketId)) {
      return json({ ok: false, error: "invalid_ticket_id" }, 400);
    }

    // ── 3. Vlastnictví tiketu ───────────────────────────────────────────────
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: ticketRow, error: ticketError } = await serviceClient
      .from("tickets")
      .select("id, user_id")
      .eq("id", ticketId)
      .maybeSingle();

    if (ticketError) {
      console.error("ticket lookup failed", { ticket_id: ticketId });
      return json({ ok: false, error: "ticket_lookup_failed" }, 500);
    }

    if (!ticketRow || ticketRow.user_id !== userId) {
      // Neexistující i cizí tiket vracejí totéž — neprozrazovat existenci.
      return json({ ok: false, error: "ticket_not_owned" }, 403);
    }

    // ── 4. Obsah musí být PNG ───────────────────────────────────────────────
    const isDataUrl = imageBase64.startsWith("data:");
    if (isDataUrl && !imageBase64.startsWith("data:image/png;base64,")) {
      return json({ ok: false, error: "unsupported_media_type" }, 415);
    }

    let base64Data = isDataUrl
      ? imageBase64.replace(/^data:image\/png;base64,/, "")
      : imageBase64;

    if (base64Data.length > MAX_BASE64_LENGTH) {
      return json({ ok: false, error: "payload_too_large" }, 413);
    }

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(globalThis.atob(base64Data), (c) => c.charCodeAt(0));
    } catch {
      return json({ ok: false, error: "invalid_base64" }, 400);
    } finally {
      base64Data = ""; // Help GC
    }

    if (!hasPngSignature(bytes)) {
      return json({ ok: false, error: "unsupported_media_type" }, 415);
    }

    // ── 5. Upload — bez přepisu existujícího obrázku ─────────────────────────
    const filename = `${ticketId}.png`;

    const { error: uploadError } = await serviceClient.storage
      .from("ticket-shares")
      .upload(filename, bytes, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      // Duplicate = obrázek už existuje; nikdy nepřepisujeme, jen vrátíme URL.
      const alreadyExists =
        (uploadError as { statusCode?: string | number }).statusCode === "409" ||
        (uploadError as { statusCode?: string | number }).statusCode === 409 ||
        /exists/i.test(uploadError.message ?? "");

      if (alreadyExists) {
        const { data: existingUrl } = serviceClient.storage
          .from("ticket-shares")
          .getPublicUrl(filename);

        return json(
          { ok: true, success: true, alreadyExists: true, publicUrl: existingUrl.publicUrl, filename },
          200,
        );
      }

      console.error("upload failed", { ticket_id: ticketId, message: uploadError.message });
      return json({ ok: false, error: "upload_failed" }, 500);
    }

    const { data: urlData } = serviceClient.storage
      .from("ticket-shares")
      .getPublicUrl(filename);

    return json({ ok: true, success: true, publicUrl: urlData.publicUrl, filename }, 200);
  } catch (error) {
    console.error("unexpected error", { message: error instanceof Error ? error.message : "unknown" });
    return json({ ok: false, error: "internal_error" }, 500);
  }
});
