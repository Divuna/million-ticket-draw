import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import {
  EMPTY_RESPONSE_OVERVIEW,
  displayOrDash,
  isHighPriorityInterest,
  parseResponseOverview,
  sortDeclinedRows,
  sortInterestedRows,
  type InterestedResponseRow,
} from '../../src/components/admin/sales-leads/salesLeadResponses';

// Normalizace konců řádků: git na Windows může soubory vytáhnout s CRLF, což by
// rozbilo víceřádkové značky použité k výřezu SQL.
const read = (path: string) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const migration = read('supabase/migrations/20260806160000_sales_lead_response_overview.sql');
const executableSql = migration.replace(/--.*$/gm, '');
const adminPage = read('src/pages/AdminSalesLeads.tsx');
const detailSheet = read('src/components/admin/sales-leads/SalesLeadDetailSheet.tsx');

/** Payload ve tvaru, v jakém ho vrací RPC sales_lead_response_overview(). */
const rpcPayload = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  interested: [],
  declined: [],
  interested_total: 0,
  declined_total: 0,
  interested_unread: 0,
  declined_unread: 0,
  ...overrides,
});

const interestedRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  lead_id: 'lead-interest',
  company_name: 'Firma Se Zájmem',
  lead_status: 'odpovedel',
  priority: 1,
  contact_person: 'Jana Nováková',
  contact_phone: '+420 777 123 456',
  contact_email: 'firma@example.test',
  responded_at: '2026-08-06T10:00:00.000Z',
  batch_item_id: 'batch-1',
  unread: true,
  ...overrides,
});

const declinedRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  lead_id: 'lead-decline',
  company_name: 'Firma Bez Zájmu',
  lead_status: 'nekontaktovat',
  contact_email: 'odmitl@example.test',
  responded_at: '2026-08-06T11:00:00.000Z',
  batch_item_id: 'batch-2',
  do_not_contact: true,
  do_not_contact_reason: 'Příjemce zvolil Nemám zájem v obchodním e-mailu',
  suppressed: true,
  unread: true,
  ...overrides,
});

test.describe('106 — přehled reakcí Mám zájem / Nemám zájem', () => {
  test('1) lead s potvrzeným zájmem se objeví v Kontaktovat', () => {
    const overview = parseResponseOverview(rpcPayload({
      interested: [interestedRow()],
      interested_total: 1,
      interested_unread: 1,
    }));
    expect(overview.interested).toHaveLength(1);
    expect(overview.interested[0].lead_id).toBe('lead-interest');
    expect(overview.interestedTotal).toBe(1);
  });

  test('2) běžná e-mailová odpověď se v Kontaktovat neobjeví', () => {
    // RPC filtruje na metadata source='interest_link'; běžná odpověď z EF
    // `sales-lead-inbound` žádný source nemá, takže se do payloadu nedostane.
    const overview = parseResponseOverview(rpcPayload());
    expect(overview.interested).toHaveLength(0);
    expect(overview.interestedUnread).toBe(0);

    expect(executableSql).toContain("a.metadata->>'source' = 'interest_link'");
    expect(executableSql).toContain("(a.metadata->>'interest')::boolean IS TRUE");
  });

  test('3) nepřečtená reakce Mám zájem zvýší červený počet', () => {
    const overview = parseResponseOverview(rpcPayload({
      interested: [interestedRow()],
      interested_total: 1,
      interested_unread: 1,
    }));
    expect(overview.interestedUnread).toBe(1);
    expect(adminPage).toContain('sl-interested-unread-count');
    expect(adminPage).toContain('responses.interestedUnread > 0');
  });

  test('4) po otevření detailu počet klesne', () => {
    const afterRead = parseResponseOverview(rpcPayload({
      interested: [interestedRow({ unread: false })],
      interested_total: 1,
      interested_unread: 0,
    }));
    expect(afterRead.interestedUnread).toBe(0);
    // Detail volá existující funkci značení přečtení.
    expect(detailSheet).toContain("rpc('sales_lead_mark_replies_read'");
    expect(executableSql).toContain('CREATE OR REPLACE FUNCTION public.sales_lead_mark_replies_read');
  });

  test('5) přečtení lead ze záložky Kontaktovat neodstraní', () => {
    const afterRead = parseResponseOverview(rpcPayload({
      interested: [interestedRow({ unread: false })],
      interested_total: 1,
      interested_unread: 0,
    }));
    expect(afterRead.interested).toHaveLength(1);
    expect(afterRead.interestedTotal).toBe(1);
    // Členství v záložce se odvozuje od konečného stavu tokenu, ne od read_at.
    expect(executableSql).toContain("WHERE t.status IN ('interested', 'declined')");
  });

  test('6) jméno a telefon se zobrazí; chybějící údaj nevymýšlí hodnotu', () => {
    const overview = parseResponseOverview(rpcPayload({
      interested: [
        interestedRow(),
        interestedRow({ lead_id: 'b', company_name: 'Bez kontaktu', contact_person: null, contact_phone: '   ' }),
      ],
    }));
    expect(overview.interested[0].contact_person).toBe('Jana Nováková');
    expect(overview.interested[0].contact_phone).toBe('+420 777 123 456');
    expect(overview.interested[1].contact_person).toBeNull();
    expect(overview.interested[1].contact_phone).toBeNull();
    expect(displayOrDash(overview.interested[1].contact_person)).toBe('—');
    expect(displayOrDash(overview.interested[0].contact_phone)).toBe('+420 777 123 456');
  });

  test('7) lead se zájmem má vysokou prioritu a řadí se první', () => {
    const overview = parseResponseOverview(rpcPayload({ interested: [interestedRow()] }));
    expect(isHighPriorityInterest(overview.interested[0])).toBe(true);

    const rows = parseResponseOverview(rpcPayload({
      interested: [
        interestedRow({ lead_id: 'stara-neprectena', responded_at: '2026-08-01T09:00:00.000Z', unread: true }),
        interestedRow({ lead_id: 'nova-prectena', responded_at: '2026-08-06T09:00:00.000Z', unread: false }),
        interestedRow({ lead_id: 'starsi-prectena', responded_at: '2026-08-02T09:00:00.000Z', unread: false }),
      ],
    })).interested;
    // 1) nepřečtené, 2) nejnovější, 3) ostatní
    expect(sortInterestedRows(rows).map((r) => r.lead_id))
      .toEqual(['stara-neprectena', 'nova-prectena', 'starsi-prectena']);
  });

  test('8) odmítnutý lead se objeví v Nekontaktovat', () => {
    const overview = parseResponseOverview(rpcPayload({
      declined: [declinedRow()],
      declined_total: 1,
      declined_unread: 1,
    }));
    expect(overview.declined).toHaveLength(1);
    expect(overview.declined[0].lead_status).toBe('nekontaktovat');
    expect(overview.declinedTotal).toBe(1);
    expect(sortDeclinedRows(overview.declined)).toHaveLength(1);
  });

  test('9) nepřečtené odmítnutí zvýší červený počet u Nekontaktovat', () => {
    const overview = parseResponseOverview(rpcPayload({
      declined: [declinedRow()],
      declined_total: 1,
      declined_unread: 1,
    }));
    expect(overview.declinedUnread).toBe(1);
    expect(adminPage).toContain('sl-declined-unread-count');
    expect(adminPage).toContain("t.id === 'blocked' && responses.declinedUnread > 0");
  });

  test('10) po otevření detailu klesne i počet odmítnutí', () => {
    const afterRead = parseResponseOverview(rpcPayload({
      declined: [declinedRow({ unread: false })],
      declined_total: 1,
      declined_unread: 0,
    }));
    expect(afterRead.declinedUnread).toBe(0);
    expect(afterRead.declined).toHaveLength(1);
    // Značení přečtení nově pokrývá i odmítnutí z tlačítka.
    expect(executableSql).toMatch(
      /activity_type = 'do_not_contact_set'\s+AND metadata->>'source' = 'decline_link'/,
    );
  });

  test('11) přečtení nezruší suppression ani do_not_contact', () => {
    const afterRead = parseResponseOverview(rpcPayload({
      declined: [declinedRow({ unread: false })],
    }));
    expect(afterRead.declined[0].do_not_contact).toBe(true);
    expect(afterRead.declined[0].suppressed).toBe(true);

    // Funkce značení přečtení mění výhradně read_at/read_by.
    const markFn = executableSql.slice(
      executableSql.indexOf('CREATE OR REPLACE FUNCTION public.sales_lead_mark_replies_read'),
      executableSql.indexOf('CREATE OR REPLACE FUNCTION public.sales_lead_response_overview'),
    );
    expect(markFn).toContain('SET read_at = now(), read_by = auth.uid()');
    // `do_not_contact_set` je jen NÁZEV typu aktivity; sloupec do_not_contact
    // ani jeho důvod se nikdy nepřepisuje.
    expect(markFn).not.toMatch(/do_not_contact\s*=/i);
    expect(markFn).not.toMatch(/do_not_contact_reason/i);
    expect(markFn).not.toMatch(/sales_lead_email_suppression/i);
    expect(markFn).not.toMatch(/UPDATE public\.sales_leads\b/i);
    expect(markFn).not.toMatch(/DELETE/i);
    // Jediný UPDATE ve funkci je nad tabulkou aktivit.
    expect(markFn.match(/UPDATE\s+public\.\w+/gi)).toEqual(['UPDATE public.sales_lead_activities']);
    // Nikde v migraci se suppression nemaže a do_not_contact se neruší.
    expect(executableSql).not.toMatch(/DELETE\s+FROM\s+public\.sales_lead_email_suppression/i);
    expect(executableSql).not.toMatch(/do_not_contact\s*=\s*false/i);
  });

  test('12) ručně nastavený Nekontaktovat se nepočítá jako nové odmítnutí', () => {
    // Ruční změna stavu zakládá do_not_contact_set BEZ metadata.source,
    // takže ho počet ani značení přečtení nikdy nechytí.
    const overview = parseResponseOverview(rpcPayload());
    expect(overview.declinedUnread).toBe(0);
    expect(overview.declined).toHaveLength(0);

    const declineCount = executableSql.slice(
      executableSql.indexOf('unread_decline AS ('),
      executableSql.indexOf('-- Jeden lead = jedna skupina'),
    );
    expect(declineCount).toContain("a.metadata->>'source' = 'decline_link'");
    expect(declineCount).toContain('a.read_at IS NULL');
  });

  test('13) jeden token se nepočítá v obou skupinách', () => {
    const overview = parseResponseOverview(rpcPayload({
      interested: [interestedRow()],
      declined: [declinedRow()],
      interested_total: 1,
      declined_total: 1,
    }));
    const interestedIds = new Set(overview.interested.map((r) => r.lead_id));
    const declinedIds = new Set(overview.declined.map((r) => r.lead_id));
    expect([...interestedIds].filter((id) => declinedIds.has(id))).toHaveLength(0);

    // Autoritou je nejnovější zodpovězený token na lead (DISTINCT ON) a skupiny
    // se vybírají vzájemně výlučnou podmínkou na response_status.
    expect(executableSql).toContain('SELECT DISTINCT ON (t.lead_id)');
    expect(executableSql).toContain('ORDER BY t.lead_id, t.responded_at DESC NULLS LAST');
    expect(executableSql).toContain("WHERE r.response_status = 'interested'");
    expect(executableSql).toContain("WHERE r.response_status = 'declined'");
  });

  test('14) oprávnění databázových funkcí', () => {
    expect(executableSql).toContain('SECURITY DEFINER');
    expect(executableSql).toContain("SET search_path = ''");
    expect(executableSql).toContain(
      "public.has_admin_permission('sales_leads.manage') OR public.is_superadmin()",
    );
    expect(executableSql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.sales_lead_response_overview() FROM PUBLIC, anon',
    );
    expect(executableSql).toContain(
      'GRANT  EXECUTE ON FUNCTION public.sales_lead_response_overview() TO authenticated',
    );
    // Přehled je jen pro čtení — žádný zápis při načítání počtů.
    const overviewFn = executableSql.slice(
      executableSql.indexOf('CREATE OR REPLACE FUNCTION public.sales_lead_response_overview'),
    );
    expect(overviewFn).toContain('STABLE');
    expect(overviewFn).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(overviewFn).not.toMatch(/\bUPDATE\s+public\./i);
    expect(overviewFn).not.toMatch(/\bDELETE\s+FROM\b/i);
    // Token ani jeho hash se nikdy nevrací ven.
    expect(overviewFn).not.toMatch(/token_hash/i);
    // Migrace nesmí zapnout automatiku, vytvořit dávku, cron ani poslat e-mail.
    expect(executableSql).not.toMatch(/cron\.schedule|pg_net|net\.http|Resend|email_queue/i);
    expect(executableSql).not.toMatch(/sales_lead_email_automation_settings/i);
    expect(executableSql).not.toMatch(/INSERT\s+INTO\s+public\.sales_lead_email_batch/i);
  });

  test('záložka Kontaktovat je mezi Osloveno a Odpovědělo a není to nový stav', () => {
    const tabs = adminPage.slice(adminPage.indexOf('const TABS'), adminPage.indexOf('const formatDate'));
    const contacted = tabs.indexOf("id: 'contacted'");
    const toContact = tabs.indexOf("id: 'to-contact'");
    const replied = tabs.indexOf("id: 'replied'");
    expect(contacted).toBeGreaterThan(-1);
    expect(toContact).toBeGreaterThan(contacted);
    expect(replied).toBeGreaterThan(toContact);
    expect(tabs).toContain("label: 'Kontaktovat'");
    // Žádný nový stav leadu `kontaktovat`.
    expect(adminPage).not.toMatch(/'kontaktovat'/);
    expect(executableSql).not.toMatch(/'kontaktovat'/);
  });

  test('počty jdou z DB přes RPC, frontend nepoužívá service-role klíč', () => {
    expect(adminPage).toContain("rpc('sales_lead_response_overview')");
    expect(adminPage).not.toMatch(/service_role|SERVICE_ROLE/);
    // Tabulka tokenů se z frontendu nikdy nečte přímo.
    expect(adminPage).not.toContain('sales_lead_email_response_tokens');
    expect(detailSheet).not.toContain('sales_lead_email_response_tokens');
  });

  test('detail ukazuje záznam zájmu i odmítnutí', () => {
    expect(detailSheet).toContain('sl-detail-interest-response');
    expect(detailSheet).toContain('sl-detail-decline-response');
    expect(detailSheet).toContain('RESPONSE_DECLINED_SUMMARY');
    expect(detailSheet).toContain('Důvod blokace');
    expect(detailSheet).toContain('Stav odhlášení');
    expect(detailSheet).toContain('Další obchodní e-maily jsou pro tuto adresu blokované');
    // Ručně nastavené „Nekontaktovat“ tenhle panel nezobrazí.
    expect(detailSheet).toContain("a.metadata?.source === 'decline_link'");
  });

  test('poškozený nebo chybějící payload skončí prázdným přehledem', () => {
    expect(parseResponseOverview(null)).toEqual(EMPTY_RESPONSE_OVERVIEW);
    expect(parseResponseOverview({ success: false, error: 'access_denied' }))
      .toEqual(EMPTY_RESPONSE_OVERVIEW);
    expect(parseResponseOverview({ success: true })).toEqual(EMPTY_RESPONSE_OVERVIEW);
  });

  test('souhrnné karty Kontaktovat a Nemá zájem nepočítají stejný lead dvakrát', () => {
    expect(adminPage).toContain("label: 'Kontaktovat', value: responses.interestedTotal");
    expect(adminPage).toContain("label: 'Nemá zájem', value: responses.declinedTotal");
    const rows: InterestedResponseRow[] = parseResponseOverview(rpcPayload({
      interested: [interestedRow(), interestedRow()],
      interested_total: 1,
    })).interested;
    // Duplicitní lead_id nemůže z RPC vzniknout (DISTINCT ON na lead_id).
    expect(new Set(rows.map((r) => r.lead_id)).size).toBe(1);
  });
});
