/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Schválení navrženého leadu jednou akcí  (spec 92)                        ║
 * ║                                                                            ║
 * ║  `sales_lead_approve_proposed` v JEDNÉ transakci uloží upravená pole       ║
 * ║  (vč. email_verified_by_admin) a přepne stav `navrzeny → novy`.            ║
 * ║  Uvnitř volá existující sales_lead_update_fields + sales_lead_set_status,  ║
 * ║  takže duplicitní kontroly, historie stavu i audit zůstávají beze změny.   ║
 * ║                                                                            ║
 * ║  STAGING-ONLY, self-contained (vlastní throwaway leady + cleanup).         ║
 * ║  Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,                           ║
 * ║       E2E_SUPABASE_SERVICE_ROLE_KEY, E2E_SUPERADMIN_EMAIL/PASSWORD         ║
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

async function seedLead(name: string, status: string, email: string | null, ownerId: string) {
  const { data, error } = await (admin() as any)
    .from('sales_leads')
    .insert({
      company_name: name,
      status,
      contact_email: email,
      source: 'rucne',
      created_by: ownerId,
      email_verified_by_admin: false,
    })
    .select('id')
    .single();
  if (error) throw new Error(`seedLead ${name}: ${error.message}`);
  createdLeadIds.push(data.id as string);
  return data.id as string;
}

async function getLead(id: string) {
  const { data } = await (admin() as any)
    .from('sales_leads')
    .select('id, company_name, status, city, contact_email, email_verified_by_admin, notes')
    .eq('id', id)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

// ── Kontraktní část — běží všude ─────────────────────────────────────────────

test.describe('92 — kontrakt: schválení návrhu jednou akcí', () => {
  const sheet = fs.readFileSync('src/components/admin/sales-leads/SalesLeadDetailSheet.tsx', 'utf8');
  const migration = fs.readFileSync(
    'supabase/migrations/20260721140000_sales_lead_approve_proposed.sql', 'utf8');

  test('UI má jednu hlavní akci a už ne mezikrok „Schválit návrh"', () => {
    expect(sheet).toContain('Schválit a uložit lead');
    expect(sheet).toContain('sales_lead_approve_proposed');
    expect(sheet).not.toContain("'Schválit návrh'");
  });

  test('RPC je transakční, jen pro navrzeny→novy a hlídá oprávnění', () => {
    expect(migration).toContain("has_admin_permission('sales_leads.manage'");
    expect(migration).toContain("v_status <> 'navrzeny'");
    expect(migration).toContain('transition_not_allowed');
    // Znovupoužívá existující RPC — žádné paralelní ukládání.
    expect(migration).toContain('public.sales_lead_update_fields(');
    expect(migration).toContain('public.sales_lead_set_status(');
    // Atomicita: chyba odvolá i uložená pole.
    expect(migration).toContain('EXCEPTION WHEN OTHERS THEN');
    expect(migration).toContain('sales_lead_approve_rollback');
    expect(migration).toContain('REVOKE ALL ON FUNCTION');
  });

  test('odesílání e-mailu dál vyžaduje ověřený e-mail (pravidla beze změny)', () => {
    expect(sheet).toContain('lead.email_verified_by_admin === true');
    expect(sheet).toContain('hasContactEmail');
  });
});

// ── DB část — staging ────────────────────────────────────────────────────────

test.describe.serial('92 — schválení navrženého leadu proti DB', () => {
  test.skip(
    !SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD,
    'Missing staging env — skipping spec 92 DB part',
  );

  let client: SupabaseClient;
  let callerId = '';

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

  const approve = (leadId: string, overrides: Record<string, unknown> = {}) =>
    (client as any).rpc('sales_lead_approve_proposed', {
      p_lead_id: leadId,
      p_company_name: 'Spec92 Firma',
      p_ico: null, p_dic: null, p_website: null, p_industry: null,
      p_city: 'Brno', p_address: null, p_company_size: null,
      p_contact_person: null, p_contact_role: null,
      p_contact_email: null, p_contact_phone: null, p_email_source: null,
      p_email_verified_by_admin: false,
      p_notes: 'Spec92 poznámka',
      p_duplicate_override: false, p_duplicate_override_reason: null,
      ...overrides,
    });

  test('92a) jedním voláním uloží pole a přepne stav na novy', async () => {
    const id = await seedLead(`Spec92 A ${stamp}`, 'navrzeny', null, callerId);

    const { data } = await approve(id, { p_email_verified_by_admin: true });
    expect((data as any)?.success, JSON.stringify(data)).toBe(true);
    expect((data as any)?.new_status).toBe('novy');

    const lead = await getLead(id);
    expect(lead?.status).toBe('novy');
    // Upravená pole se uložila
    expect(lead?.company_name).toBe('Spec92 Firma');
    expect(lead?.city).toBe('Brno');
    expect(lead?.notes).toBe('Spec92 poznámka');
    expect(lead?.email_verified_by_admin).toBe(true);
  });

  test('92b) historie i audit vzniknou právě jednou', async () => {
    const id = await seedLead(`Spec92 B ${stamp}`, 'navrzeny', null, callerId);
    const { data } = await approve(id);
    expect((data as any)?.success).toBe(true);

    const a = admin() as any;
    const { data: history } = await a
      .from('sales_lead_status_history')
      .select('old_status,new_status')
      .eq('lead_id', id);
    expect(history).toHaveLength(1);
    expect(history[0].old_status).toBe('navrzeny');
    expect(history[0].new_status).toBe('novy');

    const { data: acts } = await a
      .from('sales_lead_activities')
      .select('activity_type')
      .eq('lead_id', id)
      .eq('activity_type', 'status_changed');
    expect(acts).toHaveLength(1);
  });

  test('92c) schválit lze i bez ověřeného e-mailu', async () => {
    const id = await seedLead(`Spec92 C ${stamp}`, 'navrzeny', null, callerId);
    const { data } = await approve(id, { p_email_verified_by_admin: false });
    expect((data as any)?.success).toBe(true);

    const lead = await getLead(id);
    expect(lead?.status).toBe('novy');
    expect(lead?.email_verified_by_admin).toBe(false);
  });

  test('92d) ostatní přechody zůstávají beze změny', async () => {
    // Nový → příprava přes původní RPC funguje dál.
    const id = await seedLead(`Spec92 D ${stamp}`, 'novy', null, callerId);
    const { data: setRes } = await (client as any).rpc('sales_lead_set_status', {
      p_lead_id: id, p_new_status: 'priprava', p_reason: null,
    });
    expect((setRes as any)?.success, JSON.stringify(setRes)).toBe(true);
    expect((await getLead(id))?.status).toBe('priprava');

    // Nová RPC umí POUZE navrzeny→novy.
    const { data: approveRes } = await approve(id);
    expect((approveRes as any)?.success).toBe(false);
    expect((approveRes as any)?.error).toBe('transition_not_allowed');
  });

  test('92e) při chybě nevznikne částečně uložený stav', async () => {
    const dupEmail = `spec92-dup-${stamp}@onemil-test.invalid`;
    await seedLead(`Spec92 Existing ${stamp}`, 'novy', dupEmail, callerId);
    const id = await seedLead(`Spec92 E ${stamp}`, 'navrzeny', null, callerId);

    // Duplicitní e-mail bez override → musí selhat
    const { data } = await approve(id, { p_contact_email: dupEmail });
    expect((data as any)?.success).toBe(false);

    // Nic se neuložilo a stav zůstal navrzeny
    const lead = await getLead(id);
    expect(lead?.status, 'stav se nesmí změnit').toBe('navrzeny');
    expect(lead?.company_name, 'pole se nesmí uložit').toBe(`Spec92 E ${stamp}`);
    expect(lead?.city).toBeNull();

    // Ani historie/audit nevznikly
    const a = admin() as any;
    const { data: history } = await a
      .from('sales_lead_status_history').select('id').eq('lead_id', id);
    expect(history).toHaveLength(0);
  });

  test('92f) anonym RPC zavolat nemůže', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { error } = await (anon as any).rpc('sales_lead_approve_proposed', {
      p_lead_id: '00000000-0000-0000-0000-000000000000',
      p_company_name: 'x', p_ico: null, p_dic: null, p_website: null,
      p_industry: null, p_city: null, p_address: null, p_company_size: null,
      p_contact_person: null, p_contact_role: null, p_contact_email: null,
      p_contact_phone: null, p_email_source: null,
      p_email_verified_by_admin: false, p_notes: null,
      p_duplicate_override: false, p_duplicate_override_reason: null,
    });
    expect(error, 'anon nesmí mít EXECUTE').not.toBeNull();
  });
});
