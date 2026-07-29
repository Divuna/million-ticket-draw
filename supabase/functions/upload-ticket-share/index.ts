import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Internal authorization guard
  // Allow public or authenticated calls (do not block)
  console.info("auth skipped");

  try {
    const { ticketId, imageBase64 } = await req.json();

    if (!ticketId || !imageBase64) {
      console.error('Missing required fields:', { ticketId: !!ticketId, imageBase64: !!imageBase64 });
      console.warn('upload fail');
      return json({ ok: false }, 200);
    }

    const base64Length = typeof imageBase64 === "string" ? imageBase64.length : 0;
    console.info("upload start");
    console.info("upload start meta:", { ticketId, imageBase64Length: base64Length });

    const timeoutMs = 5000;
    const timeoutResponse = () => json({ ok: false, timeout: true }, 200);

    const mainPromise = (async () => {
      try {
        // Create Supabase client with SERVICE ROLE key (required for storage upload)
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Clean base64 string (remove data URL prefix if present)
        let base64Data = imageBase64.startsWith("data:")
          ? imageBase64.replace(/^data:image\/\w+;base64,/, '')
          : imageBase64;

        if (base64Data.length > 1_500_000) {
          console.warn("upload skipped - too large (hard limit)");
          return json({ ok: false, tooLarge: true }, 200);
        }

        // Fast decode base64 -> bytes (no manual loop)
        const bytes = Uint8Array.from(
          globalThis.atob(base64Data),
          (c) => c.charCodeAt(0)
        ).slice(0, 1_500_000);
        // Help GC
        base64Data = "";

        // Generate unique filename
        const filename = `${ticketId}.png`;

        console.log(`Uploading ticket share image: ${filename}`);

        // Fire & forget upload (do not await; UI must not depend on it)
        supabase.storage
          .from("ticket-shares")
          .upload(filename, bytes, {
            contentType: "image/png",
            upsert: true,
          })
          .then(({ error: uploadError }) => {
            if (uploadError) {
              console.warn("upload fail");
              console.error("Upload error:", uploadError);
              return;
            }
            console.info("upload success");
          })
          .catch((uploadErr) => {
            console.warn("upload fail");
            console.error("Upload error:", uploadErr);
          });

        // Get public URL without waiting for upload completion
        const { data: urlData } = supabase.storage
          .from("ticket-shares")
          .getPublicUrl(filename);

        return json(
          {
            success: true,
            ok: true,
            publicUrl: urlData.publicUrl,
            filename,
          },
          200
        );
      } catch (err) {
        console.warn("upload fail");
        console.error("Unexpected upload handler error:", err);
        return json({ ok: false }, 200);
      }
    })();

    const response = await Promise.race<Response>([
      mainPromise,
      new Promise<Response>((resolve) => {
        setTimeout(() => resolve(timeoutResponse()), timeoutMs);
      }),
    ]);

    // Ensure we always return a Response within timeoutMs.
    return response;

  } catch (error) {
    console.error('Unexpected error:', error);
    return json({ ok: false }, 200);
  }
});
