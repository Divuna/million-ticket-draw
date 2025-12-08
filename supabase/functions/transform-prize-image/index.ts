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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY není nastavený" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { image_base64, image_url, layout, prize_name } = body as {
      image_base64?: string;
      image_url?: string;
      layout: ImageLayout;
      prize_name?: string;
    };

    if (!image_base64 && !image_url) {
      return new Response(
        JSON.stringify({ error: "Chybí image_base64 nebo image_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!layout) {
      return new Response(
        JSON.stringify({ error: "Chybí layout (hero | banner | bonus)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve image source
    let imageDataUrl = image_base64;
    if (!imageDataUrl && image_url) {
      // Fetch image from URL and convert to base64
      const imgResponse = await fetch(image_url);
      if (!imgResponse.ok) {
        return new Response(
          JSON.stringify({ error: "Nepodařilo se stáhnout obrázek z URL" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const imgBuffer = await imgResponse.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));
      const contentType = imgResponse.headers.get("content-type") || "image/png";
      imageDataUrl = `data:${contentType};base64,${base64}`;
    }

    // Build layout-specific prompts
    const layoutPrompts: Record<ImageLayout, string> = {
      hero: `Transform this product image into a premium OneMil-style hero graphic:
- Dark navy to black gradient background
- Soft gold or blue neon glow behind the object
- Cinematic lighting with highlights
- Subtle ground reflection under the object
- Keep the original object exactly as is - do not alter its shape or details
- Object positioned on the RIGHT side of the image
- Empty space on the LEFT side for text overlay
- 16:9 aspect ratio, horizontal layout
- Ultra high resolution, professional quality`,
      
      banner: `Transform this product image into a premium OneMil-style banner graphic:
- Dark navy to black gradient background
- Soft gold or blue neon glow behind the object
- Cinematic lighting with highlights
- Subtle ground reflection under the object
- Keep the original object exactly as is - do not alter its shape or details
- Object CENTERED horizontally
- Wide horizontal banner format (3:1 aspect ratio)
- Ultra high resolution, professional quality`,
      
      bonus: `Transform this product image into a premium OneMil-style square graphic:
- Dark navy to black gradient background
- Soft gold or blue neon glow behind the object
- Cinematic lighting with highlights
- Subtle ground reflection under the object
- Keep the original object exactly as is - do not alter its shape or details
- Object centered in a square composition
- 1:1 aspect ratio
- Ultra high resolution, professional quality`,
    };

    const prompt = layoutPrompts[layout] + (prize_name ? `\nProduct: ${prize_name}` : "");

    console.log(`Generating ${layout} image with Lovable AI...`);

    // Call Lovable AI Gateway with image editing
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Překročen limit požadavků, zkuste to později" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Nedostatek kreditů, dobijte si účet" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `AI chyba: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("AI response received");

    // Extract generated image
    const generatedImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!generatedImageUrl) {
      console.error("No image in response:", JSON.stringify(data).substring(0, 500));
      return new Response(
        JSON.stringify({ error: "AI nevygenerovala obrázek" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract base64 data from data URL
    const base64Match = generatedImageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      return new Response(
        JSON.stringify({ error: "Neplatný formát vygenerovaného obrázku" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const imageFormat = base64Match[1];
    const imageBase64Data = base64Match[2];
    const imageBytes = Uint8Array.from(atob(imageBase64Data), (c) => c.charCodeAt(0));

    // Upload to Supabase Storage
    const fileName = `ai-${layout}-${Date.now()}.${imageFormat}`;
    const { error: uploadError } = await supabase.storage
      .from("contest-banners")
      .upload(fileName, imageBytes, {
        contentType: `image/${imageFormat}`,
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
