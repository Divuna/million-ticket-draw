/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Rozpracované e-mailové koncepty — tiché autosave  (spec 93)              ║
 * ║                                                                            ║
 * ║  Ověřuje serverovou i UI vrstvu automatického ukládání konceptů:           ║
 * ║    • uložený koncept zařadí lead mezi Rozpracované                         ║
 * ║    • starší požadavek NEPŘEPÍŠE novější text (last-write-wins)             ║
 * ║    • prázdný koncept lead z Rozpracovaných odebere                         ║
 * ║    • smazání konceptu nesmaže lead ani historii                            ║
 * ║    • autosave nezahltí audit (aktivita jen při vzniku konceptu)            ║
 * ║                                                                            ║
 * ║  STAGING-ONLY (DB část), self-contained. Kontraktní část běží všude.       ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const SUPERADMIN_EMAIL = process.env.E2E_SUPERADMIN_EMAIL ?? '';
const SUPERADMIN_PASSWORD = process.env.E2E_SUPERADMIN_PASSWORD ?? '';

const stamp = Date.now();
const admin = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const createdLeadIds: string[] = [];

// ── Kontraktní část ──────────────────────────────────────────────────────────

test.describe('93 — kontrakt: tiché ukládání konceptů', () => {
  const hook = fs.readFileSync('src/components/admin/sales-leads/useDraftAutosave.ts', 'utf8');
  const sheet = fs.readFileSync('src/components/admin/sales-leads/SalesLeadDetailSheet.tsx', 'utf8');
  const page = fs.readFileSync('src/pages/AdminSalesLeads.tsx', 'utf8');
  const migration = fs.readFileSync(
    'supabase/migrations/20260721160000_sales_lead_draft_autosave.sql', 'utf8');

  test('záložka se jmenuje Rozpracované a filtruje podle uloženého konceptu', () => {
    expect(page).toContain("label: 'Rozpracované'");
    expect(page).not.toContain("label: 'Příprava'");
    expect(page).toContain('draftsOnly: true');
    // Rozpracované filtruje podle skutečně uloženého konceptu (draft_updated_at).
    expect(page).toMatch(/draftsOnly\b[\s\S]{0,200}draft_updated_at/);
    expect(page).toContain('draftCount');
  });

  test('ukládá se až po pauze v psaní a nezakazuje inputy', () => {
    expect(hook).toContain('DRAFT_AUTOSAVE_DELAY_MS');
    // 2–3 sekundy dle zadání
    const delay = Number(hook.match(/DRAFT_AUTOSAVE_DELAY_MS = (\d+)/)?.[1] ?? 0);
    expect(delay).toBeGreaterThanOrEqual(2000);
    expect(delay).toBeLessThanOrEqual(3000);
    // Autosave má vlastní stav — `draftSaving` zakazuje inputy a shodil by kurzor.
    expect(sheet).toContain('autosave.state');
    expect(hook).not.toContain('setDraftSaving');
  });

  test('stavy jsou nenápadné a pokrývají offline', () => {
    expect(hook).toContain('Ukládám…');
    expect(hook).toContain('Uloženo');
    expect(hook).toContain('Bez připojení — změny budou uloženy později');
  });

  test('offline záloha, synchronizace po připojení a flush při opuštění', () => {
    expect(hook).toContain('localStorage');
    expect(hook).toContain("addEventListener('online'");
    expect(hook).toContain("addEventListener('beforeunload'");
    expect(hook).toContain('visibilitychange');
    expect(sheet).toContain('autosave.flush()');
  });

  test('server řeší souběh a nezahlcuje audit', () => {
    expect(migration).toContain('draft_updated_at');
    expect(migration).toContain('v_when <= v_lead.draft_updated_at');
    expect(migration).toContain("'stale', true");
    // Audit jen při vzniku konceptu
    expect(migration).toContain('IF v_has AND NOT v_had THEN');
    expect(migration).toContain("has_admin_permission('sales_leads.manage'");
    expect(migration).toContain('REVOKE ALL ON FUNCTION');
  });

  test('pravidla odesílání zůstávají a koncept jde smazat', () => {
    expect(sheet).toContain('hasContactEmail');
    expect(sheet).toContain('Smazat koncept');
    expect(sheet).toContain('Smazat rozepsaný koncept?');
  });
});

// ── DB část ──────────────────────────────────────────────────────────────────

test.describe.serial('93 — autosave konceptů proti DB', () => {
  test.skip(
    !SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD,
    'Missing staging env — skipping spec 93 DB part',
  );

  let client: SupabaseClient;
  let callerId = '';

  const seed = async (name: string) => {
    const { data, error } = await (admin() as any)
      .from('sales_leads')
      .insert({ company_name: name, status: 'novy', source: 'rucne', created_by: callerId })
      .select('id').single();
    if (error) throw new Error(`seed: ${error.message}`);
    createdLeadIds.push(data.id as string);
    return data.id as string;
  };

  const getLead = async (id: string) => {
    const { data } = await (admin() as any)
      .from('sales_leads')
      .select('id, company_name, status, draft_email_subject, draft_email_body, draft_updated_at')
      .eq('id', id).maybeSingle();
    return data as Record<string, unknown> | null;
  };

  const autosave = (leadId: string, subject: string, body: string, at: Date) =>
    (client as any).rpc('sales_lead_autosave_draft', {
      p_lead_id: leadId, p_subject: subject, p_body: body,
      p_client_updated_at: at.toISOString(),
    });

  test.beforeAll(async () => {
    client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({
      email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD,
    });
    if (error) throw new Error(`signIn: ${error.message}`);
    callerId = data.user!.id;
  });

  test.afterAll(async () => {
    const a = admin() as any;
    for (const id of createdLeadIds) {
      await a.from('sales_lead_activities').delete().eq('lead_id', id);
      await a.from('sales_lead_status_history').delete().eq('lead_id', id);
      await a.from('sales_leads').delete().eq('id', id);
    }
  });

  test('93a) uložený koncept zařadí lead mezi Rozpracované', async () => {
    const id = await seed(`Spec93 A ${stamp}`);
    expect((await getLead(id))?.draft_updated_at).toBeNull();

    const { data } = await autosave(id, 'Předmět A', 'Tělo A', new Date());
    expect((data as any)?.success, JSON.stringify(data)).toBe(true);

    const lead = await getLead(id);
    expect(lead?.draft_email_subject).toBe('Předmět A');
    expect(lead?.draft_email_body).toBe('Tělo A');
    expect(lead?.draft_updated_at, 'lead musí být Rozpracovaný').not.toBeNull();
  });

  test('93b) starší uložení nepřepíše novější verzi', async () => {
    const id = await seed(`Spec93 B ${stamp}`);
    const newer = new Date();
    const older = new Date(newer.getTime() - 5_000);

    // Nejdřív dorazí novější text…
    await autosave(id, 'Nové', 'Novější text', newer);
    // …a až potom opožděný starší požadavek.
    const { data } = await autosave(id, 'Staré', 'Starší text', older);

    expect((data as any)?.stale, 'starší požadavek musí být zahozen').toBe(true);
    const lead = await getLead(id);
    expect(lead?.draft_email_body).toBe('Novější text');
    expect(lead?.draft_email_subject).toBe('Nové');
  });

  test('93c) autosave nezahltí audit — aktivita jen při vzniku konceptu', async () => {
    const id = await seed(`Spec93 C ${stamp}`);
    const t0 = Date.now();
    for (let i = 1; i <= 4; i += 1) {
      await autosave(id, `Předmět ${i}`, `Tělo ${i}`, new Date(t0 + i * 1000));
    }
    const { data: acts } = await (admin() as any)
      .from('sales_lead_activities')
      .select('id').eq('lead_id', id).eq('activity_type', 'draft_edited');
    expect(acts).toHaveLength(1);
    expect((await getLead(id))?.draft_email_body).toBe('Tělo 4');
  });

  test('93d) prázdný koncept lead z Rozpracovaných odebere a nic jiného nesmaže', async () => {
    const id = await seed(`Spec93 D ${stamp}`);
    await autosave(id, 'Předmět D', 'Tělo D', new Date());
    expect((await getLead(id))?.draft_updated_at).not.toBeNull();

    const { data } = await autosave(id, '', '', new Date(Date.now() + 1000));
    expect((data as any)?.success).toBe(true);

    const lead = await getLead(id);
    expect(lead?.draft_updated_at, 'už není Rozpracovaný').toBeNull();
    expect(lead?.draft_email_subject).toBeNull();
    expect(lead?.draft_email_body).toBeNull();
    // Lead ani historie se nesmazaly
    expect(lead?.id).toBe(id);
    expect(lead?.company_name).toBe(`Spec93 D ${stamp}`);
    expect(lead?.status).toBe('novy');
    const { data: acts } = await (admin() as any)
      .from('sales_lead_activities').select('id').eq('lead_id', id);
    expect(acts.length, 'historie zůstává').toBeGreaterThan(0);
  });

  test('93e) anonym autosave zavolat nemůže', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { error } = await (anon as any).rpc('sales_lead_autosave_draft', {
      p_lead_id: '00000000-0000-0000-0000-000000000000',
      p_subject: 'x', p_body: 'y', p_client_updated_at: new Date().toISOString(),
    });
    expect(error, 'anon nesmí mít EXECUTE').not.toBeNull();
  });
});
