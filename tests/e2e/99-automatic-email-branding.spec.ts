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

test.describe("OneMil automatic email visual system", () => {
  test("shared layout uses the approved light cream and orange palette", () => {
    const html = renderOneMilEmail({
      preheader: "Náhled",
      eyebrow: "OneMil",
      title: "Ukázkový e-mail",
      bodyHtml: "<p>Obsah</p>",
      action: { label: "Pokračovat", url: "https://onemil.cz" },
    });

    expect(html).toContain('data-onemil-email="light-cream"');
    expect(html).toContain("#FBF7F0");
    expect(html).toContain("#FFFDF9");
    expect(html).toContain("#F7EBDD");
    expect(html).toContain("#F47A1F");
    expect(html).toContain("#2E2A27");
    expect(html).toContain("@media only screen and (max-width: 620px)");
    expect(html).toContain(`src="${ONE_MIL_EMAIL_LOGO_URL}"`);
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

  test("legacy DB templates are rebranded narrowly and unrelated mail is unchanged", () => {
    const legacy = `<html lang="cs"><body style="background:#f4f5f7"><table style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;"><tr><td style="background:#0A0B0F;padding:24px 32px;"><span style="font-size:22px;font-weight:700;color:#ffffff;">One<span style="color:#FF8A00;">Mil</span></span></td></tr><tr><td style="color:#1d2128">Výhra</td></tr></table></body></html>`;
    const branded = applyOneMilBrandToLegacyAutomaticEmail(legacy);

    expect(branded).toContain('data-onemil-email="light-cream"');
    expect(branded).toContain(ONE_MIL_EMAIL_LOGO_URL);
    expect(branded).toContain("#FBF7F0");
    expect(branded).not.toContain("background:#0A0B0F");

    const unrelated = "<p>Ručně napsaný obchodní e-mail</p>";
    expect(applyOneMilBrandToLegacyAutomaticEmail(unrelated)).toBe(unrelated);
  });

  test("all automatic Edge templates use the shared renderer", () => {
    const functionFiles = [
      "supabase/functions/send-onboarding-reminder/index.ts",
      "supabase/functions/send-marketing-consent-notification/index.ts",
      "supabase/functions/send-offer-reminders/index.ts",
      "supabase/functions/send-partner-invoice-email/index.ts",
      "supabase/functions/create-affiliate-company-lead/index.ts",
      "supabase/functions/approve-affiliate-company-lead/index.ts",
      "supabase/functions/invite-subadmin/index.ts",
      "supabase/functions/approve-shoptet-connection/index.ts",
      "supabase/functions/create-affiliate-payout-document/index.ts",
    ];

    for (const file of functionFiles) {
      expect(read(file), file).toContain("renderOneMilEmail");
    }

    const queueWorker = read("supabase/functions/process-email-queue/index.ts");
    expect(queueWorker).toContain("applyOneMilBrandToLegacyAutomaticEmail(emailRecord.body)");
  });

  test("every generated preview uses the approved palette and original logo", () => {
    const previewDir = path.join(root, "docs/email-previews");
    const previews = readdirSync(previewDir)
      .filter((name) => /^\d{2}-.*\.html$/.test(name))
      .sort();

    expect(previews).toHaveLength(13);
    for (const preview of previews) {
      const html = readFileSync(path.join(previewDir, preview), "utf8");
      expect(html, preview).toContain('data-onemil-email="light-cream"');
      expect(html, preview).toContain("../../public/onemil-logo.png");
      expect(html, preview).not.toMatch(/background:#0A0B0F|#1a1a2e|#2563eb|#6366f1/i);
    }
  });
});
