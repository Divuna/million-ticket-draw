import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { render } from "https://deno.land/x/resvg_wasm/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;

const escapeText = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const queryTicketId =
      url.searchParams.get("ticketId") ?? url.searchParams.get("id") ?? "";

    let ticketId = queryTicketId;

    // Allow body input too (useful for POST).
    if (!ticketId && req.method !== "GET") {
      const body = await req.json().catch(() => null);
      ticketId = (body?.ticketId ?? body?.id ?? "") as string;
    }

    if (!ticketId || typeof ticketId !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing required parameter: ticketId" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const ticketNumber = ticketId.split("-").pop() || ticketId;
    const safeTicketNumber = escapeText(String(ticketNumber));

    // Build SVG (1200x630) then render to PNG bytes via Resvg.
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- dark gradient background (black -> navy) -->
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000"/>
      <stop offset="100%" stop-color="#061a3a"/>
    </linearGradient>

    <radialGradient id="vignette" cx="50%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.62"/>
    </radialGradient>

    <!-- glass card -->
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="35%" stop-color="#d4af37" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.04"/>
    </linearGradient>

    <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="10" result="blur"/>
      <feColorMatrix
        in="blur"
        type="matrix"
        values="1 0 0 0 0  0 0.85 0 0 0  0 0 0.2 0 0  0 0 0 1 0"
        result="goldBlur"/>
      <feMerge>
        <feMergeNode in="goldBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <filter id="cardShadow" x="-25%" y="-25%" width="150%" height="150%">
      <feGaussianBlur stdDeviation="16" result="shadow"/>
      <feColorMatrix
        in="shadow"
        type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0"
        result="shadowAlpha"/>
      <feOffset dx="0" dy="18" in="shadowAlpha" result="offsetShadow"/>
      <feMerge>
        <feMergeNode in="offsetShadow"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <filter id="particleBlur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.2"/>
    </filter>
  </defs>

  <rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="url(#bg)"/>
  <rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="url(#vignette)"/>

  <!-- subtle gold particles -->
  <g filter="url(#particleBlur)" opacity="0.95">
    <circle cx="120" cy="120" r="3.4" fill="#D4AF37" opacity="0.30"/>
    <circle cx="230" cy="160" r="2.2" fill="#D4AF37" opacity="0.22"/>
    <circle cx="340" cy="95" r="2.8" fill="#D4AF37" opacity="0.18"/>
    <circle cx="520" cy="135" r="1.9" fill="#D4AF37" opacity="0.17"/>
    <circle cx="840" cy="125" r="3.1" fill="#D4AF37" opacity="0.25"/>
    <circle cx="980" cy="175" r="2.4" fill="#D4AF37" opacity="0.20"/>
    <circle cx="1080" cy="120" r="1.9" fill="#D4AF37" opacity="0.16"/>
    <circle cx="120" cy="520" r="2.6" fill="#D4AF37" opacity="0.16"/>
    <circle cx="1020" cy="520" r="2.7" fill="#D4AF37" opacity="0.16"/>
    <circle cx="600" cy="560" r="1.8" fill="#D4AF37" opacity="0.14"/>
  </g>

  <!-- glass card (rounded rectangle with light border) -->
  <g filter="url(#cardShadow)">
    <rect x="84" y="88" width="${IMAGE_WIDTH - 168}" height="${IMAGE_HEIGHT - 176}" rx="56"
      fill="#ffffff" fill-opacity="0.06"
      stroke="#D4AF37" stroke-opacity="0.35" stroke-width="2.5"/>

    <!-- glass highlight -->
    <path d="M 140 150 C 260 88, 430 90, 560 150
             C 440 170, 320 210, 210 250
             C 160 230, 130 205, 140 150 Z"
          fill="#ffffff" opacity="0.06"/>

    <path d="M 620 170 C 740 110, 900 120, 1080 250
             L 1080 310 C 950 250, 820 245, 660 310
             C 610 290, 585 240, 620 170 Z"
          fill="#D4AF37" opacity="0.05"/>

    <!-- subtle inner frame -->
    <rect x="108" y="112" width="${IMAGE_WIDTH - 216}" height="${IMAGE_HEIGHT - 224}" rx="48"
      fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="2"/>
  </g>

  <!-- big gold glowing ticket number (#${safeTicketNumber}) -->
  <text x="${IMAGE_WIDTH / 2}" y="275"
        text-anchor="middle"
        font-family="Inter, sans-serif"
        font-size="200"
        font-weight="900"
        fill="#D4AF37"
        filter="url(#goldGlow)">
    #${safeTicketNumber}
  </text>

  <!-- headline -->
  <text x="${IMAGE_WIDTH / 2}" y="368"
        text-anchor="middle"
        font-family="Inter, sans-serif"
        font-size="64"
        font-weight="850"
        fill="#FFFFFF">
    Jsem ve hře o výhru 🔥
  </text>

  <!-- subtitle -->
  <text x="${IMAGE_WIDTH / 2}" y="452"
        text-anchor="middle"
        font-family="Inter, sans-serif"
        font-size="40"
        font-weight="650"
        fill="#B9C2D1">
    Zkus to taky na onemil.cz
  </text>

  <!-- small OneMil branding bottom corners -->
  <text x="110" y="598"
        text-anchor="start"
        font-family="Inter, sans-serif"
        font-size="24"
        font-weight="800"
        fill="#D4AF37"
        opacity="0.55">
    OneMil
  </text>
  <text x="${IMAGE_WIDTH - 110}" y="598"
        text-anchor="end"
        font-family="Inter, sans-serif"
        font-size="24"
        font-weight="800"
        fill="#D4AF37"
        opacity="0.55">
    OneMil
  </text>
</svg>`;

    const pngBytes = await render(svg, {
      // Ensure deterministic sizing.
      // Resvg takes SVG's width/height; this option is a no-op if unsupported.
      fitTo: [IMAGE_WIDTH, IMAGE_HEIGHT],
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const filename = `${ticketId}.png`; // deterministic

    const { error: uploadError } = await supabase.storage
      .from("ticket-shares")
      .upload(filename, pngBytes, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      return new Response(
        JSON.stringify({ ok: false, error: uploadError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: urlData } = supabase.storage
      .from("ticket-shares")
      .getPublicUrl(filename);

    return new Response(
      JSON.stringify({ ok: true, publicUrl: urlData.publicUrl, filename }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

