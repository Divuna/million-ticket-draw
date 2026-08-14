// Jediný zdroj pravdy pro CTA blok „Mám zájem“ / „Nemám zájem“ na konci prvního
// obchodního e-mailu.
//
// Spec: docs/SALES_LEADS_ADMIN_SPEC.md §25.
//
// Markup je 1:1 zrcadlo DB triggeru `sales_lead_email_prepare_response_links()`
// (migrace 20260806113000), aby ruční i dávková cesta produkovaly PŘESNĚ stejný
// e-mail. Když se změní jedna strana, musí se změnit i druhá — hlídá to spec 107.
//
// Pravidla:
//   • obě tlačítka míří na veřejnou stránku https://onemil.cz/partner-response.html,
//   • NIKDY se nepoužívá mailto ani odpověď na b2b@onemil.cz,
//   • každý příjemce má vlastní token,
//   • blok se přidává PŘED uzamčením snapshotu, takže preview i odeslaný e-mail
//     obsahují totéž.

export const RESPONSE_PUBLIC_PAGE = "https://onemil.cz/partner-response.html";

export const ALLOWED_RESPONSE_PROJECT_REFS = new Set([
  "dxmowysntemfqfnanxua",
  "xkzhjldrojjlrkezorey",
]);

export type ResponseCtaUrls = { interestUrl: string; declineUrl: string };

export type ResponseCtaBlock = {
  /** Markdown zdroj (ukládá se do body_source_snapshot). */
  source: string;
  /** Čitelné odkazy pro textovou verzi. */
  text: string;
  /** Vizuální tlačítka pro HTML verzi. */
  html: string;
};

/** Ověří, že jde o 64místný hex token (stejný formát jako v DB CHECK constraintu). */
export function isValidResponseToken(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

/** Project ref z URL Supabase projektu; `null`, pokud není na seznamu povolených. */
export function responseProjectRefFromUrl(rawUrl: string): string | null {
  try {
    const hostname = new URL(rawUrl).hostname;
    const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    const ref = match?.[1]?.toLowerCase() ?? "";
    return ALLOWED_RESPONSE_PROJECT_REFS.has(ref) ? ref : null;
  } catch {
    return null;
  }
}

/** Sestaví obě CTA URL pro daný token. Obě sdílejí TENTÝŽ token. */
export function buildResponseCtaUrls(projectRef: string, token: string): ResponseCtaUrls {
  const base = `${RESPONSE_PUBLIC_PAGE}?project=${projectRef}&token=${token}`;
  return {
    interestUrl: `${base}&action=interest`,
    declineUrl: `${base}&action=decline`,
  };
}

const escapeHtmlAttr = (value: string): string => value.replaceAll("&", "&amp;");

/**
 * CTA blok ve všech třech podobách. Markup se musí shodovat s DB triggerem.
 */
export function buildResponseCtaBlock({ interestUrl, declineUrl }: ResponseCtaUrls): ResponseCtaBlock {
  const htmlInterest = escapeHtmlAttr(interestUrl);
  const htmlDecline = escapeHtmlAttr(declineUrl);
  return {
    source:
      "\n\n**Vyberte prosím:**"
      + `\n\n[Mám zájem](${interestUrl})`
      + `\n\n[Nemám zájem](${declineUrl})`,
    text:
      `\n\nMám zájem: ${interestUrl}`
      + `\nNemám zájem: ${declineUrl}`,
    html:
      '<div style="margin-top:24px;padding-top:20px;border-top:1px solid #eee7dc;font-family:Arial,sans-serif">'
      + '<div style="margin:0 0 12px 0;font-size:14px;color:#4b5563">Vyberte prosím:</div>'
      + `<a href="${htmlInterest}" style="display:inline-block;margin:0 10px 10px 0;padding:12px 20px;border-radius:10px;background:#f97316;color:#ffffff;text-decoration:none;font-weight:700">Mám zájem</a>`
      + `<a href="${htmlDecline}" style="display:inline-block;margin:0 0 10px 0;padding:11px 18px;border-radius:10px;border:1px solid #d6d3d1;background:#ffffff;color:#57534e;text-decoration:none;font-weight:600">Nemám zájem</a>`
      + "</div>",
  };
}

/**
 * Náhled používá stejný blok, jen s neaktivním zástupným tokenem — skutečný
 * token vznikne až při odeslání a je pro každého příjemce jiný.
 */
export const PREVIEW_RESPONSE_TOKEN = "0".repeat(64);

/** Tři podoby těla e-mailu ukládané do snapshotu i odesílané příjemci. */
export type ComposedEmailBodies = {
  /** Markdown zdroj (body_source_snapshot). */
  source: string;
  /** Plaintextová MIME alternativa (body_text_snapshot). */
  text: string;
  /** HTML verze (body_html_snapshot). */
  html: string;
};

/**
 * Složí finální tělo prvního obchodního e-mailu.
 *
 * KRITICKÉ: CTA se připojuje AŽ ZA vyrenderovaný text člověka, nikdy se
 * nepouští přes obecný renderer. `renderSalesLeadEmailText` totiž převádí
 * `[popisek](url)` na holý `popisek` a URL zahazuje — CTA by tak v plaintextu
 * přišlo o odkaz a v HTML by místo tlačítek vznikly obyčejné odkazy.
 * Proto se používá `cta.text` a `cta.html`, ne `cta.source`.
 *
 * Stejné pořadí (render → append) používá i DB trigger dávkové cesty
 * `sales_lead_email_prepare_response_links`, takže obě cesty dávají shodný
 * výsledek. Hlídá to spec 108.
 *
 * `cta = null` (reuse/forward, follow-up) → tělo zůstane beze změny.
 */
export function composeInitialEmailBodies(
  humanBody: string,
  cta: ResponseCtaBlock | null,
  renderText: (value: string) => string,
  renderHtml: (value: string) => string,
): ComposedEmailBodies {
  return {
    source: `${humanBody}${cta?.source ?? ""}`,
    text: `${renderText(humanBody)}${cta?.text ?? ""}`,
    html: `${renderHtml(humanBody)}${cta?.html ?? ""}`,
  };
}
