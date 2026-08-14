import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  applyOneMilBrandToLegacyAutomaticEmail,
  ONE_MIL_EMAIL_LOGO_URL,
  renderOneMilEmail,
} from "../../supabase/functions/_shared/oneMilEmailTemplate";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(path.join(root, relativePath), "utf8");
const forbiddenSlogan = "OneMil · jemně výjimečný svět odměn";

const automaticTemplateFiles = [
  "supabase/functions/send-marketing-consent-notification/index.ts",
  "supabase/functions/send-offer-reminders/index.ts",
  "supabase/functions/send-partner-invoice-email/index.ts",
  "supabase/functions/create-affiliate-company-lead/index.ts",
  "supabase/functions/approve-affiliate-company-lead/index.ts",
  "supabase/functions/invite-subadmin/index.ts",
  "supabase/functions/approve-shoptet-connection/index.ts",
  "supabase/functions/create-affiliate-payout-document/index.ts",
];

const previewFiles = () => {
  const previewDir = path.join(root, "docs/email-previews");
  return readdirSync(previewDir)
    .filter((name) => /^\d{2}-.*\.html$/.test(name))
    .sort();
};

test.describe("OneMil automatic email visual system", () => {
  test("shared layout uses the approved light cream style and neutral footer", () => {
    const html = renderOneMilEmail({
      preheader: "Náhled",
      eyebrow: "OneMil",
      title: "Ukázkový e-mail",
      bodyHtml: "<p>Obsah</p>",
      action: { label: "Pokračovat", url: "https://onemil.cz/account" },
      footerNote: "E-mail jste dostali kvůli změně ve svém účtu.",
    });

    expect(html).toContain('data-onemil-email="light-cream"');
    expect(html).toContain("#FBF7F0");
    expect(html).toContain("#FFFDF9");
    expect(html).toContain("#F7EBDD");
    expect(html).toContain("#F47A1F");
    expect(html).toContain("#2E2A27");
    expect(html).toContain("@media only screen and (max-width: 620px)");
    expect(html).toContain(`src="${ONE_MIL_EMAIL_LOGO_URL}"`);
    expect(html).toContain('href="https://onemil.cz"');
    expect(html).toContain('href="mailto:podpora@onemil.cz"');
    expect(html).toContain('href="https://onemil.cz/account"');
    expect(html).toContain("E-mail jste dostali kvůli změně ve svém účtu.");
    expect(html).not.toContain(forbiddenSlogan);
    expect(html).not.toMatch(/#0A0B0F|#1a1a2e|#2563eb|#6366f1/i);
  });

  test("public email logo is the exact existing project logo", () => {
    const source = readFileSync(path.join(root, "src/assets/logo-onemil.png"));
    const emailAsset = readFileSync(path.join(root, "public/onemil-logo.png"));
    const digest = (value: Buffer) =>
      createHash("sha256").update(value).digest("hex");

    expect(digest(emailAsset)).toBe(digest(source));
    expect(ONE_MIL_EMAIL_LOGO_URL).toBe("https://onemil.cz/onemil-logo.png");
  });

  test("legacy DB templates get only the shared branding and neutral footer", () => {
    const legacy = `<html lang="cs"><body style="background:#f4f5f7"><table style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;"><tr><td style="background:#0A0B0F;padding:24px 32px;"><span style="font-size:22px;font-weight:700;color:#ffffff;">One<span style="color:#FF8A00;">Mil</span></span></td></tr><tr><td style="color:#1d2128"><a href="https://onemil.cz/wins">Výhra</a></td></tr><tr><td style="background:#f4f5f7;padding:20px 32px;text-align:center;"><p>Starý marketingový text</p></td></tr></table></body></html>`;
    const branded = applyOneMilBrandToLegacyAutomaticEmail(legacy);

    expect(branded).toContain('data-onemil-email="light-cream"');
    expect(branded).toContain(ONE_MIL_EMAIL_LOGO_URL);
    expect(branded).toContain("#FBF7F0");
    expect(branded).toContain('href="https://onemil.cz/wins"');
    expect(branded).toContain('href="https://onemil.cz"');
    expect(branded).toContain('href="mailto:podpora@onemil.cz"');
    expect(branded).not.toContain("background:#0A0B0F");
    expect(branded).not.toContain("Starý marketingový text");
    expect(branded).not.toContain(forbiddenSlogan);

    const unrelated = "<p>Ručně napsaný obchodní e-mail</p>";
    expect(applyOneMilBrandToLegacyAutomaticEmail(unrelated)).toBe(unrelated);
  });

  test("date-of-birth reminder has no sending path or automatic template", () => {
    const removedReminderFiles = [
      "supabase/functions/send-onboarding-reminder/index.ts",
      "supabase/functions/daily-onboarding-reminder/index.ts",
      "scripts/generate-email-previews.ts",
    ];

    for (const file of removedReminderFiles) {
      const source = read(file);
      expect(source, file).not.toMatch(
        /Ještě jeden malý krok|datum narození|date-of-birth|ONESIGNAL_REST_API_KEY|include_email_tokens/i,
      );
    }

    for (const file of removedReminderFiles.slice(0, 2)) {
      const source = read(file);
      expect(source, file).not.toMatch(/renderOneMilEmail|createClient|fetch\(/);
    }

    const adminPage = read("src/pages/AdminOnboardingIncomplete.tsx");
    expect(adminPage).not.toContain(
      "supabase.functions.invoke('send-onboarding-reminder')",
    );
    expect(adminPage).not.toContain("Odeslat hromadný e-mail");

    for (const preview of previewFiles()) {
      const html = read(`docs/email-previews/${preview}`);
      expect(html, preview).not.toMatch(
        /Ještě jeden malý krok|doplnit datum narození|\/onboarding\/date-of-birth/i,
      );
    }
  });

  test("remaining automatic Edge templates still use the shared renderer", () => {
    for (const file of automaticTemplateFiles) {
      const source = read(file);
      expect(source, file).toContain("renderOneMilEmail");
      expect(source, file).not.toContain(forbiddenSlogan);
      expect(source, file).not.toMatch(
        /Ještě jeden malý krok|doplnit datum narození|\/onboarding\/date-of-birth/i,
      );
    }

    const queueWorker = read("supabase/functions/process-email-queue/index.ts");
    expect(queueWorker).toContain(
      "applyOneMilBrandToLegacyAutomaticEmail(emailRecord.body)",
    );
    expect(queueWorker).toContain("emailOptions.attachments = [{");
    expect(queueWorker).toContain(
      "const emailResponse = await getResendClient().emails.send(emailOptions)",
    );

    const invoice = read(
      "supabase/functions/send-partner-invoice-email/index.ts",
    );
    expect(invoice).toContain("attachments: [attachment]");
    expect(invoice).toContain('url: "https://onemil.cz/partner/dashboard"');

    const payout = read(
      "supabase/functions/create-affiliate-payout-document/index.ts",
    );
    expect(payout).toContain('url: "https://onemil.cz/affiliate/dashboard"');
  });

  test("the other 12 previews keep their style, logo and CTA destinations", () => {
    const previews = previewFiles();
    expect(previews).toHaveLength(12);

    const expectedCtas: Record<string, string | null> = {
      "02-marketing-consent.html": "https://onemil.cz/profile",
      "03-offer-reminder.html": "https://onemil.cz/profile?tab=offers",
      "04-company-registration-confirmation.html":
        "https://onemil.cz/partner/invite?token=preview&action=confirm",
      "05-company-account-approved.html":
        "https://onemil.cz/partner/set-password",
      "06-subadmin-invite.html": "https://onemil.cz/reset-password",
      "07-shoptet-approved.html": "https://onemil.cz/partner/dashboard",
      "08-shoptet-rejected.html": "https://onemil.cz/partner/dashboard",
      "09-partner-invoice.html": "https://onemil.cz/partner/dashboard",
      "10-affiliate-payout.html": "https://onemil.cz/affiliate/dashboard",
      "11-affiliate-payout-accounting.html": null,
      "12-winner.html": "https://onemil.cz/wins",
      "13-shoptet-reward-code.html":
        "https://onemil.cz/profile?miocoin_code=MIO-PREVIEW-2026",
    };

    for (const preview of previews) {
      const html = read(`docs/email-previews/${preview}`);
      expect(html, preview).toContain('data-onemil-email="light-cream"');
      expect(html, preview).toContain("../../public/onemil-logo.png");
      expect(html, preview).toContain('href="https://onemil.cz"');
      expect(html, preview).toContain('href="mailto:podpora@onemil.cz"');
      expect(html, preview).not.toContain(forbiddenSlogan);
      expect(html, preview).not.toMatch(
        /background:#0A0B0F|#1a1a2e|#2563eb|#6366f1/i,
      );

      const expectedCta = expectedCtas[preview];
      if (expectedCta) {
        expect(html, preview).toContain(`href="${expectedCta}"`);
      }
    }
  });
});
