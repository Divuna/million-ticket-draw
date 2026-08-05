import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const sender = read('supabase/functions/send-sales-lead-email/index.ts');
const delivery = read('supabase/functions/_shared/salesLeadInitialEmailDelivery.ts');
const migration = read('supabase/migrations/20260805140658_sales_lead_initial_email_delivery.sql');

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
