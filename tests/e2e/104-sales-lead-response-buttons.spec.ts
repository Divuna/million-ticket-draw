import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260806100000_sales_lead_email_response_links.sql');
const responseFunction = read('supabase/functions/sales-lead-response/index.ts');
const config = read('supabase/config.toml');

const getBranch = responseFunction.slice(
  responseFunction.indexOf('if (req.method === "GET")'),
  responseFunction.indexOf('const body = await readForm(req)'),
);

test.describe('104 — sales-lead e-mail response buttons', () => {
  test('response tokens are hashed, private, expiring, and bound to one batch item', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.sales_lead_email_response_tokens');
    expect(migration).toContain('token_hash text NOT NULL UNIQUE');
    expect(migration).toContain('batch_item_id uuid NOT NULL UNIQUE');
    expect(migration).toContain("now() + interval '90 days'");
    expect(migration).toContain("extensions.digest(v_token, 'sha256')");
    expect(migration).not.toMatch(/\btoken\s+text\b/);
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON TABLE public.sales_lead_email_response_tokens FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('GRANT ALL ON TABLE public.sales_lead_email_response_tokens TO service_role');
  });

  test('only future batch items receive the two CTA links and styled buttons', () => {
    expect(migration).toContain('AFTER INSERT ON public.sales_lead_email_batch_items');
    expect(migration).toContain('Mám zájem');
    expect(migration).toContain('Nemám zájem');
    expect(migration).toContain('background:#f97316');
    expect(migration).toContain('border:1px solid #d6d3d1');
    expect(migration).toContain("body_text_snapshot = NEW.body_text_snapshot");
    expect(migration).toContain("body_html_snapshot = NEW.body_html_snapshot");
    expect(migration).not.toContain('fbe779c0-5198-41b3-9370-0ae6337fb808');
    expect(migration).not.toMatch(/UPDATE public\.sales_lead_email_batch_items[\s\S]+WHERE batch_id/i);
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
    expect(migration).toContain("v_action = 'interest'");
    expect(migration).toContain('contact_person = v_name');
    expect(migration).toContain('contact_phone = v_phone');
    expect(migration).toContain('priority = 1');
    expect(migration).toContain("status = 'odpovedel'");
    expect(migration).toContain("'reply_received'");
    expect(migration).toContain("'source', 'interest_link'");
    expect(migration).toMatch(/'reply_received'[\s\S]+NULL\s*\n\s*\);/);
  });

  test('decline suppresses the address and blocks further outreach', () => {
    expect(responseFunction).toContain('Ano, nemám zájem');
    expect(responseFunction).toContain('Další obchodní nabídky vám již nebudeme zasílat');
    expect(migration).toContain('do_not_contact = true');
    expect(migration).toContain("status = 'nekontaktovat'");
    expect(migration).toContain('INSERT INTO public.sales_lead_email_suppression');
    expect(migration).toContain("'do_not_contact_set'");
    expect(migration).toContain("'source', 'decline_link'");
    expect(migration).toContain('pg_advisory_xact_lock');
  });

  test('responses are final and idempotent', () => {
    expect(migration).toContain("v_response.status <> 'pending'");
    expect(migration).toContain("'idempotent_replay', true");
    expect(migration).toContain("'error', 'response_already_recorded'");
    expect(migration).toContain('FOR UPDATE');
  });

  test('the public function is registered and does not send e-mail', () => {
    expect(config).toContain('[functions.sales-lead-response]');
    expect(config).toMatch(/\[functions\.sales-lead-response\]\s+verify_jwt = false/);
    expect(responseFunction).not.toMatch(/Resend|emails\.send|email_queue|net\.http/i);
    expect(migration).not.toMatch(/Resend|emails\.send|email_queue|net\.http/i);
    expect(responseFunction).toContain("frame-ancestors 'none'");
    expect(responseFunction).toContain('Cache-Control');
  });
});
