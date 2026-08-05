import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const sender = read('supabase/functions/send-sales-lead-email/index.ts');
const delivery = read('supabase/functions/_shared/salesLeadInitialEmailDelivery.ts');
const migration = read('supabase/migrations/20260805140658_sales_lead_initial_email_delivery.sql');
const messages = read('src/components/admin/sales-leads/salesLeadsShared.ts');

test('manual sender keeps human auth and delegates initial delivery server-side', () => {
  expect(sender).toContain('sales_leads.manage');
  expect(sender).toContain('deliverSalesLeadInitialEmail');
  expect(delivery).not.toMatch(/\bserve\s*\(|Deno\.serve|functions\.invoke/);
});

test('stable provider idempotency key and fail-closed uncertain outcome are wired', () => {
  expect(sender).toContain('{ idempotencyKey }');
  expect(delivery).toContain('sales-lead-initial:v1:');
  expect(delivery).toContain('email_delivery_outcome_uncertain');
  expect(delivery).toContain('sales_lead_initial_email_commit');
  expect(migration).toContain("'action', 'commit_only'");
});

test('Resend idempotency conflicts are fail-closed and have explicit administrator guidance', () => {
  expect(sender).toContain('classifyInitialEmailProviderError');
  expect(delivery).toContain('normalized === "invalid_idempotent_request"');
  expect(delivery).toContain('normalized === "concurrent_idempotent_requests"');
  expect(delivery).toContain('email_delivery_idempotency_conflict');
  expect(delivery).not.toMatch(/EXPLICIT_PROVIDER_REJECTIONS[\s\S]{0,500}invalid_idempotent_request/);
  expect(messages).toContain('Odeslání je zablokované kvůli konfliktu bezpečnostního klíče. E-mail znovu neposílejte, dokud nebude stav ověřen.');
});

test('provider_rejected re-enters sending only after all authoritative barriers', () => {
  const retryMarker = migration.indexOf('IF v_retry_rejected THEN');
  expect(retryMarker).toBeGreaterThan(migration.indexOf("IF v_lead.do_not_contact"));
  expect(retryMarker).toBeGreaterThan(migration.indexOf('sales_lead_email_suppression'));
  expect(retryMarker).toBeGreaterThan(migration.indexOf('sales_lead_email_send_guard'));
  expect(migration.slice(0, retryMarker)).not.toMatch(/status = 'sending'.*attempt_count = attempt_count \+ 1/s);
});

test('delivery RPCs are service-role only with database unique guards', () => {
  expect(migration).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated/g);
  expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO service_role/g);
  expect(migration).toContain('uq_sales_lead_email_deliveries_provider_message');
  expect(migration).toContain('uq_sales_lead_activities_email_delivery');
  expect(migration).toContain('uq_sales_lead_email_deliveries_blocking_lead');
});

test('migration is passive and manual mode cannot process batch items', () => {
  expect(migration.slice(0, migration.indexOf('CREATE FUNCTION'))).not.toMatch(/INSERT INTO public\.sales_lead_email_deliveries/i);
  expect(migration).toContain("p_mode <> 'manual_initial'");
  expect(sender).not.toMatch(/sales_lead_email_batch_items|sales_lead_email_batches/);
});

test('no batch worker, cron, email queue, reply, or follow-up changes are introduced', () => {
  const changedRuntime = `${sender}\n${delivery}\n${migration}`;
  expect(changedRuntime).not.toMatch(/cron\.schedule|process-sales-lead-email-batch|email_queue/);
  expect(delivery).not.toMatch(/send-sales-lead-reply|send-sales-lead-follow-up/);
});
