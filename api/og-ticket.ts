export default async function handler(req: any, res: any) {
  const rawId = req?.query?.id;
  const ticketId = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!ticketId || typeof ticketId !== "string") {
    res.status(400).setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
    res.end("<!doctype html><html><body>Missing ticket id</body></html>");
    return;
  }

  const supabaseOgUrl = `https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/og-ticket-share?id=${encodeURIComponent(
    ticketId
  )}`;

  const incomingUserAgent =
    req?.headers?.["user-agent"] || req?.headers?.["User-Agent"] || "";

  const upstream = await fetch(supabaseOgUrl, {
    method: "GET",
    redirect: "manual",
    headers: {
      // Forward UA so the Edge Function can decide between OG HTML vs redirect.
      "User-Agent": String(incomingUserAgent),
    },
  });

  // Note: we intentionally do NOT return JSON; return the HTML body.
  const body = await upstream.text();

  res.status(upstream.status);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");

  // Preserve redirects if the upstream decides to redirect (should be rare for crawlers).
  const location = upstream.headers.get("location");
  if (upstream.status >= 300 && upstream.status < 400 && location) {
    res.setHeader("Location", location);
  }

  res.end(body);
}

