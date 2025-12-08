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

  try {
    const XAI_KEY = Deno.env.get("GROK_API_KEY");
    if (!XAI_KEY) {
      return new Response(JSON.stringify({ error: "GROK_API_KEY není nastaveno" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json();
    const { title, main_prize } = body;

    if (!title || !main_prize) {
      return new Response(JSON.stringify({ error: "Chybí název nebo výhra" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // --------------------------
    // LUXURY BANNER PROMPT
    // --------------------------
    const prompt = `
Luxury black & gold neon contest banner (NO TEXT).
Main prize: ${main_prize}.
High-end glow, metallic reflections, cinematic lighting.
Wide aspect ratio, premium detail.
`.trim();

    console.log("Calling xAI image API…");

    // --------------------------
    // XAI IMAGE GENERATION
    // --------------------------
    const apiResponse = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${XAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-2-image-1212",
        prompt,
        size: "1024x768", // XAI NEUMÍ custom rozměry, jen default
        n: 1,
        response_format: "b64_json",
      }),
    });

    if (!apiResponse.ok) {
      console.error(await apiResponse.text());
      return new Response(JSON.stringify({ error: "Chyba generování obrázku" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const json = await apiResponse.json();
    const base64 = json.data?.[0]?.b64_json;

    if (!base64) {
      return new Response(JSON.stringify({ error: "XAI nevrátil obrázek" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    // --------------------------
    // UPLOAD TO SUPABASE
    // --------------------------
    const fileName = `banner-${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage.from("contest-banners").upload(fileName, bytes, {
      contentType: "image/png",
    });

    if (uploadErr) {
      console.error(uploadErr);
      return new Response(JSON.stringify({ error: uploadErr.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const { data: publicUrl } = supabase.storage.from("contest-banners").getPublicUrl(fileName);

    return new Response(JSON.stringify({ success: true, url: publicUrl.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
