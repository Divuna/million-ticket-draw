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
    const GROK_KEY = Deno.env.get("GROK_API_KEY");
    if (!GROK_KEY) {
      return new Response(JSON.stringify({ error: "GROK_API_KEY není nastavené" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { title, main_prize } = await req.json();

    const prompt = `
Vytvoř luxusní marketingový banner bez textu.
Styl: černé pozadí, zlato, neon glow, luxusní efekty, vysoká kvalita.
Hlavní výhra: ${main_prize}
Formát: 1536×864
`;

    // 🔥 SPRÁVNÝ ENDPOINT PRO GENEROVÁNÍ OBRÁZKU GROKEM
    const grokResponse = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-2-image-1212",
        prompt,
        size: "1536x864",
      }),
    });

    if (!grokResponse.ok) {
      const err = await grokResponse.text();
      console.error("Grok API error:", err);
      return new Response(JSON.stringify({ error: "Grok image generation failed" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const data = await grokResponse.json();
    const imageBase64 = data?.data?.[0]?.b64_json;

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "Grok nevrátil obrázek" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const buffer = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));

    const fileName = `banner-${Date.now()}.png`;

    await supabase.storage.from("contest-banners").upload(fileName, buffer, {
      contentType: "image/png",
      upsert: true,
    });

    const { data: urlData } = supabase.storage.from("contest-banners").getPublicUrl(fileName);

    return new Response(JSON.stringify({ success: true, url: urlData.publicUrl }), {
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
