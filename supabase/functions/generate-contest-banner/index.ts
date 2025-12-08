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
    const grok = Deno.env.get("GROK_API_KEY");
    if (!grok) {
      return new Response(JSON.stringify({ error: "Missing GROK_API_KEY" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // UI sends only: title, description, main_image_url etc.
    const body = await req.json();
    const title = body.title || "";
    const description = body.description || "";
    const mainPrize = body.main_prize || title;

    if (!title) {
      return new Response(JSON.stringify({ error: "Missing title" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Build final image prompt
    const prompt = `
Create a wide promotional banner with cinematic lighting.
Main prize: ${mainPrize}
Description: ${description}

Rules:
- NO TEXT in the image.
- Show the theme visually.
- High-quality marketing style.
- Landscape format, 1536x1024.
`;

    // GROK REQUEST
    const img = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${grok}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-image-1",
        prompt,
        size: "1536x1024",
        response_format: "b64_json",
      }),
    });

    const result = await img.json();

    if (!result?.data?.[0]?.b64_json) {
      console.log("Grok error:", result);
      return new Response(JSON.stringify({ error: "Grok image generation failed" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const binary = Uint8Array.from(atob(result.data[0].b64_json), (c) => c.charCodeAt(0));
    const fileName = `ai-banner-${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("contest-banners")
      .upload(fileName, binary, { contentType: "image/png" });

    if (uploadErr) {
      return new Response(JSON.stringify({ error: uploadErr.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const { data: urlData } = supabase.storage.from("contest-banners").getPublicUrl(fileName);

    return new Response(JSON.stringify({ url: urlData.publicUrl }), {
      headers: corsHeaders,
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
