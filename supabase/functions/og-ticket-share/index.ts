import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { render } from "https://deno.land/x/resvg_wasm/mod.ts";

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;

const headers = {
  "Content-Type": "image/png",
  "Cache-Control": "public, max-age=3600",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const escapeSvgText = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  const url = new URL(req.url);
  const ticketId = url.searchParams.get("id") ?? "";

  if (!ticketId) {
    return new Response("Missing query param: id", { status: 400, headers });
  }

  // Extract ticket number from ticketId (format: contestId-ticketNumber)
  const ticketNumber = ticketId.split("-").pop() || ticketId;
  const safeTicketNumber = escapeSvgText(String(ticketNumber));

  // Required texts
  const titleText = "Zkusil jsem štěstí na OneMil!";
  const subtitleText = `Ticket #${ticketNumber}`;

  const safeTitle = escapeSvgText(titleText);
  const safeSubtitle = escapeSvgText(subtitleText);

  // Render SVG -> PNG, then return PNG bytes (no redirects).
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- dark gradient background -->
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000"/>
      <stop offset="100%" stop-color="#061a3a"/>
    </linearGradient>

    <radialGradient id="vignette" cx="50%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.65"/>
    </radialGradient>

    <!-- gold glow -->
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
  </defs>

  <rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="url(#bg)"/>
  <rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="url(#vignette)"/>

  <!-- title -->
  <text x="${IMAGE_WIDTH / 2}" y="210"
    text-anchor="middle"
    font-family="Inter, sans-serif"
    font-size="54"
    font-weight="900"
    fill="#D4AF37"
    filter="url(#goldGlow)">
    ${safeTitle}
  </text>

  <!-- subtitle -->
  <text x="${IMAGE_WIDTH / 2}" y="360"
    text-anchor="middle"
    font-family="Inter, sans-serif"
    font-size="90"
    font-weight="900"
    fill="#D4AF37"
    filter="url(#goldGlow)">
    ${safeSubtitle}
  </text>

  <!-- small footer text -->
  <text x="70" y="580"
    text-anchor="start"
    font-family="Inter, sans-serif"
    font-size="26"
    font-weight="800"
    fill="#D4AF37"
    opacity="0.55">
    OneMil
  </text>
</svg>`;

  let imageBuffer: Uint8Array;
  try {
    imageBuffer = await render(svg, { fitTo: [IMAGE_WIDTH, IMAGE_HEIGHT] });
  } catch {
    return new Response("Failed to render image", {
      status: 500,
      headers,
    });
  }

  return new Response(imageBuffer, {
    status: 200,
    headers,
  });
});

