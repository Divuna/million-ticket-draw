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
      return new Response(JSON.stringify({ error: "Missing GROK_API_KEY" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { title, main_prize, description } = await req.json();

    if (!title || !main_prize) {
      return new Response(JSON.stringify({ error: "Missing title or prize" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // --------------------------
    //  PROMPT
    // --------------------------
    const prompt = `
Create a luxury marketing banner for a contest.
NO TEXT in the image.

Main prize: ${main_prize}
Style: black & gold, neon glow, premium luxury design
Format: 1536×864, wide banner
Photorealistic + glossy reflections
High-end cinematic lighting
`.trim();

    // --------------------------
    //  GROK 2 IMAGE API REQUEST
    // --------------------------
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
        n: 1,
      }),
    });

    if (!grokResponse.ok) {
      const err = await grokResponse.text();
      console.error("GROK ERROR:", err);
      return new Response(JSON.stringify({ error: "Grok image generation failed" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const grokData = await grokResponse.json();
    const imageBase64 = grokData?.data?.[0]?.b64_json;

    if (!imageBase64) {
      console.error("Missing b64_json:", grokData);
      return new Response(JSON.stringify({ error: "No image returned" }), { status: 500, headers: corsHeaders });
    }

    // Convert base64 to bytes
    const imageBytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));

    // --------------------------
    //  UPLOAD TO SUPABASE
    // --------------------------
    const fileName = `banner-${Date.now()}-${crypto.randomUUID()}.png`;

    const { error: uploadErr } = await supabase.storage.from("contest-banners").upload(fileName, imageBytes, {
      contentType: "image/png",
      upsert: false,
    });

    if (uploadErr) {
      console.error("UPLOAD ERROR:", uploadErr);
      return new Response(JSON.stringify({ error: "Upload failed" }), { status: 500, headers: corsHeaders });
    }

    const { data: urlData } = supabase.storage.from("contest-banners").getPublicUrl(fileName);

    return new Response(
      JSON.stringify({
        success: true,
        url: urlData.publicUrl,
        fileName,
      }),
      { status: 200, headers: corsHeaders },
    );
  } catch (err) {
    console.error("FINAL ERROR:", err);
    return new Response(JSON.stringify({ error: "Unexpected server error" }), { status: 500, headers: corsHeaders });
  }
});
