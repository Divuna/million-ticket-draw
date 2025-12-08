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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { title, main_prize } = body;

    if (!title || !main_prize) {
      return new Response(JSON.stringify({ error: "Chybí název soutěže nebo hlavní výhra" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `
Vytvoř luxusní marketingový banner BEZ TEXTU.
Styl: černo-zlatý, neon glow, luxusní, prémiový.
Hlavní objekt: ${main_prize}
Formát: širokoúhlý banner (16:9)
Realistický styl + světelné efekty.
`.trim();

    console.log("Calling GROK Image API...");

    // ❗ WITHOUT `size:` (Grok 2.1 image does not support it)
    const grokResponse = await fetch("https://api.x.ai/v1/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-2-image-1212",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: prompt,
              },
            ],
          },
        ],
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

    const grokData = await grokResponse.json();
    const imageBase64 = grokData?.output?.[0]?.content?.[0]?.image_base64 ?? null;

    if (!imageBase64) {
      console.error("Grok returned no image:", grokData);
      return new Response(JSON.stringify({ error: "Grok negeneroval obrázek" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const imageBytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));

    const fileName = `banner-${Date.now()}-${crypto.randomUUID()}.png`;

    const { error: uploadErr } = await supabase.storage.from("contest-banners").upload(fileName, imageBytes, {
      contentType: "image/png",
      upsert: false,
    });

    if (uploadErr) {
      console.error("Upload failed:", uploadErr);
      return new Response(JSON.stringify({ error: uploadErr.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const { data: urlData } = supabase.storage.from("contest-banners").getPublicUrl(fileName);

    return new Response(
      JSON.stringify({
        success: true,
        url: urlData.publicUrl,
        fileName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("ERROR:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
