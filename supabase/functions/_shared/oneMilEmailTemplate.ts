export const ONE_MIL_EMAIL_LOGO_URL = "https://onemil.cz/onemil-logo.png";

export const ONE_MIL_EMAIL_COLORS = {
  page: "#FBF7F0",
  card: "#FFFDF9",
  panel: "#F7EBDD",
  accent: "#F47A1F",
  accentSoft: "#FCE4D2",
  line: "#F2A16B",
  text: "#2E2A27",
  muted: "#6F655D",
  white: "#FFFFFF",
} as const;

export type OneMilEmailAction = {
  label: string;
  url: string;
};

export type OneMilEmailOptions = {
  preheader: string;
  eyebrow?: string;
  title: string;
  bodyHtml: string;
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

export function renderOneMilEmail(options: OneMilEmailOptions): string {
  const eyebrow = options.eyebrow
    ? `<p style="margin:0 0 10px;color:${ONE_MIL_EMAIL_COLORS.accent};font-size:12px;line-height:1.4;font-weight:800;letter-spacing:.11em;text-transform:uppercase;">${options.eyebrow}</p>`
    : "";
  const action = options.action
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 6px;">
        <tr>
          <td align="center" bgcolor="${ONE_MIL_EMAIL_COLORS.accent}" style="border-radius:9px;">
            <a href="${options.action.url}" style="display:inline-block;padding:14px 26px;color:${ONE_MIL_EMAIL_COLORS.white};font-size:15px;line-height:1.2;font-weight:800;text-decoration:none;border-radius:9px;">${options.action.label}</a>
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
        <table role="presentation" class="email-shell" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${ONE_MIL_EMAIL_COLORS.card};border:1px solid ${ONE_MIL_EMAIL_COLORS.line};border-radius:18px;overflow:hidden;box-shadow:0 12px 34px rgba(79,55,35,.08);">
          <tr>
            <td class="email-header" align="center" style="padding:28px 32px 20px;background:${ONE_MIL_EMAIL_COLORS.card};border-bottom:1px solid ${ONE_MIL_EMAIL_COLORS.accentSoft};">
              <img src="${ONE_MIL_EMAIL_LOGO_URL}" width="104" alt="OneMil" style="display:block;width:104px;max-width:42%;height:auto;border:0;">
            </td>
          </tr>
          <tr>
            <td class="email-main" style="padding:38px 40px 34px;">
              ${eyebrow}
              <h1 style="margin:0 0 18px;color:${ONE_MIL_EMAIL_COLORS.text};font-size:29px;line-height:1.2;font-weight:800;letter-spacing:-.02em;">${options.title}</h1>
              <div style="color:${ONE_MIL_EMAIL_COLORS.text};font-size:15px;line-height:1.7;">
                ${options.bodyHtml}
              </div>
              ${action}
            </td>
          </tr>
          <tr>
            <td style="padding:22px 40px 26px;background:${ONE_MIL_EMAIL_COLORS.panel};border-top:1px solid ${ONE_MIL_EMAIL_COLORS.line};">
              <p style="margin:0;color:${ONE_MIL_EMAIL_COLORS.text};font-size:13px;line-height:1.65;">
                <strong>OneMil</strong><br>
                <a href="https://onemil.cz" style="color:${ONE_MIL_EMAIL_COLORS.accent};text-decoration:underline;">onemil.cz</a>
                &nbsp;·&nbsp;
                <a href="mailto:podpora@onemil.cz" style="color:${ONE_MIL_EMAIL_COLORS.accent};text-decoration:underline;">podpora@onemil.cz</a>
              </p>
              ${footerNote}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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

  const brandedHeader = `<tr><td align="center" style="background:${ONE_MIL_EMAIL_COLORS.card};padding:26px 32px 20px;border-bottom:1px solid ${ONE_MIL_EMAIL_COLORS.accentSoft};"><img src="${ONE_MIL_EMAIL_LOGO_URL}" width="104" alt="OneMil" style="display:block;width:104px;max-width:42%;height:auto;border:0;"></td></tr>`;
  const brandedFooter = `<tr><td style="background:${ONE_MIL_EMAIL_COLORS.panel};padding:20px 32px;text-align:center;border-top:1px solid ${ONE_MIL_EMAIL_COLORS.line};"><p style="margin:0;color:${ONE_MIL_EMAIL_COLORS.text};font-size:13px;line-height:1.65;"><strong>OneMil</strong><br><a href="https://onemil.cz" style="color:${ONE_MIL_EMAIL_COLORS.accent};text-decoration:underline;">onemil.cz</a>&nbsp;·&nbsp;<a href="mailto:podpora@onemil.cz" style="color:${ONE_MIL_EMAIL_COLORS.accent};text-decoration:underline;">podpora@onemil.cz</a></p></td></tr>`;

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
    .replaceAll("#FF8A00", ONE_MIL_EMAIL_COLORS.accent)
    .replace(
      "max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;",
      `max-width:600px;background:${ONE_MIL_EMAIL_COLORS.card};border:1px solid ${ONE_MIL_EMAIL_COLORS.line};border-radius:18px;overflow:hidden;box-shadow:0 12px 34px rgba(79,55,35,.08);`,
    );
}
