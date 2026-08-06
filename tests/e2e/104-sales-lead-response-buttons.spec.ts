import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const initialMigration = read('supabase/migrations/20260806100000_sales_lead_email_response_links.sql');
const snapshotFixMigration = read('supabase/migrations/20260806104000_fix_sales_lead_response_snapshot_trigger.sql');
const publicPageMigration = read('supabase/migrations/20260806113000_sales_lead_response_public_page.sql');
const responseMigrations = `${initialMigration}\n${snapshotFixMigration}\n${publicPageMigration}`;
const responseFunction = read('supabase/functions/sales-lead-response/index.ts');
const publicPage = read('public/partner-response.html');
const config = read('supabase/config.toml');

const getBranch = responseFunction.slice(
  responseFunction.indexOf('if (req.method === "GET")'),
  responseFunction.indexOf('const body = await readBody(req)'),
);

test.describe('104 — sales-lead e-mail response buttons', () => {
  test('response tokens are hashed, private, expiring, and bound to one batch item', () => {
    expect(initialMigration).toContain('CREATE TABLE IF NOT EXISTS public.sales_lead_email_response_tokens');
    expect(initialMigration).toContain('token_hash text NOT NULL UNIQUE');
    expect(initialMigration).toContain('batch_item_id uuid NOT NULL UNIQUE');
    expect(responseMigrations).toContain("now() + interval '90 days'");
    expect(responseMigrations).toContain("extensions.digest(v_token, 'sha256')");
    expect(responseMigrations).not.toMatch(/\btoken\s+text\b/);
    expect(initialMigration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(initialMigration).toContain('REVOKE ALL ON TABLE public.sales_lead_email_response_tokens FROM PUBLIC, anon, authenticated');
    expect(initialMigration).toContain('GRANT ALL ON TABLE public.sales_lead_email_response_tokens TO service_role');
  });

  test('future CTA links point to the public OneMil page and remain immutable', () => {
    expect(publicPageMigration).toContain("https://onemil.cz/partner-response.html");
    expect(publicPageMigration).toContain("'?project=' || v_project_ref");
    expect(publicPageMigration).toContain("'&token=' || v_token || '&action=interest'");
    expect(publicPageMigration).toContain("'&token=' || v_token || '&action=decline'");
    expect(publicPageMigration).toContain('NEW.body_source_snapshot := NEW.body_source_snapshot');
    expect(publicPageMigration).toContain('NEW.body_text_snapshot := NEW.body_text_snapshot');
    expect(publicPageMigration).toContain('NEW.body_html_snapshot := NEW.body_html_snapshot');
    expect(publicPageMigration).toContain('Mám zájem');
    expect(publicPageMigration).toContain('Nemám zájem');
    expect(publicPageMigration).toContain('background:#f97316');
    expect(publicPageMigration).not.toMatch(/UPDATE public\.sales_lead_email_batch_items/i);
    expect(publicPageMigration).not.toContain("v_edge_base || '/sales-lead-response'");
  });

  test('the token row is stored only after the immutable item exists', () => {
    expect(snapshotFixMigration).toContain('CREATE TRIGGER trg_sales_lead_email_store_response_token');
    expect(snapshotFixMigration).toContain('AFTER INSERT ON public.sales_lead_email_batch_items');
    expect(snapshotFixMigration).toMatch(/INSERT INTO public\.sales_lead_email_response_tokens[\s\S]+NEW\.response_token_hash/);
    expect(snapshotFixMigration).toContain('NEW.id');
    expect(responseMigrations).not.toContain('fbe779c0-5198-41b3-9370-0ae6337fb808');
  });

  test('the response-token hash is protected with the rest of the snapshot', () => {
    expect(snapshotFixMigration).toContain('NEW.response_token_hash IS DISTINCT FROM OLD.response_token_hash');
    expect(snapshotFixMigration).toContain("MESSAGE = 'sales_lead_email_batch_snapshot_immutable'");
    expect(snapshotFixMigration).toContain('uq_sales_lead_email_batch_items_response_token_hash');
    expect(snapshotFixMigration).toContain("response_token_hash ~ '^[0-9a-f]{64}$'");
  });

  test('direct e-mail GET redirects to OneMil and JSON GET stays read-only', () => {
    expect(getBranch).toContain('return redirectToPublicPage(req, token, action)');
    expect(responseFunction).toContain('status: 302');
    expect(responseFunction).toContain('PUBLIC_PAGE_URL');
    expect(getBranch).toContain('.select("status,expires_at")');
    expect(getBranch).not.toContain('.rpc(');
    expect(getBranch).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    expect(responseFunction).toContain('GET is intentionally read-only');
    expect(responseFunction.indexOf('client.rpc("sales_lead_email_response_submit"'))
      .toBeGreaterThan(responseFunction.indexOf('const body = await readBody(req)'));
  });

  test('the public page shows interest and decline flows', () => {
    expect(publicPage).toContain('Děkujeme za projevený zájem');
    expect(publicPage).toContain('Jméno a příjmení');
    expect(publicPage).toContain('Telefonní číslo');
    expect(publicPage).toContain('Odeslat kontakt');
    expect(publicPage).toContain('Ano, nemám zájem');
    expect(publicPage).toContain('Další obchodní nabídky vám již nebudeme zasílat');
    expect(publicPage).toContain("url.searchParams.set('format', 'json')");
    expect(publicPage).toContain("'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'");
  });

  test('interest becomes an unread high-priority reply', () => {
    expect(initialMigration).toContain("v_action = 'interest'");
    expect(initialMigration).toContain('contact_person = v_name');
    expect(initialMigration).toContain('contact_phone = v_phone');
    expect(initialMigration).toContain('priority = 1');
    expect(initialMigration).toContain("status = 'odpovedel'");
    expect(initialMigration).toContain("'reply_received'");
    expect(initialMigration).toContain("'source', 'interest_link'");
    expect(initialMigration).toMatch(/'reply_received'[\s\S]+NULL\s*\n\s*\);/);
  });

  test('decline suppresses the address and blocks further outreach', () => {
    expect(initialMigration).toContain('do_not_contact = true');
    expect(initialMigration).toContain("status = 'nekontaktovat'");
    expect(initialMigration).toContain('INSERT INTO public.sales_lead_email_suppression');
    expect(initialMigration).toContain("'do_not_contact_set'");
    expect(initialMigration).toContain("'source', 'decline_link'");
    expect(initialMigration).toContain('pg_advisory_xact_lock');
  });

  test('responses are final and idempotent', () => {
    expect(initialMigration).toContain("v_response.status <> 'pending'");
    expect(initialMigration).toContain("'idempotent_replay', true");
    expect(initialMigration).toContain("'error', 'response_already_recorded'");
    expect(initialMigration).toContain('FOR UPDATE');
  });

  test('the public page uses the original project logo and restricts connections', () => {
    expect(publicPage).toContain('src="/onemil-logo.png"');
    expect(publicPage).toContain('connect-src https://dxmowysntemfqfnanxua.supabase.co https://xkzhjldrojjlrkezorey.supabase.co');
    expect(publicPage).toContain("const ALLOWED_PROJECTS = new Set");
    expect(publicPage).toContain('noindex,nofollow,noarchive');
  });

  test('the Edge Function is JSON-only, CORS-limited, and never sends e-mail', () => {
    expect(config).toContain('[functions.sales-lead-response]');
    expect(config).toMatch(/\[functions\.sales-lead-response\]\s+verify_jwt = false/);
    expect(responseFunction).toContain('ALLOWED_ORIGINS');
    expect(responseFunction).toContain('Access-Control-Allow-Origin');
    expect(responseFunction).toContain('application/json; charset=utf-8');
    expect(responseFunction).not.toMatch(/["']Content-Type["']\s*:\s*["']text\/html/i);
    expect(responseFunction).not.toMatch(/Resend|emails\.send|email_queue|net\.http/i);
    expect(responseMigrations).not.toMatch(/Resend|emails\.send|email_queue|net\.http/i);
  });
});
