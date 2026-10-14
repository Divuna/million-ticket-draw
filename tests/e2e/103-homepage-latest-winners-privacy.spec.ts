import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test.describe("103 — Homepage latest winners privacy", () => {
  test("Homepage contract does not request or render ticket numbers", () => {
    const homepage = read("src/pages/Homepage.tsx");
    const hook = read("src/hooks/useHomepageLatestWinners.ts");
    const migration = read(
      "supabase/migrations/20260729090000_homepage_winners_without_ticket_number.sql",
    );

    expect(homepage).toContain("useHomepageLatestWinners");
    expect(homepage).not.toMatch(/ticketNumber=\{winner\.ticket_number\}/);
    expect(hook).toContain('"get_latest_winners_homepage_public"');
    expect(hook).not.toContain("ticket_number");

    const returnContract = migration.match(/RETURNS TABLE\(([\s\S]*?)\)\s*LANGUAGE/i)?.[1] ?? "";
    expect(returnContract).not.toContain("ticket_number");
    expect(migration).not.toMatch(/JOIN\s+public\.tickets/i);
  });

  test("Poslední výherci do not show a hash ticket number", async ({ page }) => {
    await page.route("**/rest/v1/rpc/get_latest_winners_homepage_public", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            public_id: "homepage-winner",
            type: "bonus",
            created_at: new Date().toISOString(),
            user_name: "Jan N.",
            user_nickname: "Honza",
            prize_name: "Sluchátka",
            prize_image_url: null,
            contest_title: "Letní soutěž",
            user_avatar_url: null,
            ticket_number: 36,
          },
        ]),
      });
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    const panel = page.locator(".homepage-latest-winners-panel");
    await expect(panel.getByText("Poslední výherci")).toBeVisible();
    await expect(panel.getByText("Sluchátka")).toBeVisible();
    await expect(panel).not.toContainText(/#\s*36\b/);
  });
});
