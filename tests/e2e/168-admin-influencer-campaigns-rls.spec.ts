/**
 * Spec 168 — Admin → Affiliate kampaně: chybějící RLS + falešné úspěchy
 *
 * Řeší potvrzený nález: `influencer_campaigns` a `influencer_campaign_partners`
 * měly RLS zapnuté, ale ŽÁDNÉ policies. `authenticated` měl přitom plný
 * tabulkový grant, takže PostgREST SELECT/UPDATE/DELETE tiše uspěly s
 * 0 řádky (žádná chyba) a INSERT vždy tvrdě selhal (`42501`). Stránka
 * `AdminInfluencerCampaigns.tsx` (dostupná jen přes `RequireSuperadmin`) byla
 * pro superadmina v prohlížeči funkčně nefunkční a UPDATE/DELETE/přiřazení
 * navíc mohly hlásit falešný úspěch při 0 změněných řádcích.
 *
 * Spec má dvě části:
 *   A) statický kontrakt (běží vždy, bez DB) — migrace + frontend guardy
 *   B) živé chování proti staging DB (opt-in)
 *
 * Scénáře části B:
 *   168a  superadmin SELECT kampaně                     → vidí vlastní seed
 *   168b  superadmin INSERT kampaně                      → povoleno
 *   168c  superadmin UPDATE kampaně                      → povoleno, ověřeno
 *   168d  superadmin DELETE kampaně                      → povoleno, ověřeno
 *   168e  superadmin SELECT/INSERT přiřazení              → povoleno
 *   168f  superadmin změna přiřazení (odebrání všech)     → skutečně smazáno
 *   168g  běžný authenticated uživatel                    → žádný přístup
 *   168h  anon                                            → žádný přístup
 *
 * Test si zakládá VLASTNÍ uživatele, kampaně a partnery a v `afterAll` je
 * uklízí. Nesahá na existující kampaně, partnery ani uživatele.
 *
 * Required env (část B):
 *   E2E_INFLUENCER_CAMPAIGNS_RLS=1
 *   VITE_SUPABASE_URL      - musí obsahovat staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 */
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const ENABLED = process.env.E2E_INFLUENCER_CAMPAIGNS_RLS === '1';

const MIGRATION = 'supabase/migrations/20260907180000_influencer_campaigns_superadmin_rls.sql';
const PAGE = 'src/pages/AdminInfluencerCampaigns.tsx';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/* ══════════════ A) STATICKÝ KONTRAKT ══════════════ */

test.describe('168 kontrakt — RLS policy migrace a frontend guardy', () => {
  test('168i migrace přidává superadmin-only policy na obě tabulky, nic jiného', () => {
    const sql = read(MIGRATION);

    expect(sql).toContain('CREATE POLICY influencer_campaigns_superadmin_all ON public.influencer_campaigns');
    expect(sql).toContain('CREATE POLICY influencer_campaign_partners_superadmin_all ON public.influencer_campaign_partners');

    // Guard je is_superadmin(), ne is_admin() — frontend route je RequireSuperadmin,
    // is_admin() by oprávnění rozšířil nad rámec dnešního UI.
    expect(sql).toContain('USING (public.is_superadmin())');
    expect(sql).toContain('WITH CHECK (public.is_superadmin())');
    // is_admin() smí být zmíněné jen v komentáři vysvětlujícím, proč se
    // nepoužil (rozšířil by oprávnění nad rámec RequireSuperadmin) — nikdy
    // ve skutečné USING/WITH CHECK klauzuli.
    expect(sql).not.toMatch(/(USING|WITH CHECK)\s*\(public\.is_admin\(\)\)/);

    // Policy je scoped na authenticated, ne na obecný přístup.
    expect(sql).toMatch(/FOR ALL TO authenticated/g);
    expect(sql).not.toContain('TO anon');
    expect(sql).not.toContain('TO public');

    // Migrace nesmí měnit data ani tabulky, jen RLS.
    expect(sql).not.toMatch(/CREATE TABLE/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/^\s*DELETE FROM/im);
    expect(sql).not.toMatch(/^\s*TRUNCATE/im);
    expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });

  test('168j UPDATE kampaně ověřuje skutečně změněný řádek', () => {
    const page = read(PAGE);

    const updateBlockStart = page.indexOf('if (editingId) {');
    expect(updateBlockStart).toBeGreaterThan(-1);
    const updateBlock = page.slice(updateBlockStart, updateBlockStart + 500);

    expect(updateBlock).toContain('.update(payload)');
    expect(updateBlock).toContain('.select("id")');
    expect(updateBlock).toMatch(/error \|\| !data \|\| data\.length === 0/);
  });

  test('168k DELETE kampaně ověřuje skutečně smazaný řádek', () => {
    const page = read(PAGE);

    const deleteBlockStart = page.indexOf('const handleDelete');
    expect(deleteBlockStart).toBeGreaterThan(-1);
    const deleteBlock = page.slice(deleteBlockStart, deleteBlockStart + 1200);

    expect(deleteBlock).toContain('.delete()');
    expect(deleteBlock).toContain('.select("id")');
    expect(deleteBlock).toMatch(/error \|\| !data \|\| data\.length === 0/);
  });

  test('168l změna přiřazení potvrzuje výsledný stav u serveru, ne jen "žádná chyba"', () => {
    const page = read(PAGE);

    const saveBlockStart = page.indexOf('const saveAssignments');
    expect(saveBlockStart).toBeGreaterThan(-1);
    const saveBlock = page.slice(saveBlockStart, saveBlockStart + 2500);

    // Musí znovu přečíst výsledný stav a porovnat ho s cílovou množinou —
    // to je jediný způsob, jak odhalit tiše zablokovaný DELETE (0 řádků,
    // žádná chyba), zvlášť když se maže úplně poslední přiřazení (žádný
    // následný INSERT by tu chybu nezachytil).
    expect(saveBlock).toContain('.select("influencer_partner_id")');
    expect(saveBlock).toContain('verifiedIds');
    expect(saveBlock).toContain('matchesTarget');
  });

  test('168m chyba čtení kampaní se nezobrazí jako "žádné kampaně"', () => {
    const page = read(PAGE);

    expect(page).toContain('loadError');
    expect(page).toContain('setLoadError(true)');

    // Prázdný-stav text se smí zobrazit jen když NENÍ loadError.
    const emptyStateIndex = page.indexOf('Žádné kampaně. Vytvořte první kampaň.');
    expect(emptyStateIndex).toBeGreaterThan(-1);
    const beforeEmptyState = page.slice(0, emptyStateIndex);
    expect(beforeEmptyState).toMatch(/loadError \? \(/);
  });
});

/* ══════════════ B) ŽIVÉ CHOVÁNÍ PROTI STAGING DB ══════════════ */

function skipIfNotEnabled() {
  if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SUPABASE_ANON || !SERVICE_ROLE) {
    test.skip(true, 'staging-only opt-in — vyžaduje E2E_INFLUENCER_CAMPAIGNS_RLS=1 a staging env');
  }
}

const admin = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const anonClient = (): SupabaseClient =>
  createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const createdUserIds: string[] = [];
const createdPartnerIds: string[] = [];
const createdCampaignIds: string[] = [];
const uniq = () => Date.now() + '-' + Math.random().toString(36).slice(2, 8);

async function seedUser(db: SupabaseClient, role?: 'superadmin') {
  const email = 'spec168-' + (role ?? 'user') + '-' + uniq() + '@onemil.test';
  const password = 'Spec168-' + Math.random().toString(36).slice(2, 10) + '!';
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error('createUser failed: ' + error?.message);
  createdUserIds.push(data.user.id);
  if (role) {
    const { error: roleErr } = await db.from('user_roles').insert({ user_id: data.user.id, role });
    if (roleErr) throw new Error('user_roles seed failed: ' + roleErr.message);
  }
  return { id: data.user.id, email, password };
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error('signIn failed: ' + error.message);
  return client;
}

async function seedInfluencerPartner(db: SupabaseClient) {
  const { data, error } = await db
    .from('partners')
    .insert({
      name: 'E2E Spec168 Influencer ' + uniq(),
      logo_url: 'https://placehold.co/200x200/1D2128/E7EBF0?text=E2E168',
      website_url: 'https://example.test/spec168',
      notes: 'influencer',
      status: 'approved',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error('partner seed failed: ' + error?.message);
  createdPartnerIds.push(data.id as string);
  return data.id as string;
}

test.describe('168 živé chování — influencer_campaigns / influencer_campaign_partners RLS', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => skipIfNotEnabled());

  test.afterAll(async () => {
    if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) return;
    const db = admin();
    if (createdCampaignIds.length) {
      await db.from('influencer_campaign_partners').delete().in('campaign_id', createdCampaignIds);
      await db.from('influencer_campaigns').delete().in('id', createdCampaignIds);
    }
    if (createdPartnerIds.length) {
      await db.from('partners').delete().in('id', createdPartnerIds);
    }
    for (const id of createdUserIds) {
      await db.from('user_roles').delete().eq('user_id', id);
      await db.auth.admin.deleteUser(id);
    }
  });

  test('168a-168d superadmin: SELECT, INSERT, UPDATE, DELETE kampaně', async () => {
    const db = admin();
    const superadmin = await seedUser(db, 'superadmin');
    const client = await signIn(superadmin.email, superadmin.password);

    // 168b INSERT
    const { data: created, error: insertError } = await client
      .from('influencer_campaigns')
      .insert({
        name: 'E2E Spec168 Campaign ' + uniq(),
        bonus_czk_per_new_user: 100,
        bonus_mc_for_user: 5,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        active: true,
      })
      .select('id, name')
      .single();

    expect(insertError).toBeNull();
    expect(created?.id).toBeTruthy();
    const campaignId = created!.id as string;
    createdCampaignIds.push(campaignId);

    // 168a SELECT
    const { data: selected, error: selectError } = await client
      .from('influencer_campaigns')
      .select('id')
      .eq('id', campaignId);
    expect(selectError).toBeNull();
    expect(selected).toHaveLength(1);

    // 168c UPDATE
    const { data: updated, error: updateError } = await client
      .from('influencer_campaigns')
      .update({ name: 'E2E Spec168 Campaign Updated' })
      .eq('id', campaignId)
      .select('id, name');
    expect(updateError).toBeNull();
    expect(updated).toHaveLength(1);
    expect(updated?.[0].name).toBe('E2E Spec168 Campaign Updated');

    // 168d DELETE
    const { data: deleted, error: deleteError } = await client
      .from('influencer_campaigns')
      .delete()
      .eq('id', campaignId)
      .select('id');
    expect(deleteError).toBeNull();
    expect(deleted).toHaveLength(1);

    // Skutečně pryč.
    const { data: afterDelete } = await db.from('influencer_campaigns').select('id').eq('id', campaignId);
    expect(afterDelete).toHaveLength(0);
    createdCampaignIds.splice(createdCampaignIds.indexOf(campaignId), 1);
  });

  test('168e-168f superadmin: přiřazení influencerů, včetně odebrání všech', async () => {
    const db = admin();
    const superadmin = await seedUser(db, 'superadmin');
    const client = await signIn(superadmin.email, superadmin.password);
    const partnerId = await seedInfluencerPartner(db);

    const { data: campaign, error: campaignError } = await client
      .from('influencer_campaigns')
      .insert({
        name: 'E2E Spec168 Assign Campaign ' + uniq(),
        bonus_czk_per_new_user: 100,
        bonus_mc_for_user: 5,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        active: true,
      })
      .select('id')
      .single();
    expect(campaignError).toBeNull();
    const campaignId = campaign!.id as string;
    createdCampaignIds.push(campaignId);

    // 168e INSERT přiřazení
    const { error: assignError } = await client
      .from('influencer_campaign_partners')
      .insert({ campaign_id: campaignId, influencer_partner_id: partnerId });
    expect(assignError).toBeNull();

    // 168e SELECT přiřazení
    const { data: assignments, error: readAssignError } = await client
      .from('influencer_campaign_partners')
      .select('influencer_partner_id')
      .eq('campaign_id', campaignId);
    expect(readAssignError).toBeNull();
    expect(assignments).toHaveLength(1);
    expect(assignments?.[0].influencer_partner_id).toBe(partnerId);

    // 168f změna přiřazení: odebrání VŠECH (přesně scénář z auditu, kde
    // frontend dřív hlásil úspěch, aniž by DELETE cokoliv skutečně smazal).
    const { error: deleteAssignError } = await client
      .from('influencer_campaign_partners')
      .delete()
      .eq('campaign_id', campaignId);
    expect(deleteAssignError).toBeNull();

    const { data: afterUnassign } = await db
      .from('influencer_campaign_partners')
      .select('influencer_partner_id')
      .eq('campaign_id', campaignId);
    expect(afterUnassign).toHaveLength(0);
  });

  test('168g běžný authenticated uživatel nemá k tabulkám žádný přístup', async () => {
    const db = admin();
    const plain = await seedUser(db);
    const superadmin = await seedUser(db, 'superadmin');
    const superClient = await signIn(superadmin.email, superadmin.password);

    const { data: campaign } = await superClient
      .from('influencer_campaigns')
      .insert({
        name: 'E2E Spec168 Isolation Campaign ' + uniq(),
        bonus_czk_per_new_user: 100,
        bonus_mc_for_user: 5,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        active: true,
      })
      .select('id')
      .single();
    const campaignId = campaign!.id as string;
    createdCampaignIds.push(campaignId);

    const plainClient = await signIn(plain.email, plain.password);

    // SELECT: 0 řádků, žádná chyba (RLS deny, ne grant deny).
    const { data: selected, error: selectError } = await plainClient
      .from('influencer_campaigns')
      .select('id')
      .eq('id', campaignId);
    expect(selectError).toBeNull();
    expect(selected).toHaveLength(0);

    // UPDATE: 0 řádků, žádná chyba — a kampaň zůstává nezměněná.
    const { data: updated, error: updateError } = await plainClient
      .from('influencer_campaigns')
      .update({ name: 'HACKED' })
      .eq('id', campaignId)
      .select('id');
    expect(updateError).toBeNull();
    expect(updated).toHaveLength(0);

    const { data: stillOriginal } = await db
      .from('influencer_campaigns')
      .select('name')
      .eq('id', campaignId)
      .single();
    expect(stillOriginal?.name).not.toBe('HACKED');

    // INSERT: reálná RLS chyba.
    const { error: insertError } = await plainClient.from('influencer_campaigns').insert({
      name: 'SHOULD NOT EXIST',
      bonus_czk_per_new_user: 1,
      bonus_mc_for_user: 1,
      starts_at: new Date().toISOString(),
      ends_at: new Date().toISOString(),
      active: true,
    });
    expect(insertError).not.toBeNull();

    // Přiřazení: stejná izolace.
    const { data: assignSelect, error: assignSelectError } = await plainClient
      .from('influencer_campaign_partners')
      .select('influencer_partner_id')
      .eq('campaign_id', campaignId);
    expect(assignSelectError).toBeNull();
    expect(assignSelect).toHaveLength(0);
  });

  test('168h anon nemá k tabulkám žádný přístup', async () => {
    const db = admin();
    const superadmin = await seedUser(db, 'superadmin');
    const superClient = await signIn(superadmin.email, superadmin.password);

    const { data: campaign } = await superClient
      .from('influencer_campaigns')
      .insert({
        name: 'E2E Spec168 Anon Campaign ' + uniq(),
        bonus_czk_per_new_user: 100,
        bonus_mc_for_user: 5,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        active: true,
      })
      .select('id')
      .single();
    const campaignId = campaign!.id as string;
    createdCampaignIds.push(campaignId);

    const anon = anonClient();
    const { data: selected, error: selectError } = await anon
      .from('influencer_campaigns')
      .select('id')
      .eq('id', campaignId);
    expect(selectError).toBeNull();
    expect(selected).toHaveLength(0);

    const { error: insertError } = await anon.from('influencer_campaigns').insert({
      name: 'SHOULD NOT EXIST (anon)',
      bonus_czk_per_new_user: 1,
      bonus_mc_for_user: 1,
      starts_at: new Date().toISOString(),
      ends_at: new Date().toISOString(),
      active: true,
    });
    expect(insertError).not.toBeNull();
  });
});
