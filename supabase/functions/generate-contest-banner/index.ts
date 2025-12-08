// --- Imports ---
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- CORS ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Start Server ---
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Load GROK API KEY ---
    const grokKey = Deno.env.get("GROK_API_KEY");
    if (!grokKey) {
      console.error("GROK_API_KEY missing");
      return new Response(JSON.stringify({ error: "GROK API key není nakonfigurován" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Supabase ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // --- Get input data ---
    const { title, description, main_prize, ticket_count, ticket_price, bonus_summary } = await req.json();

    if (!title || !main_prize) {
      return new Response(JSON.stringify({ error: "Název soutěže a hlavní cena jsou povinné" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("⭐ Generuji banner pomocí Groku…");

    // --- Build image prompt ---
    const prompt = `
Create a high-quality promotional banner for a sweepstakes/contest.

Details:
- Contest title: "${title}"
- Main prize: "${main_prize}"
${description ? `- Description: ${description}` : ""}
${ticket_count ? `- Total tickets: ${ticket_count}` : ""}
${ticket_price ? `- Ticket price: ${ticket_price} MioCoins` : ""}
${bonus_summary ? `- Bonus prizes: ${bonus_summary}` : ""}

Visual style:
- Modern, cinematic, vibrant lighting
- Luxurious, exciting atmosphere
- Show the main prize visually
- NO TEXT in the image
- Landscape banner format, wide layout
- Sharp, professional, marketing-ready
    `.trim();

    // --- Call GROK IMAGE API ---
    const response = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${grokKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-image-1",
        prompt,
        size: "1536x1024",
        response_format: "b64_json",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("❌ Grok API error:", err);
      return new Response(JSON.stringify({ error: `Chyba při generování obrázku: ${response.status}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await response.json();
    const b64 = json.data?.[0]?.b64_json;

    if (!b64) {
      console.error("❌ Missing image data:", json);
      return new Response(JSON.stringify({ error: "Grok nevrátil obrázek" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Convert base64 to binary ---
    const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    // --- Create filename ---
    const timestamp = Date.now();
    const sanitized = title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .substring(0, 30);
    const fileName = `ai-banner-${sanitized}-${timestamp}.png`;

    // --- Upload to Supabase Storage ---
    const { error: uploadError } = await supabase.storage.from("contest-banners").upload(fileName, binary, {
      contentType: "image/png",
    });

    if (uploadError) {
      console.error("❌ Upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Chyba při ukládání banneru" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Get public URL ---
    const { data: publicUrlData } = supabase.storage.from("contest-banners").getPublicUrl(fileName);

    console.log("✅ Banner hotový:", publicUrlData.publicUrl);

    // --- Return success ---
    return new Response(
      JSON.stringify({
        success: true,
        url: publicUrlData.publicUrl,
        fileName,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("❌ Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Neočekávaná chyba serveru" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
