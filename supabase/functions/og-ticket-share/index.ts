import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { render } from "https://deno.land/x/resvg_wasm/mod.ts";

/**
 * Náhledový obrázek sdíleného tiketu (Facebook / X / Open Graph).
 *
 * Rozhodnutí Pavla (deska 26): ve sdílení se NIKDY neukazuje číslo tiketu –
 * jen soutěž, hlavní výhra a pozvánka „Zkus to taky na onemil.cz“.
 * `id` má tvar `${contestId}-${ticketNumber}`; číslo tiketu se jen odřízne a nepoužije.
 * Název soutěže a výhra se čtou jako veřejná data (anon klíč + RLS), bez osobních údajů.
 */

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;

const headers = {
  "Content-Type": "image/png",
  "Cache-Control": "public, max-age=3600",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const escapeSvgText = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

/** Zkrátí text na max. délku (obrázek nemá zalamování). */
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Veřejný název soutěže a hlavní výhra; při jakékoli chybě null (obrázek se vykreslí i bez nich). */
async function loadContest(contestId: string): Promise<{ title: string; prize: string | null } | null> {
  if (!UUID_RE.test(contestId)) return null;
  const base = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!base || !anon) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(
      `${base}/rest/v1/contests?id=eq.${contestId}&select=title,main_prize&limit=1`,
      { headers: { apikey: anon, Authorization: `Bearer ${anon}` }, signal: ctrl.signal },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ title?: string | null; main_prize?: string | null }>;
    const row = rows?.[0];
    if (!row?.title) return null;
    return { title: row.title, prize: row.main_prize ?? null };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

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

  // contestId = vše před posledním segmentem (číslo tiketu se zahazuje).
  const contestId = ticketId.replace(/-\d+$/, "");
  const contest = await loadContest(contestId);

  const safeTitle = escapeSvgText("Zkusil jsem štěstí na OneMil!");
  const safeContest = contest ? escapeSvgText(clip(contest.title, 34)) : "";
  const safePrize = contest?.prize ? escapeSvgText(clip(`Hlavní výhra: ${contest.prize}`, 52)) : "";
  const safeInvite = escapeSvgText("Zkus to taky na onemil.cz");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="70%" cy="0%" r="110%">
      <stop offset="0%" stop-color="#4A0D18"/>
      <stop offset="45%" stop-color="#17090C"/>
      <stop offset="100%" stop-color="#08080A"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFF1C2"/>
      <stop offset="50%" stop-color="#E9B949"/>
      <stop offset="100%" stop-color="#A8741F"/>
    </linearGradient>
    <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#B5122B"/>
      <stop offset="100%" stop-color="#E9B949"/>
    </linearGradient>
  </defs>

  <rect width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="url(#bg)"/>
  <!-- zlatý rámeček tiketu -->
  <rect x="40" y="40" width="${IMAGE_WIDTH - 80}" height="${IMAGE_HEIGHT - 80}" rx="34" fill="none" stroke="#E9B949" stroke-opacity="0.6" stroke-width="3"/>
  <circle cx="40" cy="${IMAGE_HEIGHT / 2}" r="26" fill="#08080A"/>
  <circle cx="${IMAGE_WIDTH - 40}" cy="${IMAGE_HEIGHT / 2}" r="26" fill="#08080A"/>

  <text x="100" y="140" font-family="Inter, sans-serif" font-size="24" font-weight="800" letter-spacing="6" fill="#F2C55C">MŮJ TIKET · ONEMIL</text>

  <text x="100" y="250" font-family="Inter, sans-serif" font-size="62" font-weight="900" font-style="italic" fill="url(#gold)">${safeTitle}</text>
  <rect x="100" y="280" width="120" height="7" rx="3" fill="url(#line)"/>

  ${safeContest ? `<text x="100" y="370" font-family="Inter, sans-serif" font-size="44" font-weight="800" fill="#FFFFFF">${safeContest}</text>` : ""}
  ${safePrize ? `<text x="100" y="425" font-family="Inter, sans-serif" font-size="30" font-weight="600" fill="#C9CDD4">${safePrize}</text>` : ""}

  <text x="100" y="${safeContest ? 530 : 390}" font-family="Inter, sans-serif" font-size="34" font-weight="800" fill="#F6D77A">${safeInvite}</text>
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
