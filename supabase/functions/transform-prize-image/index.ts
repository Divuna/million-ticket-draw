import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ImageLayout = "hero" | "banner" | "bonus";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GROK_API_KEY = Deno.env.get("GROK_API_KEY");
    if (!GROK_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GROK_API_KEY není nastavený" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { layout, prize_name } = body as {
      layout: ImageLayout;
      prize_name: string;
    };

    if (!layout) {
      return new Response(
        JSON.stringify({ error: "Chybí layout (hero | banner | bonus)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!prize_name) {
      return new Response(
        JSON.stringify({ error: "Chybí prize_name (název ceny)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Layout-specific prompts for Grok 2 text-to-image
    const layoutPrompts: Record<ImageLayout, string> = {
      hero: `Ultra-realistic product photography of ${prize_name}. 
Position the product on the RIGHT side of the image, leaving empty space on the LEFT for text overlay.
Premium dark background with deep navy (#0a0a1a) to black gradient.
Soft golden neon glow behind the product.
Cinematic rim lighting around edges.
Subtle mirror reflection on glossy dark floor.
Horizontal 16:9 aspect ratio composition.
Luxury brand advertisement quality.
Ultra high resolution, photorealistic, 8K quality.`,
      
      banner: `Ultra-realistic product photography of ${prize_name}.
Product CENTERED horizontally in a wide banner format.
Premium dark background with deep navy to black gradient.
Elegant gold and blue neon glow effects behind product.
Cinematic professional lighting with rim lights.
Subtle ground reflection for depth.
Wide horizontal banner composition (3:1 aspect ratio).
Luxury brand marketing quality.
Ultra high resolution, photorealistic, 8K quality.`,
      
      bonus: `Ultra-realistic product photography of ${prize_name}.
Product CENTERED in a square composition.
Premium dark navy (#0a0a1a) to black gradient background.
Soft golden or electric blue neon glow behind the product.
Cinematic rim lighting highlighting edges.
Subtle mirror-like floor reflection.
Square 1:1 aspect ratio composition.
Luxury premium quality aesthetic.
Ultra high resolution, photorealistic, 8K quality.`,
    };

    const prompt = layoutPrompts[layout];

    console.log(`Generating ${layout} image with Grok 2 for: ${prize_name}`);
    console.log(`Prompt: ${prompt.substring(0, 100)}...`);

    // Call Grok 2 API for text-to-image generation
    const response = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-2-image",
        prompt: prompt,
        n: 1,
        response_format: "b64_json",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Grok API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Překročen limit požadavků, zkuste to později" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `Grok API chyba: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Grok response received");

    // Extract generated image base64
    const imageBase64 = data.data?.[0]?.b64_json;
    if (!imageBase64) {
      console.error("No image in Grok response:", JSON.stringify(data).substring(0, 500));
      return new Response(
        JSON.stringify({ error: "Grok nevygeneroval obrázek" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert base64 to bytes
    const imageBytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));

    // Upload to Supabase Storage
    const fileName = `ai-${layout}-${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("contest-banners")
      .upload(fileName, imageBytes, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: `Chyba při nahrávání: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: urlData } = supabase.storage
      .from("contest-banners")
      .getPublicUrl(fileName);

    console.log(`Successfully generated and uploaded ${layout} image:`, urlData.publicUrl);

    return new Response(
      JSON.stringify({
        success: true,
        url: urlData.publicUrl,
        fileName,
        layout,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error in transform-prize-image:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Neznámá chyba" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
