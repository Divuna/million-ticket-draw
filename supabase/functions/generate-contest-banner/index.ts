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
      return new Response(JSON.stringify({ error: "GROK_API_KEY není nastaveno" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json();
    const { title, main_prize } = body;

    if (!title || !main_prize) {
      return new Response(JSON.stringify({ error: "Chybí title nebo main_prize" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // ---------- PROMPT ----------
    const prompt = `
Vytvoř luxusní marketingový banner (bez textu) ve stylu černé a zlaté.
Hlavní výhra: ${main_prize}.
Styl: glow, neon gold, realistic render, 16:9, extrémně luxusní, Black/Gold premium.
`;

    console.log("Calling GROK Image API...");

    // ---------- GROK IMAGE API ----------
    const grokRes = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-2-image-1212",
        prompt,
        size: "1536x864",
        response_format: "b64_json",
      }),
    });

    if (!grokRes.ok) {
      const err = await grokRes.text();
      console.error("Grok API error:", err);

      return new Response(JSON.stringify({ error: "Chyba generování obrázku (Grok)" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const imgData = await grokRes.json();
    const base64 = imgData?.data?.[0]?.b64_json;

    if (!base64) {
      console.error("Grok failure:", imgData);
      return new Response(JSON.stringify({ error: "Grok nevrátil obrázek" }), { status: 500, headers: corsHeaders });
    }

    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const fileName = `banner-${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage.from("contest-banners").upload(fileName, bytes, {
      contentType: "image/png",
      upsert: false,
    });

    if (uploadErr) {
      return new Response(JSON.stringify({ error: uploadErr.message }), { status: 500, headers: corsHeaders });
    }

    const { data: urlData } = supabase.storage.from("contest-banners").getPublicUrl(fileName);

    return new Response(JSON.stringify({ success: true, url: urlData.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
