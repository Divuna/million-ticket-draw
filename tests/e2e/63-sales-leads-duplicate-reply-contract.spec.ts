import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('supabase/migrations/20260710180000_sales_leads_replies_duplicate_overrides.sql');
const initialSender = read('supabase/functions/send-sales-lead-email/index.ts');
const replySender = read('supabase/functions/send-sales-lead-reply/index.ts');
const shared = read('src/components/admin/sales-leads/salesLeadsShared.ts');

test.describe('63 — sales leads duplicate override and reply security contract', () => {
  test('exact email is always checked and public domains only skip domain-level matching', () => {
    expect(migration).toContain("lower(btrim(l.contact_email)) = n.email");
    expect(migration).toContain('sales_lead_public_email_domains');
    expect(migration).toContain("('gmail.com')");
    expect(migration).toContain("('seznam.cz')");
    expect(migration).toContain("('outlook.com')");
    expect(migration).toContain('NOT EXISTS (SELECT 1 FROM public.sales_lead_public_email_domains');
  });

  test('create and update enforce server-side conflicts, reason and serialized domain check', () => {
    expect(migration.match(/duplicate_conflict/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration.match(/duplicate_override_reason_required/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration.match(/pg_advisory_xact_lock/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain('sales_lead_record_duplicate_overrides');
    expect(migration).toContain("activity_type,direction,performed_by,metadata");
    expect(migration).toContain("has_admin_permission('sales_leads.manage'");
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.sales_lead_duplicate_matches(text,uuid) FROM PUBLIC, anon, authenticated');
  });

  test('both send paths call the service-role-only duplicate guard', () => {
    expect(initialSender).toContain('sales_lead_email_send_guard');
    expect(replySender).toContain('sales_lead_email_send_guard');
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.sales_lead_email_send_guard(uuid) FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.sales_lead_email_send_guard(uuid) TO service_role');
  });

  test('reply validates JWT, permission, target activity, suppression and do-not-contact', () => {
    expect(replySender).toContain('admin.auth.getUser');
    expect(replySender).toContain('has_admin_permission');
    expect(replySender).toContain('.eq("activity_type", "reply_received")');
    expect(replySender).toContain('sales_lead_email_suppression');
    expect(replySender).toContain('lead.do_not_contact');
    expect(replySender).toContain('reply_to_activity_id');
  });

  test('status values stay stable and only labels change', () => {
    expect(shared).toContain("konvertovan: 'Spolupráce'");
    expect(shared).toContain("odmitl: 'Bez spolupráce'");
    expect(shared).toContain("nekontaktovat: 'Nekontaktovat'");
  });
});
