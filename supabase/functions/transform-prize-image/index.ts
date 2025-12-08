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

    // Build layout-specific prompts - STRICT image-to-image editing
    const layoutPrompts: Record<ImageLayout, string> = {
      hero: `IMPORTANT: This is an IMAGE EDIT task. You MUST preserve the exact object from the uploaded image.

STRICT RULES:
- DO NOT generate a new object
- DO NOT replace, modify, or alter the original object in any way
- The object (car, watch, phone, etc.) must remain 100% identical to the uploaded image
- ONLY modify: background, lighting, glow effects, and reflections

REQUIRED STYLE (OneMil premium):
- Background: dark navy (#0a0a1a) to pure black (#000000) gradient
- Glow: soft gold (#d4a017) or electric blue (#00a8ff) neon glow behind the object
- Lighting: cinematic rim-lighting around the object edges
- Reflection: subtle mirror-like ground reflection under the object

LAYOUT:
- Position the UNCHANGED object on the RIGHT side of the image
- Leave empty space on the LEFT side for text overlay
- Horizontal 16:9 aspect ratio
- Ultra high resolution output`,
      
      banner: `IMPORTANT: This is an IMAGE EDIT task. You MUST preserve the exact object from the uploaded image.

STRICT RULES:
- DO NOT generate a new object
- DO NOT replace, modify, or alter the original object in any way
- The object (car, watch, phone, etc.) must remain 100% identical to the uploaded image
- ONLY modify: background, lighting, glow effects, and reflections

REQUIRED STYLE (OneMil premium):
- Background: dark navy (#0a0a1a) to pure black (#000000) gradient
- Glow: soft gold (#d4a017) or electric blue (#00a8ff) neon glow behind the object
- Lighting: cinematic rim-lighting around the object edges
- Reflection: subtle mirror-like ground reflection under the object

LAYOUT:
- Position the UNCHANGED object CENTERED horizontally
- Wide horizontal banner format (3:1 aspect ratio)
- Ultra high resolution output`,
      
      bonus: `IMPORTANT: This is an IMAGE EDIT task. You MUST preserve the exact object from the uploaded image.

STRICT RULES:
- DO NOT generate a new object
- DO NOT replace, modify, or alter the original object in any way
- The object (car, watch, phone, etc.) must remain 100% identical to the uploaded image
- ONLY modify: background, lighting, glow effects, and reflections

REQUIRED STYLE (OneMil premium):
- Background: dark navy (#0a0a1a) to pure black (#000000) gradient
- Glow: soft gold (#d4a017) or electric blue (#00a8ff) neon glow behind the object
- Lighting: cinematic rim-lighting around the object edges
- Reflection: subtle mirror-like ground reflection under the object

LAYOUT:
- Position the UNCHANGED object CENTERED in a square composition
- 1:1 aspect ratio
- Ultra high resolution output`,
    };

    const prompt = layoutPrompts[layout] + (prize_name ? `\nProduct: ${prize_name}` : "");

    console.log(`Generating ${layout} image with Lovable AI (image-to-image mode)...`);
    console.log(`Input image URL prefix: ${imageDataUrl?.substring(0, 50)}...`);
    console.log(`Prompt length: ${prompt.length} chars`);

    // Call Lovable AI Gateway with image editing (image-to-image mode)
    // The image is passed as image_url in the message content - this is the correct
    // way to do image editing with Lovable AI's chat completions endpoint
    const requestBody = {
      model: "google/gemini-2.5-flash-image-preview",
      messages: [
        {
          role: "user",
          content: [
            { 
              type: "image_url", 
              image_url: { url: imageDataUrl } 
            },
            { 
              type: "text", 
              text: prompt 
            },
          ],
        },
      ],
      modalities: ["image", "text"],
    };

    console.log("Sending image-to-image request to Lovable AI Gateway...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
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
