/**
 * Spec 122 — kontrakt bezpečného denního vstupu externího agenta (Magin)
 *
 * Statická kontrola zdrojů. Nepotřebuje databázi ani síť, nikdy neodesílá e-mail
 * a nikdy nevytváří dávku. Chování proti reálné databázi patří do samostatného
 * staging specu až po schválení nasazení.
 *
 * Konce řádků se normalizují — na Windows git checkoutuje CRLF.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

const MIGRATION = 'supabase/migrations/20260811090000_sales_lead_daily_batch_agent.sql';
const EDGE_FUNCTION = 'supabase/functions/sales-lead-daily-batch-agent/index.ts';
const CONFIG = 'supabase/config.toml';

test.describe('122 — denní dávkový agent: bezpečnostní kontrakt', () => {
  test('RPC je volatelné pouze service rolí a nikým jiným', () => {
    const migration = read(MIGRATION);

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.sales_lead_email_batch_agent_run(');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.sales_lead_email_batch_agent_run(date, integer) FROM PUBLIC, anon, authenticated;',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_agent_run(date, integer) TO service_role;',
    );
    // Authenticated ani anon nesmí dostat EXECUTE zpět.
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.sales_lead_email_batch_agent_run[^;]*TO[^;]*\b(anon|authenticated)\b/);
  });

  test('vlastník se vždy validuje, nikdy se nebere natvrdo', () => {
    const migration = read(MIGRATION);

    expect(migration).toContain('public.sales_lead_pick_discovery_owner()');
    expect(migration).toContain("'no_owner_available'");
    // Bez vlastníka se dávka vědomě nezaloží — nesmí existovat fallback na
    // libovolné UUID ani na created_by ze staré dávky.
    const ownerIndex = migration.indexOf('v_owner := public.sales_lead_pick_discovery_owner()');
    const prepareIndex = migration.indexOf('sales_lead_email_batch_prepare_paused(');
    expect(ownerIndex).toBeGreaterThan(-1);
    expect(prepareIndex).toBeGreaterThan(ownerIndex);
  });

  test('server rozhoduje o skupině, šabloně i způsobilosti; agent je neovlivní', () => {
    const migration = read(MIGRATION);

    expect(migration).toContain("l.lead_group = 'e-shopy'");
    expect(migration).toContain('public.sales_lead_email_batch_check_one(v_candidate.id, v_template_id)');
    expect(migration).toContain("'active_initial_template_not_unique'");
    expect(migration).toContain("template_type = 'initial'");

    // Jediné vstupy agenta jsou datum a počet.
    expect(migration).toContain('p_scheduled_date date,');
    expect(migration).toContain('p_requested_count integer');
    expect(migration).not.toMatch(/p_(lead_group|template_id|lead_ids|subject|body)\b/);
  });

  test('bariéry automatiky a denního limitu drží fail-closed', () => {
    const migration = read(MIGRATION);

    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain("'automation_disabled'");
    expect(migration).toContain("'requested_count_above_daily_limit'");
    expect(migration).toContain("'no_eligible_leads'");
  });

  test('idempotence na den: druhá dávka nikdy nevznikne', () => {
    const migration = read(MIGRATION);

    const existingIndex = migration.indexOf('FROM public.sales_lead_email_batches');
    const prepareIndex = migration.indexOf('sales_lead_email_batch_prepare_paused(');
    expect(existingIndex).toBeGreaterThan(-1);
    expect(existingIndex).toBeLessThan(prepareIndex);

    expect(migration).toContain("'already_exists'");
    expect(migration).toContain("'created_second_batch', false");
    expect(migration).toContain("v_idempotency_key := 'magin-daily-' || to_char(p_scheduled_date, 'YYYY-MM-DD')");
  });

  test('RPC nikdy neodesílá e-mail ani neobchází worker', () => {
    const migration = read(MIGRATION);

    expect(migration).not.toMatch(/resend|email_queue|net\.http_post|pg_net/i);
    expect(migration).not.toContain('sales_lead_email_batch_claim_next');
    expect(migration).not.toContain('sales_lead_initial_email_claim');
  });

  test('Edge Function autorizuje vlastním secretem, ne JWT ani service klíčem od agenta', () => {
    const edge = read(EDGE_FUNCTION);
    const config = read(CONFIG);

    expect(edge).toContain("Deno.env.get(\"SALES_LEAD_BATCH_AGENT_SECRET\")");
    expect(edge).toContain('difference |= a.charCodeAt(i) ^ b.charCodeAt(i);');
    expect(edge).toContain('{ error: "unauthorized" }, 401');
    expect(edge).toContain('MIN_SECRET_LENGTH = 32');

    expect(config).toContain('[functions.sales-lead-daily-batch-agent]');
    expect(config).toContain('verify_jwt = false');
  });

  test('Edge Function přijímá jen datum a počet a nic dalšího', () => {
    const edge = read(EDGE_FUNCTION);

    expect(edge).toContain('const allowedKeys = ["schema_version", "target_date", "requested_count"];');
    expect(edge).toContain('{ error: "unexpected_field" }, 400');
    expect(edge).toContain('{ error: "invalid_target_date" }, 400');
    expect(edge).toContain('{ error: "invalid_requested_count" }, 400');
    expect(edge).toContain('MAX_REQUESTED_COUNT = 90');
    expect(edge).toContain('{ error: "method_not_allowed" }, 405');
  });

  test('Edge Function neodesílá e-maily a nepouští secret do odpovědi ani logu', () => {
    const edge = read(EDGE_FUNCTION);

    // Kontroluje se skutečné použití, ne výskyt slova v komentáři.
    expect(edge).not.toMatch(/from ["']npm:resend|new Resend\(|resend\.emails|RESEND_API_KEY/);
    expect(edge).not.toMatch(/\.from\(["']email_queue["']\)/);
    expect(edge).not.toContain('sales_lead_initial_email');
    // Do logu smí jít jen kód chyby, nikdy message, payload ani hlavičky.
    expect(edge).toContain('console.error("sales_lead_email_batch_agent_run failed", { code: error.code });');
    expect(edge).not.toMatch(/console\.(log|error|warn)\([^)]*(authorization|secret|SERVICE_ROLE)/i);
  });

  test('volá se výhradně existující bezpečná cesta, nevzniká druhý e-mailový systém', () => {
    const edge = read(EDGE_FUNCTION);
    const migration = read(MIGRATION);

    expect(edge).toContain('client.rpc("sales_lead_email_batch_agent_run"');
    // Edge Function nesmí sahat na tabulky přímo.
    expect(edge).not.toMatch(/\.from\(["']sales_lead/);

    // RPC deleguje na existující admin cestu, nekopíruje ji.
    expect(migration).toContain('public.sales_lead_email_batch_prepare_paused(');
    expect(migration).toContain('public.sales_lead_email_batch_activate_admin(');
    expect(migration).not.toContain('INSERT INTO public.sales_lead_email_batches');
    expect(migration).not.toContain('INSERT INTO public.sales_lead_email_batch_items');
  });
});
