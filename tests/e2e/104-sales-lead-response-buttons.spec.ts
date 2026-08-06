import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const initialMigration = read('supabase/migrations/20260806100000_sales_lead_email_response_links.sql');
const fixMigration = read('supabase/migrations/20260806104000_fix_sales_lead_response_snapshot_trigger.sql');
const responseMigrations = `${initialMigration}\n${fixMigration}`;
const responseFunction = read('supabase/functions/sales-lead-response/index.ts');
const config = read('supabase/config.toml');

const getBranch = responseFunction.slice(
  responseFunction.indexOf('if (req.method === "GET")'),
  responseFunction.indexOf('const body = await readForm(req)'),
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

  test('CTA links become part of the immutable snapshot before insertion', () => {
    expect(fixMigration).toContain('response_token_hash text');
    expect(fixMigration).toContain('CREATE TRIGGER trg_sales_lead_email_prepare_response_links');
    expect(fixMigration).toContain('BEFORE INSERT ON public.sales_lead_email_batch_items');
    expect(fixMigration).toContain('NEW.body_source_snapshot := NEW.body_source_snapshot');
    expect(fixMigration).toContain('NEW.body_text_snapshot := NEW.body_text_snapshot');
    expect(fixMigration).toContain('NEW.body_html_snapshot := NEW.body_html_snapshot');
    expect(fixMigration).toContain('Mám zájem');
    expect(fixMigration).toContain('Nemám zájem');
    expect(fixMigration).toContain('background:#f97316');
    expect(fixMigration).toContain('border:1px solid #d6d3d1');
    expect(fixMigration).not.toMatch(/UPDATE public\.sales_lead_email_batch_items/i);
    expect(fixMigration).toContain('DROP TRIGGER IF EXISTS trg_sales_lead_email_attach_response_links');
  });

  test('the token row is stored only after the immutable item exists', () => {
    expect(fixMigration).toContain('CREATE TRIGGER trg_sales_lead_email_store_response_token');
    expect(fixMigration).toContain('AFTER INSERT ON public.sales_lead_email_batch_items');
    expect(fixMigration).toMatch(/INSERT INTO public\.sales_lead_email_response_tokens[\s\S]+NEW\.response_token_hash/);
    expect(fixMigration).toContain('NEW.batch_item_id');
    expect(fixMigration).not.toContain('fbe779c0-5198-41b3-9370-0ae6337fb808');
  });

  test('the response-token hash is protected with the rest of the snapshot', () => {
    expect(fixMigration).toContain('NEW.response_token_hash IS DISTINCT FROM OLD.response_token_hash');
    expect(fixMigration).toContain("MESSAGE = 'sales_lead_email_batch_snapshot_immutable'");
    expect(fixMigration).toContain('uq_sales_lead_email_batch_items_response_token_hash');
    expect(fixMigration).toContain("response_token_hash ~ '^[0-9a-f]{64}$'");
  });

  test('opening a link is read-only and cannot submit a decision', () => {
    expect(getBranch).toContain('.select("status,expires_at")');
    expect(getBranch).not.toContain('.rpc(');
    expect(getBranch).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    expect(responseFunction).toContain('GET is intentionally read-only');
    expect(responseFunction.indexOf('client.rpc("sales_lead_email_response_submit"'))
      .toBeGreaterThan(responseFunction.indexOf('const body = await readForm(req)'));
  });

  test('interest requires a name and phone and becomes an unread high-priority reply', () => {
    expect(responseFunction).toContain('Jméno a příjmení');
    expect(responseFunction).toContain('Telefonní číslo');
    expect(responseFunction).toContain('Odeslat kontakt');
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
    expect(responseFunction).toContain('Ano, nemám zájem');
    expect(responseFunction).toContain('Další obchodní nabídky vám již nebudeme zasílat');
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

  test('the public function is registered and does not send e-mail', () => {
    expect(config).toContain('[functions.sales-lead-response]');
    expect(config).toMatch(/\[functions\.sales-lead-response\]\s+verify_jwt = false/);
    expect(responseFunction).not.toMatch(/Resend|emails\.send|email_queue|net\.http/i);
    expect(responseMigrations).not.toMatch(/Resend|emails\.send|email_queue|net\.http/i);
    expect(responseFunction).toContain("frame-ancestors 'none'");
    expect(responseFunction).toContain('Cache-Control');
  });
});
