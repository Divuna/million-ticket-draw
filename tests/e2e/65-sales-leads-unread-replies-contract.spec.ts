import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Kontraktní test (statická kontrola zdroje) — upozornění na nepřečtené
 * příchozí odpovědi v modulu Obchod / Leady. Neposílá e-mail, nespouští SQL.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const migration = read('supabase/migrations/20260711100000_sales_leads_activity_read_state.sql');
const page = read('src/pages/AdminSalesLeads.tsx');
const nav = read('src/components/admin/AdminContextSubNav.tsx');
const detail = read('src/components/admin/sales-leads/SalesLeadDetailSheet.tsx');

test.describe('65 — sales leads unread replies contract', () => {
  test('migration adds read state, partial index and backfills existing replies as read', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS read_at timestamptz');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS read_by uuid');
    expect(migration).toContain('idx_sales_lead_activities_unread_reply');
    expect(migration).toContain("WHERE activity_type = 'reply_received' AND read_at IS NULL");
    // Historické odpovědi se při nasazení označí jako přečtené (žádná záplava).
    expect(migration).toContain('SET read_at = created_at');
  });

  test('mark-read RPC is permission-guarded, service side, and never touches lead status', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.sales_lead_mark_replies_read(p_lead_id uuid)');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toMatch(/has_admin_permission\('sales_leads\.manage'\)\s+OR\s+public\.is_superadmin\(\)/);
    // Aktualizuje jen aktivity, NIKDY sales_leads (stav jednani/odpovedel beze změny).
    expect(migration).toContain('UPDATE public.sales_lead_activities');
    expect(migration).not.toContain('UPDATE public.sales_leads');
    // Označuje jen nepřečtené příchozí odpovědi.
    expect(migration).toMatch(/activity_type = 'reply_received'[\s\S]*read_at IS NULL/);
    // Grant hygiena.
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.sales_lead_mark_replies_read(uuid) FROM PUBLIC, anon');
    expect(migration).toContain('GRANT  EXECUTE ON FUNCTION public.sales_lead_mark_replies_read(uuid) TO authenticated');
  });

  test('list counts unread replies and highlights affected leads', () => {
    expect(page).toContain("activity_type', 'reply_received'");
    expect(page).toContain(".is('read_at', null)");
    expect(page).toContain('unreadLeadIds');
    expect(page).toContain('unreadTotal');
    // Karta „Odpovědělo" nese červený počet nepřečtených.
    expect(page).toMatch(/label: 'Odpovědělo'[\s\S]*unread: unreadTotal/);
    // Řádek s nepřečtenou odpovědí: červená tečka + tučný název.
    expect(page).toContain('unreadLeadIds.has(lead.id)');
    expect(page).toContain('bg-destructive');
    expect(page).toContain('font-bold');
  });

  test('nav badge counts unread replies on the sales-leads item', () => {
    expect(nav).toContain('unreadSalesRepliesCount');
    expect(nav).toContain('"reply_received"');
    expect(nav).toContain('.is("read_at", null)');
    expect(nav).toContain('item.path === "/admin/sales-leads"');
    // Okamžitá aktualizace po přečtení v detailu.
    expect(nav).toContain('sales-leads-unread-changed');
  });

  test('detail highlights unread reply, marks read on open without changing status', () => {
    expect(detail).toContain('read_at, metadata');
    expect(detail).toContain("activity.activity_type === 'reply_received' && !activity.read_at");
    expect(detail).toContain('sales_lead_mark_replies_read');
    // Po přečtení pošle signál seznamu i navigaci (ihned bez ručního obnovení).
    expect(detail).toContain("new Event('sales-leads-unread-changed')");
  });
});
