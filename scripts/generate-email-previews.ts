import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  applyOneMilBrandToLegacyAutomaticEmail,
  escapeEmailHtml,
  renderOneMilDetailRows,
  renderOneMilEmail,
} from "../supabase/functions/_shared/oneMilEmailTemplate.ts";

const outputDir = join(process.cwd(), "docs", "email-previews");
await mkdir(outputDir, { recursive: true });
for (const name of await readdir(outputDir)) {
  if (/^\d{2}-.*\.html$/.test(name)) {
    await unlink(join(outputDir, name));
  }
}

const panel = (rows: Array<{ label: string; value: string }>) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7EBDD;border:1px solid #F2A16B;border-radius:12px;border-collapse:separate;overflow:hidden;">${renderOneMilDetailRows(rows)}</table>`;

const previews: Record<string, string> = {
  "02-marketing-consent.html": renderOneMilEmail({
    preheader: "Potvrzení změny nastavení marketingových sdělení.",
    eyebrow: "Nastavení účtu",
    title: "Změna marketingových sdělení",
    bodyHtml: `<p style="margin:0 0 18px;">Došlo ke změně nastavení marketingových sdělení ve vašem účtu OneMil.</p>${panel([
      { label: "Změna", value: "přihlášení" },
      { label: "Datum a čas", value: "23. 07. 2026 21:45" },
    ])}`,
    action: { label: "Zkontrolovat nastavení", url: "https://onemil.cz/profile" },
    footerNote: "Pokud jste změnu neprovedli vy, kontaktujte podporu OneMil.",
  }),
  "03-offer-reminder.html": renderOneMilEmail({
    preheader: "Vaše nevyužité nabídky partnerů čekají v OneMil.",
    eyebrow: "Připomenutí nabídek",
    title: "Vaše nabídky stále čekají",
    bodyHtml: `<p style="margin:0 0 22px;">Připomínáme vám 2 nabídky, které čekají na vaše otevření v aplikaci OneMil.</p>
      <div style="margin:0 0 12px;padding:18px;background:#F7EBDD;border:1px solid #F2A16B;border-radius:12px;"><span style="font-size:11px;color:#F47A1F;text-transform:uppercase;letter-spacing:.08em;font-weight:800;">Ukázkový partner</span><br><strong style="display:inline-block;margin-top:5px;font-size:16px;color:#2E2A27;">Prémiová partnerská nabídka</strong><br><span style="font-size:13px;color:#6F655D;">Jemná ukázka textu nabídky.</span></div>`,
    action: { label: "Zobrazit nabídky", url: "https://onemil.cz/profile?tab=offers" },
    footerNote: "Nabídku můžete skrýt přímo v aplikaci.",
  }),
  "04-company-registration-confirmation.html": renderOneMilEmail({
    preheader: "Potvrďte žádost o registraci firmy do OneMil.",
    eyebrow: "Partnerská registrace",
    title: "Potvrďte žádost o registraci",
    bodyHtml: `<p style="margin:0 0 16px;">Dobrý den,</p><p style="margin:0;">Agentura OneMil odeslala žádost o registraci firmy <strong>Ukázková firma s.r.o.</strong>.</p>`,
    action: { label: "Potvrdit žádost", url: "https://onemil.cz/partner/invite?token=preview&action=confirm" },
    footerNote: "Pokud jste žádost nečekali, e-mail ignorujte.",
  }),
  "05-company-account-approved.html": renderOneMilEmail({
    preheader: "Partnerský účet byl schválen.",
    eyebrow: "Partnerský účet",
    title: "Váš účet byl schválen",
    bodyHtml: `<p style="margin:0 0 16px;">Dobrý den,</p><p style="margin:0;">Firma <strong>Ukázková firma s.r.o.</strong> byla schválena. Účet aktivujete bezpečným nastavením hesla.</p>`,
    action: { label: "Nastavit heslo a aktivovat účet", url: "https://onemil.cz/partner/set-password" },
    footerNote: "Heslo nikdy neposíláme e-mailem. Aktivační odkaz je jednorázový.",
  }),
  "06-subadmin-invite.html": renderOneMilEmail({
    preheader: "Pozvánka do administrace OneMil.",
    eyebrow: "Administrace OneMil",
    title: "Přijměte pozvánku do týmu",
    bodyHtml: `<p style="margin:0 0 16px;">Dobrý den,</p><p style="margin:0;">Byli jste pozváni jako administrátor do systému OneMil.</p>`,
    action: { label: "Nastavit heslo a aktivovat účet", url: "https://onemil.cz/reset-password" },
    footerNote: "Pokud jste pozvánku nečekali, e-mail ignorujte.",
  }),
  "07-shoptet-approved.html": renderOneMilEmail({
    preheader: "Váš Shoptet e-shop je propojený s OneMil.",
    eyebrow: "Shoptet propojení",
    title: "E-shop je připravený",
    bodyHtml: `<p style="margin:0 0 16px;">Dobrý den, <strong>Ukázkový partner</strong>,</p><p style="margin:0;">Váš e-shop byl aktivován pro automatické vydávání MioCoin kódů.</p>`,
    action: { label: "Otevřít partnerský portál", url: "https://onemil.cz/partner/dashboard" },
  }),
  "08-shoptet-rejected.html": renderOneMilEmail({
    preheader: "Informace k požadavku na propojení Shoptet e-shopu.",
    eyebrow: "Shoptet propojení",
    title: "Požadavek potřebuje úpravu",
    bodyHtml: `<p style="margin:0 0 16px;">Dobrý den,</p><p style="margin:0;">Požadavek nyní nemohl být schválen.</p><div style="margin-top:20px;padding:16px;background:#F7EBDD;border:1px solid #F2A16B;border-radius:12px;"><strong>Důvod:</strong><br>Doplňte prosím správnou exportní URL.</div>`,
    action: { label: "Otevřít partnerský portál", url: "https://onemil.cz/partner/dashboard" },
  }),
  "09-partner-invoice.html": renderOneMilEmail({
    preheader: "Faktura OneMil za červenec 2026.",
    eyebrow: "Partnerská fakturace",
    title: "Vaše faktura OneMil",
    bodyHtml: `<p style="margin:0 0 22px;">PDF dokument najdete v příloze tohoto e-mailu.</p>${panel([
      { label: "Období", value: "01. 07. 2026 – 31. 07. 2026" },
      { label: "Celková částka", value: "12 450,00 Kč" },
    ])}`,
    action: { label: "Otevřít partnerský portál", url: "https://onemil.cz/partner/dashboard" },
  }),
  "10-affiliate-payout.html": renderOneMilEmail({
    preheader: "Doklad k výplatě provize OneMil.",
    eyebrow: "Affiliate provize",
    title: "Doklad k vaší výplatě",
    bodyHtml: `<p style="margin:0 0 22px;">V příloze posíláme doklad k výplatě provize.</p>${panel([
      { label: "Příjemce", value: "Ukázkový affiliate" },
      { label: "Doklad", value: "AFF-2026-0042" },
      { label: "Částka", value: "8 900,00 Kč" },
    ])}`,
    action: { label: "Otevřít affiliate přehled", url: "https://onemil.cz/affiliate/dashboard" },
  }),
  "11-affiliate-payout-accounting.html": renderOneMilEmail({
    preheader: "Účetní kopie payout dokladu.",
    eyebrow: "Účetní kopie",
    title: "Payout doklad OneMil",
    bodyHtml: `<p style="margin:0 0 22px;">V příloze je účetní kopie payout dokladu.</p>${panel([
      { label: "Příjemce", value: "Ukázkový affiliate" },
      { label: "Doklad", value: "AFF-2026-0042" },
      { label: "Částka", value: "8 900,00 Kč" },
    ])}`,
  }),
};

const legacyWinner = `<!DOCTYPE html><html lang="cs"><body style="margin:0;padding:0;background:#f4f5f7;color:#1d2128;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;"><tr><td style="background:#0A0B0F;padding:24px 32px;"><span style="font-size:22px;font-weight:700;color:#ffffff;">One<span style="color:#FF8A00;">Mil</span></span></td></tr><tr><td style="padding:32px;"><h1 style="color:#1d2128;">Gratulujeme k výhře!</h1><p style="color:#3a3f47;">V soutěži <strong>Letní OneMil</strong> jste získal(a):</p><div style="padding:16px;background:#fff7ed;border:1px solid #FF8A00;border-radius:10px;">1 000 MioCoinů</div><p><a href="https://onemil.cz/wins" style="display:inline-block;background:#FF8A00;color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:8px;">Zobrazit moje výhry</a></p></td></tr><tr><td style="background:#f4f5f7;padding:20px 32px;text-align:center;"><p style="margin:0;font-size:12px;color:#8E98A6;">Tým OneMil</p></td></tr></table></td></tr></table></body></html>`;
previews["12-winner.html"] = applyOneMilBrandToLegacyAutomaticEmail(legacyWinner);

const legacyReward = legacyWinner
  .replace("Gratulujeme k výhře!", "Máte připravené MioCoiny")
  .replace("V soutěži <strong>Letní OneMil</strong> jste získal(a):", "Děkujeme za nákup. Váš MioCoin kód je připravený.")
  .replace("1 000 MioCoinů", "MIO-PREVIEW-2026")
  .replace("https://onemil.cz/wins", "https://onemil.cz/profile?miocoin_code=MIO-PREVIEW-2026")
  .replace("Zobrazit moje výhry", "Uplatnit MioCoiny");
previews["13-shoptet-reward-code.html"] = applyOneMilBrandToLegacyAutomaticEmail(legacyReward);

for (const [name, html] of Object.entries(previews)) {
  const localPreviewHtml = html
    .replaceAll(
      "https://onemil.cz/onemil-logo.png",
      "../../public/onemil-logo.png",
    )
    .replace(/[ \t]+$/gm, "");
  await writeFile(join(outputDir, name), localPreviewHtml, "utf8");
}

const links = Object.keys(previews)
  .sort()
  .map((name) => `<li><a href="./${escapeEmailHtml(name)}">${escapeEmailHtml(name)}</a></li>`)
  .join("");
await writeFile(
  join(outputDir, "index.html"),
  `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>OneMil e-mailové náhledy</title></head><body style="font-family:Arial,sans-serif;background:#FBF7F0;color:#2E2A27;padding:32px;"><h1>OneMil e-mailové náhledy</h1><p>Statické náhledy; nic se neodesílá.</p><ol>${links}</ol></body></html>`,
  "utf8",
);

console.log(`Generated ${Object.keys(previews).length} previews in ${outputDir}`);
