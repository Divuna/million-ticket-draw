/**
 * Jednotná kostra automatických e-mailů OneMil (redesign, deska „Ikona, notifikace a e-maily“):
 * tmavá hlavička se zlatou linkou, světlá karta, zlaté tlačítko. Atribut
 * `data-onemil-email="light-cream"` zůstává jako značka „už je ve sdílené kostře“.
 */
export const ONE_MIL_EMAIL_LOGO_URL = "https://onemil.cz/brand/onemil-logo-email.png";

export const ONE_MIL_EMAIL_COLORS = {
  page: "#F5EEE3",
  card: "#FFFFFF",
  panel: "#FBF5EA",
  accent: "#8A5A10",
  accentSoft: "#F1E4CC",
  line: "#E9B949",
  text: "#17171B",
  muted: "#5E5B57",
  white: "#FFFFFF",
  header: "#17171B",
  gold: "#E9B949",
  goldLight: "#FFE29A",
  goldDeep: "#C2902F",
  crimson: "#B5122B",
  buttonText: "#1A1205",
} as const;

export type OneMilEmailAction = {
  label: string;
  url: string;
};

export type OneMilEmailCodeBox = {
  label: string;
  value: string;
};

export type OneMilEmailOptions = {
  preheader: string;
  eyebrow?: string;
  title: string;
  bodyHtml: string;
  codeBox?: OneMilEmailCodeBox;
  action?: OneMilEmailAction;
  footerNote?: string;
};

export function escapeEmailHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderOneMilDetailRows(
  rows: Array<{ label: string; value: string }>,
): string {
  return rows
    .map(
      ({ label, value }) => `
        <tr>
          <td class="detail-label" style="padding:10px 12px;color:${ONE_MIL_EMAIL_COLORS.muted};font-size:13px;line-height:1.45;border-bottom:1px solid ${ONE_MIL_EMAIL_COLORS.accentSoft};">${label}</td>
          <td style="padding:10px 12px;color:${ONE_MIL_EMAIL_COLORS.text};font-size:14px;line-height:1.45;font-weight:700;text-align:right;border-bottom:1px solid ${ONE_MIL_EMAIL_COLORS.accentSoft};">${value}</td>
        </tr>`,
    )
    .join("");
}

function renderCodeBox(box: OneMilEmailCodeBox): string {
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;">
        <tr>
          <td align="center" style="padding:16px 18px;background:${ONE_MIL_EMAIL_COLORS.panel};border:1.5px dashed ${ONE_MIL_EMAIL_COLORS.goldDeep};border-radius:12px;">
            <p style="margin:0 0 6px;color:${ONE_MIL_EMAIL_COLORS.accent};font-size:11px;line-height:1.3;font-weight:800;letter-spacing:.18em;text-transform:uppercase;">${box.label}</p>
            <p style="margin:0;color:${ONE_MIL_EMAIL_COLORS.text};font-size:24px;line-height:1.25;font-weight:800;letter-spacing:.06em;font-family:'Courier New',Courier,monospace;word-break:break-all;">${box.value}</p>
          </td>
        </tr>
      </table>`;
}

function renderHeaderRow(): string {
  return `<tr>
            <td class="email-header" align="center" style="padding:26px 32px 22px;background:${ONE_MIL_EMAIL_COLORS.header};">
              <img src="${ONE_MIL_EMAIL_LOGO_URL}" width="150" alt="OneMil" style="display:block;width:150px;max-width:54%;height:auto;border:0;">
            </td>
          </tr>
          <tr>
            <td height="4" style="height:4px;line-height:4px;font-size:0;background:${ONE_MIL_EMAIL_COLORS.gold};background-image:linear-gradient(90deg,${ONE_MIL_EMAIL_COLORS.crimson},${ONE_MIL_EMAIL_COLORS.gold} 45%,${ONE_MIL_EMAIL_COLORS.goldLight});">&nbsp;</td>
          </tr>`;
}

function renderFooterRow(footerNote = ""): string {
  return `<tr>
            <td style="padding:22px 40px 26px;background:${ONE_MIL_EMAIL_COLORS.panel};border-top:1px solid ${ONE_MIL_EMAIL_COLORS.accentSoft};">
              <p style="margin:0;color:${ONE_MIL_EMAIL_COLORS.text};font-size:13px;line-height:1.65;">
                <strong>OneMil</strong> · iCONIC POINT s.r.o.<br>
                <a href="https://onemil.cz" style="color:${ONE_MIL_EMAIL_COLORS.accent};text-decoration:underline;">onemil.cz</a>
                &nbsp;·&nbsp;
                <a href="mailto:podpora@onemil.cz" style="color:${ONE_MIL_EMAIL_COLORS.accent};text-decoration:underline;">podpora@onemil.cz</a>
              </p>
              ${footerNote}
            </td>
          </tr>`;
}

export function renderOneMilEmail(options: OneMilEmailOptions): string {
  const eyebrow = options.eyebrow
    ? `<p style="margin:0 0 10px;color:${ONE_MIL_EMAIL_COLORS.crimson};font-size:12px;line-height:1.4;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">${options.eyebrow}</p>`
    : "";
  const codeBox = options.codeBox ? renderCodeBox(options.codeBox) : "";
  const action = options.action
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 6px;">
        <tr>
          <td align="center" bgcolor="${ONE_MIL_EMAIL_COLORS.gold}" style="border-radius:12px;background:${ONE_MIL_EMAIL_COLORS.gold};background-image:linear-gradient(180deg,${ONE_MIL_EMAIL_COLORS.goldLight},${ONE_MIL_EMAIL_COLORS.gold} 55%,${ONE_MIL_EMAIL_COLORS.goldDeep});">
            <a href="${options.action.url}" style="display:inline-block;padding:15px 28px;color:${ONE_MIL_EMAIL_COLORS.buttonText};font-size:15px;line-height:1.2;font-weight:800;text-decoration:none;border-radius:12px;">${options.action.label}</a>
          </td>
        </tr>
      </table>`
    : "";
  const footerNote = options.footerNote
    ? `<p style="margin:8px 0 0;color:${ONE_MIL_EMAIL_COLORS.muted};font-size:12px;line-height:1.6;">${options.footerNote}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="cs" data-onemil-email="light-cream">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <title>${options.title}</title>
  <style>
    @media only screen and (max-width: 620px) {
      .email-shell { width: 100% !important; }
      .email-main { padding: 28px 20px !important; }
      .email-header { padding: 24px 20px 18px !important; }
      .detail-label { width: 42% !important; }
      h1 { font-size: 25px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${ONE_MIL_EMAIL_COLORS.page};font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:${ONE_MIL_EMAIL_COLORS.text};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${options.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:${ONE_MIL_EMAIL_COLORS.page};">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" class="email-shell" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${ONE_MIL_EMAIL_COLORS.card};border-radius:18px;overflow:hidden;box-shadow:0 12px 34px rgba(23,23,27,.12);">
          ${renderHeaderRow()}
          <tr>
            <td class="email-main" style="padding:36px 40px 34px;">
              ${eyebrow}
              <h1 style="margin:0 0 18px;color:${ONE_MIL_EMAIL_COLORS.text};font-size:29px;line-height:1.2;font-weight:800;letter-spacing:-.02em;">${options.title}</h1>
              <div style="color:${ONE_MIL_EMAIL_COLORS.text};font-size:15px;line-height:1.7;">
                ${options.bodyHtml}
              </div>
              ${codeBox}
              ${action}
            </td>
          </tr>
          ${renderFooterRow(footerNote)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Strukturovaný e-mail z fronty (`email_queue.body` = JSON se značkou `om_template`).
 * Databáze tak nemusí skládat HTML – vzhled má jediný zdroj v této šabloně.
 * Všechny texty se escapují; neplatný nebo cizí obsah vrací null (fronta pak pošle tělo beze změny).
 */
type StructuredEmail = {
  om_template: "v1";
  preheader?: string;
  eyebrow?: string;
  title?: string;
  greeting?: string;
  paragraphs?: string[];
  rows?: Array<{ label: string; value: string }>;
  code?: { label?: string; value?: string };
  action?: { label?: string; url?: string };
  footer_note?: string;
};

function safeUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  return /^https:\/\/(www\.)?onemil\.cz(\/[^\s"'<>]*)?$/.test(url) ? url : null;
}

export function renderOneMilStructuredEmail(body: string): string | null {
  const trimmed = body.trimStart();
  if (!trimmed.startsWith("{") || !trimmed.includes('"om_template"')) return null;
  let data: StructuredEmail;
  try {
    data = JSON.parse(trimmed) as StructuredEmail;
  } catch {
    return null;
  }
  if (!data || data.om_template !== "v1" || typeof data.title !== "string") return null;

  const esc = escapeEmailHtml;
  const parts: string[] = [];
  if (data.greeting) parts.push(`<p style="margin:0 0 12px;">${esc(data.greeting)}</p>`);
  for (const p of data.paragraphs ?? []) {
    if (typeof p === "string" && p.trim()) parts.push(`<p style="margin:0 0 12px;">${esc(p)}</p>`);
  }
  const rows = (data.rows ?? []).filter((r) => r && typeof r.label === "string" && typeof r.value === "string");
  if (rows.length) {
    parts.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;border-collapse:collapse;">${renderOneMilDetailRows(
        rows.map((r) => ({ label: esc(r.label), value: esc(r.value) })),
      )}</table>`,
    );
  }

  const actionUrl = safeUrl(data.action?.url);
  return renderOneMilEmail({
    preheader: esc(data.preheader ?? data.title),
    eyebrow: data.eyebrow ? esc(data.eyebrow) : undefined,
    title: esc(data.title),
    bodyHtml: parts.join("\n"),
    codeBox: data.code?.value ? { label: esc(data.code.label ?? "Kód"), value: esc(data.code.value) } : undefined,
    action: actionUrl && data.action?.label ? { label: esc(data.action.label), url: actionUrl } : undefined,
    footerNote: data.footer_note ? esc(data.footer_note) : undefined,
  });
}

/**
 * Rebrands the two legacy database-generated automatic templates (winner and
 * Shoptet reward) at delivery time without touching queue data or their
 * transactional/deduplication logic. Other HTML and plain-text mail is returned
 * byte-for-byte unchanged.
 */
export function applyOneMilBrandToLegacyAutomaticEmail(html: string): string {
  if (
    html.includes('data-onemil-email="light-cream"') ||
    !html.includes("background:#0A0B0F") ||
    !html.includes('One<span style="color:#FF8A00;">Mil')
  ) {
    return html;
  }

  const brandedHeader = renderHeaderRow().replace(/\n\s*/g, "");
  const brandedFooter = renderFooterRow().replace(/\n\s*/g, "");

  return html
    .replace("<html lang=\"cs\">", '<html lang="cs" data-onemil-email="light-cream">')
    .replace(
      /<tr><td style="background:#0A0B0F;[^"]*"><span[^>]*>One<span style="color:#FF8A00;">Mil<\/span><\/span><\/td><\/tr>/,
      brandedHeader,
    )
    .replace(
      /<tr><td style="background:#f4f5f7;[^"]*">[\s\S]*?<\/td><\/tr>(?=<\/table>)/,
      brandedFooter,
    )
    .replaceAll("#f4f5f7", ONE_MIL_EMAIL_COLORS.page)
    .replaceAll("#1d2128", ONE_MIL_EMAIL_COLORS.text)
    .replaceAll("#3a3f47", ONE_MIL_EMAIL_COLORS.text)
    .replaceAll("#8E98A6", ONE_MIL_EMAIL_COLORS.muted)
    .replaceAll("#FF8A00", ONE_MIL_EMAIL_COLORS.goldDeep)
    .replace(
      "max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;",
      `max-width:600px;background:${ONE_MIL_EMAIL_COLORS.card};border-radius:18px;overflow:hidden;box-shadow:0 12px 34px rgba(23,23,27,.12);`,
    );
}
