import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Internal authorization guard
  const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
  if (req.headers.get("x-internal-token") !== internalToken) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  try {
    const GROK_KEY = Deno.env.get("GROK_API_KEY");
    if (!GROK_KEY) {
      return new Response(JSON.stringify({ error: "GROK_API_KEY není nastavené" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json();
    const { title, main_prize } = body;

    if (!title || !main_prize) {
      return new Response(JSON.stringify({ error: "Chybí název soutěže nebo hlavní výhra" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Banner prompt
    const prompt = `
Create a luxury 16:9 marketing banner WITHOUT ANY TEXT.
Black and gold neon light, metallic reflections, premium realism.
Main prize: ${main_prize}
Contest: ${title}
`.trim();

    console.log("Calling GROK Image API…");

    // Grok image generation – CORRECT REQUEST
    const grokResponse = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-2-image",
        prompt: prompt,
        n: 1,
        response_format: "b64_json",
      }),
    });

    const grokData = await grokResponse.json();

    if (!grokResponse.ok) {
      console.error("Grok error:", grokData);
      return new Response(JSON.stringify({ error: `Grok chyba: ${JSON.stringify(grokData)}` }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const imageBase64 = grokData?.data?.[0]?.b64_json;

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "Grok negeneroval obrázek" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const imageBytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
    const fileName = `banner-${Date.now()}.png`;

    const upload = await supabase.storage.from("contest-banners").upload(fileName, imageBytes, {
      contentType: "image/png",
    });

    if (upload.error) {
      return new Response(JSON.stringify({ error: upload.error.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const { data: url } = supabase.storage.from("contest-banners").getPublicUrl(fileName);

    return new Response(
      JSON.stringify({
        success: true,
        url: url.publicUrl,
        fileName,
      }),
      { headers: corsHeaders },
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
