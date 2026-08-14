import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  deterministicEshopEvidence,
  isPublicNetworkAddress,
  sameCompanyDomain,
  verifyWorkIntakeCandidate,
} from "../../supabase/functions/_shared/salesLeadWorkIntakeVerifier.ts";

const root = process.cwd();
const migration = [
  "20260809153000_sales_lead_work_intake.sql",
  "20260809203719_sales_lead_work_intake_review_fixes.sql",
].map((file) => readFileSync(join(root, "supabase/migrations", file), "utf8")).join("\n");
const edge = readFileSync(join(root, "supabase/functions/sales-lead-work-intake/index.ts"), "utf8");
const verifier = readFileSync(join(root, "supabase/functions/_shared/salesLeadWorkIntakeVerifier.ts"), "utf8");

function fetchFixture(pages: Record<string, string>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const html = pages[url];
    return html === undefined
      ? new Response("not found", { status: 404, headers: { "content-type": "text/html" } })
      : new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  }) as typeof fetch;
}

test("deterministic verifier accepts an e-shop and exact public email on its official source", async () => {
  const result = await verifyWorkIntakeCandidate({
    website: "https://shop.example.cz/",
    public_email: "INFO@SHOP.EXAMPLE.CZ",
    email_source_url: "https://shop.example.cz/kontakt",
  }, fetchFixture({
    "https://shop.example.cz/": '<html><body><a href="/kosik">Košík</a><div>Výrobek 499 Kč</div><a>Obchodní podmínky</a></body></html>',
    "https://shop.example.cz/kontakt": '<main>Kontakt: <a href="mailto:info@shop.example.cz">info@shop.example.cz</a></main>',
  }));
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.domain).toBe("shop.example.cz");
    expect(result.email).toBe("info@shop.example.cz");
  }
});

test("verifier rejects foreign email evidence and a non-shop without AI", async () => {
  expect(sameCompanyDomain("https://www.shop.cz", "https://kontakt.shop.cz/page")).toBe(true);
  const foreign = await verifyWorkIntakeCandidate({
    website: "https://shop.example.cz", public_email: "info@shop.example.cz",
    email_source_url: "https://catalog.example.com/profile",
  }, fetchFixture({}));
  expect(foreign).toMatchObject({ ok: false, reason: "email_source_domain_mismatch" });

  const plain = await verifyWorkIntakeCandidate({
    website: "https://plain.example.cz", public_email: "info@plain.example.cz",
    email_source_url: "https://plain.example.cz/kontakt",
  }, fetchFixture({ "https://plain.example.cz": "<html><body>Poradenství a kontakt pro zákazníky.</body></html>" }));
  expect(plain).toMatchObject({ ok: false, reason: "not_eshop" });
});

test("verifier rejects catalog URLs and an email absent from its evidence page", async () => {
  const catalog = await verifyWorkIntakeCandidate({
    website: "https://firmy.cz/detail/shop", public_email: "info@shop.cz",
    email_source_url: "https://firmy.cz/detail/shop",
  }, fetchFixture({}));
  expect(catalog).toMatchObject({ ok: false, reason: "catalog_or_marketplace" });

  const missing = await verifyWorkIntakeCandidate({
    website: "https://store.example.cz", public_email: "info@store.example.cz",
    email_source_url: "https://store.example.cz/kontakt",
  }, fetchFixture({
    "https://store.example.cz": "<html>WooCommerce <a>Košík</a> 299 Kč</html>",
    "https://store.example.cz/kontakt": "<html>Kontaktujte nás formulářem.</html>",
  }));
  expect(missing).toMatchObject({ ok: false, reason: "email_not_found_on_source" });
});

test("e-shop evidence requires a transactional signal, not a category guess", () => {
  expect(deterministicEshopEvidence("Cena 100 Kč. Obchodní podmínky.").accepted).toBe(false);
  expect(deterministicEshopEvidence("WooCommerce košík 100 Kč")).toMatchObject({ accepted: true });
});

test("network guard rejects private, link-local, carrier and mapped addresses", () => {
  for (const address of [
    "127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "198.18.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1",
  ]) expect(isPublicNetworkAddress(address), address).toBe(false);
  expect(isPublicNetworkAddress("93.184.216.34")).toBe(true);
  expect(isPublicNetworkAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(true);
});

test("intake is private, asynchronous, bounded and idempotent", () => {
  expect(edge).toContain('Deno.env.get("SALES_LEAD_WORK_INTAKE_SECRET")');
  expect(edge).toContain("EdgeRuntime.waitUntil(processing)");
  expect(edge).toContain("const MAX_ITEMS = 150");
  expect(edge).toContain('input.schema_version !== 1');
  expect(edge).toContain('typeof input.external_batch_id !== "string"');
  expect(migration).toContain("external_batch_id text NOT NULL UNIQUE");
  expect(migration).toContain("idempotency_conflict");
  expect(migration).toContain("FOR UPDATE SKIP LOCKED");
  expect(migration).toContain("claimed_at < clock_timestamp() - interval '2 minutes'");
  expect(migration).toContain("pg_advisory_xact_lock");
  expect(migration).toContain("REVOKE ALL ON public.sales_lead_work_intake_runs FROM PUBLIC, anon, authenticated");
});

test("atomic commit retains all mandatory CRM and outreach guards", () => {
  for (const marker of [
    "sales_lead_partner_match_reason", "duplicate_domain", "duplicate_email",
    "do_not_contact", "sales_lead_email_suppression", "previous_or_active_batch",
    "previous_outreach", "sales_lead_duplicate_matches", "duplicate_email_domain",
    "'novy','work_intake'", "'e-shopy'", "'chatgpt_work_intake'",
    "backend_verified_official_website", "exact_http_source_match",
  ]) expect(migration).toContain(marker);
  expect(migration).toContain("FROM public.sales_leads l WHERE l.website_domain=v_domain");
  expect(migration).not.toContain("status <> 'archivovan'");
});

test("new intake path contains no OpenAI or ARES dependency and creates no email batch", () => {
  const implementation = `${edge}\n${verifier}`.toLowerCase();
  expect(implementation).not.toContain("openai");
  expect(implementation).not.toContain("chat.completions");
  expect(implementation).not.toContain("responses");
  expect(implementation).not.toContain("ares.gov");
  expect(edge).not.toContain("sales_lead_email_batch_create");
  expect(edge).not.toContain("resend");
  expect(migration).not.toContain("pg_cron");
});
