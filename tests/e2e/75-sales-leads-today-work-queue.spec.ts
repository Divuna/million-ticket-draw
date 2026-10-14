import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { completedToday, pragueDayKey, workQueueBucket } from '../../src/components/admin/sales-leads/salesLeadWorkQueue';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260714141545_sales_leads_today_work_queue.sql');
const page = read('src/pages/AdminSalesLeads.tsx');
const today = read('src/components/admin/sales-leads/SalesLeadToday.tsx');

test.describe('75 — společný denní přehled práce u leadů', () => {
  test('řadí termíny podle českého kalendářního dne a drží zmeškané položky', () => {
    const now = new Date('2026-07-14T10:00:00.000Z'); // 12:00 v Praze
    expect(pragueDayKey(now)).toBe('2026-07-14');
    expect(workQueueBucket('2026-07-13T20:00:00.000Z', now)).toBe('overdue');
    expect(workQueueBucket('2026-07-14T16:00:00.000Z', now)).toBe('today');
    expect(workQueueBucket('2026-07-15T08:00:00.000Z', now)).toBe('upcoming');
    expect(completedToday('2026-07-14T08:00:00.000Z', now)).toBe(true);
    expect(completedToday('2026-07-13T08:00:00.000Z', now)).toBe(false);
  });

  test('rozšiřuje existující tabulky a všechny zápisy chrání oprávněním', () => {
    expect(migration).toContain("task_type IN ('ukol', 'follow_up')");
    expect(migration).toContain("status IN ('ceka', 'rozpracovano', 'dokonceno', 'zruseno')");
    expect(migration).toContain("activity_status IN ('naplanovano', 'rozpracovano', 'dokonceno', 'zruseno')");
    expect(migration).toContain('sales_lead_task_reschedule');
    expect(migration).toContain('sales_lead_scheduled_activity_reschedule');
    expect(migration).toContain("has_admin_permission('sales_leads.manage'");
    expect(migration).toContain('REVOKE EXECUTE');
    expect(migration).not.toContain('DELETE FROM public.sales_lead_tasks');
    expect(migration).not.toContain('DELETE FROM public.sales_lead_activities');
  });

  test('záložka Dnes zobrazuje firmu, typ, termín, odpovědnou osobu a stav', () => {
    expect(page).toContain("{ id: 'today', label: 'Dnes'");
    expect(page).toContain('<SalesLeadToday');
    for (const value of ['Společný přehled práce', 'Odpovídá:', 'Po termínu', 'Rozpracováno', 'Dokončit', 'Přesunout']) {
      expect(today).toContain(value);
    }
  });

  test('poznámky bez termínu se do fronty nenačítají', () => {
    expect(today).toContain(".not('scheduled_for', 'is', null)");
    expect(today).toContain("['call_logged', 'meeting_logged', 'note_added']");
  });
});
