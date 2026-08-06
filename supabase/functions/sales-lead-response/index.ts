import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const BASE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const layout = (title: string, content: string): string => `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow,noarchive" />
  <title>${escapeHtml(title)} | OneMil</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      font-family: Arial, Helvetica, sans-serif;
      color: #292524;
      background:
        radial-gradient(circle at top right, rgba(249,115,22,.13), transparent 34%),
        linear-gradient(145deg, #fffdf8 0%, #f8f5ef 100%);
    }
    .shell { width: 100%; max-width: 560px; }
    .brand {
      margin: 0 0 18px;
      text-align: center;
      font-size: 28px;
      line-height: 1;
      font-weight: 800;
      letter-spacing: -.04em;
      color: #292524;
    }
    .brand span { color: #f97316; }
    .card {
      padding: 34px;
      border: 1px solid #ebe5dc;
      border-radius: 22px;
      background: rgba(255,255,255,.96);
      box-shadow: 0 22px 60px rgba(68,54,42,.12);
    }
    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 52px;
      margin-bottom: 18px;
      border-radius: 16px;
      background: #fff1e8;
      color: #ea580c;
      font-size: 25px;
      font-weight: 800;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 27px;
      line-height: 1.2;
      letter-spacing: -.025em;
    }
    p {
      margin: 0 0 18px;
      color: #57534e;
      font-size: 16px;
      line-height: 1.65;
    }
    .field { margin-top: 18px; }
    label {
      display: block;
      margin-bottom: 7px;
      font-size: 14px;
      font-weight: 700;
      color: #44403c;
    }
    input {
      width: 100%;
      height: 48px;
      padding: 0 14px;
      border: 1px solid #d6d3d1;
      border-radius: 11px;
      background: #fff;
      color: #292524;
      font: inherit;
      outline: none;
    }
    input:focus {
      border-color: #f97316;
      box-shadow: 0 0 0 3px rgba(249,115,22,.14);
    }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 49px;
      margin-top: 22px;
      padding: 12px 18px;
      border: 0;
      border-radius: 11px;
      background: #f97316;
      color: #fff;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
      text-decoration: none;
    }
    .button:hover { background: #ea580c; }
    .button.secondary {
      background: #fff;
      color: #44403c;
      border: 1px solid #d6d3d1;
    }
    .button.secondary:hover { background: #fafaf9; }
    .note {
      margin-top: 18px;
      color: #78716c;
      font-size: 13px;
      line-height: 1.5;
    }
    .error {
      padding: 12px 14px;
      border-radius: 10px;
      background: #fef2f2;
      color: #b91c1c;
      font-size: 14px;
      line-height: 1.5;
    }
    @media (max-width: 520px) {
      body { padding: 16px; align-items: flex-start; }
      .shell { margin-top: 7vh; }
      .card { padding: 25px 20px; border-radius: 18px; }
      h1 { font-size: 23px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <div class="brand">One<span>Mil</span></div>
    <section class="card">${content}</section>
  </main>
</body>
</html>`;

const htmlResponse = (title: string, content: string, status = 200): Response =>
  new Response(layout(title, content), { status, headers: BASE_HEADERS });

const errorPage = (message: string, status = 400): Response =>
  htmlResponse(
    "Odkaz nelze použít",
    `<div class="icon">!</div>
     <h1>Odkaz nelze použít</h1>
     <p>${escapeHtml(message)}</p>`,
    status,
  );

const successPage = (action: "interest" | "decline"): Response => {
  if (action === "interest") {
    return htmlResponse(
      "Děkujeme za zájem",
      `<div class="icon">✓</div>
       <h1>Děkujeme za projevený zájem</h1>
       <p>Váš kontakt jsme přijali. Brzy se vám ozveme a společně probereme možnosti spolupráce.</p>`,
    );
  }
  return htmlResponse(
    "Odhlášení potvrzeno",
    `<div class="icon">✓</div>
     <h1>Děkujeme za odpověď</h1>
     <p>Další obchodní nabídky vám již nebudeme zasílat a evidujeme, že nyní nemáte zájem o spolupráci.</p>`,
  );
};

const interestForm = (token: string, error = ""): Response =>
  htmlResponse(
    "Mám zájem o spolupráci",
    `<div class="icon">✓</div>
     <h1>Děkujeme za projevený zájem</h1>
     <p>Vyplňte prosím své jméno a telefonní číslo. Ozveme se vám a společně probereme možnosti spolupráce.</p>
     ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
     <form method="post">
       <input type="hidden" name="token" value="${escapeHtml(token)}" />
       <input type="hidden" name="action" value="interest" />
       <div class="field">
         <label for="name">Jméno a příjmení</label>
         <input id="name" name="name" type="text" autocomplete="name" minlength="2" maxlength="120" required />
       </div>
       <div class="field">
         <label for="phone">Telefonní číslo</label>
         <input id="phone" name="phone" type="tel" autocomplete="tel" minlength="6" maxlength="40" required />
       </div>
       <button class="button" type="submit">Odeslat kontakt</button>
     </form>
     <div class="note">Kontakt použijeme pouze k domluvě ohledně spolupráce s OneMil.</div>`,
  );

const declineForm = (token: string): Response =>
  htmlResponse(
    "Nemám zájem",
    `<div class="icon">×</div>
     <h1>Nemáte zájem o spolupráci?</h1>
     <p>Po potvrzení vám nebudeme zasílat další obchodní nabídky OneMil a vaši odpověď uložíme k oslovené firmě.</p>
     <form method="post">
       <input type="hidden" name="token" value="${escapeHtml(token)}" />
       <input type="hidden" name="action" value="decline" />
       <button class="button secondary" type="submit">Ano, nemám zájem</button>
     </form>`,
  );

const validToken = (value: string): boolean => /^[0-9a-f]{64}$/i.test(value);
const validAction = (value: string): value is "interest" | "decline" =>
  value === "interest" || value === "decline";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readForm(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const parsed = await req.json().catch(() => ({}));
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => [key, String(value)]),
    );
  }
  const form = await req.formData().catch(() => null);
  if (!form) return {};
  const output: Record<string, string> = {};
  for (const key of ["token", "action", "name", "phone"]) {
    const value = form.get(key);
    if (typeof value === "string") output[key] = value;
  }
  return output;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "method_not_allowed" }), {
      status: 405,
      headers: { ...jsonHeaders, Allow: "GET, POST" },
    });
  }

  const client = getClient();
  if (!client) return errorPage("Služba je dočasně nedostupná.", 503);

  if (req.method === "GET") {
    const url = new URL(req.url);
    const token = (url.searchParams.get("token") ?? "").trim();
    const action = (url.searchParams.get("action") ?? "").trim().toLowerCase();
    if (!validToken(token) || !validAction(action)) {
      return errorPage("Odkaz je neplatný nebo neúplný.", 404);
    }

    const tokenHash = await sha256Hex(token.toLowerCase());
    const { data, error } = await client
      .from("sales_lead_email_response_tokens")
      .select("status,expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error || !data) return errorPage("Odkaz nebyl nalezen.", 404);
    if (new Date(data.expires_at).getTime() <= Date.now()) {
      return errorPage("Platnost tohoto odkazu již vypršela.", 410);
    }
    if (data.status === "interested") return successPage("interest");
    if (data.status === "declined") return successPage("decline");
    if (data.status !== "pending") return errorPage("Odpověď již byla zpracována.", 409);

    // GET is intentionally read-only. E-mail scanners and link previews cannot
    // submit either decision merely by opening the URL.
    return action === "interest" ? interestForm(token) : declineForm(token);
  }

  const body = await readForm(req);
  const token = (body.token ?? "").trim();
  const action = (body.action ?? "").trim().toLowerCase();
  const name = (body.name ?? "").trim();
  const phone = (body.phone ?? "").trim();

  if (!validToken(token) || !validAction(action)) {
    return errorPage("Odkaz je neplatný nebo neúplný.", 404);
  }
  if (action === "interest" && (name.length < 2 || phone.length < 6)) {
    return interestForm(token, "Vyplňte prosím platné jméno a telefonní číslo.");
  }

  const tokenHash = await sha256Hex(token.toLowerCase());
  const { data, error } = await client.rpc("sales_lead_email_response_submit", {
    p_token_hash: tokenHash,
    p_action: action,
    p_name: action === "interest" ? name : null,
    p_phone: action === "interest" ? phone : null,
  });

  const result = (data ?? {}) as {
    success?: boolean;
    error?: string;
    action?: "interest" | "decline";
    idempotent_replay?: boolean;
  };

  if (error || result.success !== true) {
    if (result.error === "expired_token") {
      return errorPage("Platnost tohoto odkazu již vypršela.", 410);
    }
    if (result.error === "invalid_name" || result.error === "invalid_phone") {
      return interestForm(token, "Vyplňte prosím platné jméno a telefonní číslo.");
    }
    if (result.error === "response_already_recorded") {
      return errorPage("Tento odkaz už byl použit pro jinou odpověď.", 409);
    }
    if (result.error === "lead_not_actionable") {
      return errorPage("Tuto odpověď již nelze u firmy změnit.", 409);
    }
    return errorPage("Odpověď se nepodařilo uložit. Zkuste to prosím později.", 500);
  }

  return successPage(result.action ?? action);
});
