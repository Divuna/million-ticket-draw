/**
 * Spec 169 — Admin → Bannery: sjednocení write RLS na has_admin_permission
 *
 * Řeší potvrzený nález: `banners` a storage bucket `banner-images` měly
 * write RLS postavenou na staré `public.users.role`, zatímco frontend route
 * `/admin/banners` je gatovaná granulárním oprávněním `banners.manage`
 * (`RequirePermission` → `useAdminPermissions().can()` → canonical
 * `user_roles` + `admin_permissions`). Canonical admin s explicitním
 * `banners.manage`, ale starou `users.role='user'`, tak route projde a DB
 * ho zápisem zamítne. `coming_soon_banners` navíc dovolovala zápis KAŽDÉMU
 * adminovi jen podle `user_roles`, bez ohledu na `banners.manage`.
 *
 * `AdminBanners.tsx` a `useHomepageVideoSimple.ts` navíc u několika
 * UPDATE/DELETE/INSERT volání nekontrolovaly počet ovlivněných řádků —
 * RLS-blokovaný zápis (0 řádků, žádná chyba) by nahlásil úspěch.
 *
 * Spec má dvě části:
 *   A) statický kontrakt (běží vždy, bez DB) — migrace + frontend guardy
 *   B) živé chování proti staging DB (opt-in)
 *
 * Scénáře části B (čísla odpovídají zadání):
 *   169-1  superadmin může spravovat bannery
 *   169-2  admin s canonical user_roles='admin' + banners.manage může
 *          spravovat bannery, i když stará users.role='user'
 *   169-3  admin bez banners.manage nemůže zapisovat, i když stará
 *          users.role='admin'
 *   169-4  (totéž jako 169-3 — stará users.role nemá žádný vliv)
 *   169-5  běžný uživatel i anon nemohou zapisovat
 *   169-6  storage gate (`has_admin_permission`) se chová stejně jako
 *          tabulková RLS pro tytéž účty
 *   169-7  coming_soon_banners vyžaduje stejné oprávnění jako banners
 *   169-9  veřejné čtení bannerů i coming_soon_banners zůstává funkční
 *
 * Bod 169-8 (žádný false-success při 0 affected rows) je ověřen staticky
 * v části A — je to vlastnost frontendového kódu, ne DB.
 *
 * Test si zakládá VLASTNÍ uživatele, bannery a admin_permissions řádky
 * a v `afterAll` je uklízí. Nesahá na existující bannery ani uživatele.
 *
 * Required env (část B):
 *   E2E_ADMIN_BANNERS_RLS=1
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
const ENABLED = process.env.E2E_ADMIN_BANNERS_RLS === '1';

const MIGRATION = 'supabase/migrations/20260907190000_admin_banners_has_permission_rls.sql';
const PAGE = 'src/pages/AdminBanners.tsx';
const VIDEO_HOOK = 'src/hooks/useHomepageVideoSimple.ts';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/* ══════════════ A) STATICKÝ KONTRAKT ══════════════ */

test.describe('169 kontrakt — RLS migrace a frontend false-success guardy', () => {
  test('169i migrace nahrazuje users.role za has_admin_permission na obou tabulkách i storage', () => {
    const sql = read(MIGRATION);

    // Jen skutečné SQL příkazy — komentáře popisující STARÝ problém (které
    // legitimně obsahují "FROM users u") se do kontroly nepočítají.
    const executable = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    // Stará vazba na users.role musí být pryč z write policies.
    expect(sql).toContain('DROP POLICY IF EXISTS "Admin full access to banners" ON public.banners');
    expect(sql).toContain('DROP POLICY IF EXISTS "Admins can manage coming soon banners" ON public.coming_soon_banners');
    expect(sql).toContain('DROP POLICY IF EXISTS "Admin can upload banner images" ON storage.objects');
    expect(sql).toContain('DROP POLICY IF EXISTS "Admin can update banner images" ON storage.objects');
    expect(sql).toContain('DROP POLICY IF EXISTS "Admin can delete banner images" ON storage.objects');

    // Nová vazba: přesně has_admin_permission('banners.manage'), nikdy is_admin()/users.role.
    const hasPermCount = (executable.match(/public\.has_admin_permission\('banners\.manage'\)/g) || []).length;
    expect(hasPermCount).toBeGreaterThanOrEqual(6); // banners USING+CHECK, csb USING+CHECK, storage insert/update/delete (update má USING i CHECK)
    expect(executable).not.toMatch(/FROM\s+users\s+u/i);
    expect(executable).not.toContain('u.role');
    expect(executable).not.toContain('is_admin()');

    // Nikdy obecný authenticated přístup bez guardu, nikdy anon na write.
    expect(sql).not.toMatch(/FOR ALL TO authenticated\s*;/);
    expect(sql).not.toContain('TO anon');

    // Veřejné čtení se nesmí měnit ani zmiňovat jako DROP.
    expect(sql).not.toContain('DROP POLICY IF EXISTS "Public read banners"');
    expect(sql).not.toContain('DROP POLICY IF EXISTS "Anyone can view coming soon banners"');
    expect(sql).not.toContain('DROP POLICY IF EXISTS "Public can view banner images"');

    // Mimo rozsah zůstává nedotčeno (komentáře smí vysvětlit proč, ale
    // žádný skutečný příkaz se těch objektů nesmí dotknout).
    expect(executable).not.toContain('bonus_prizes');
    expect(executable).not.toContain('voucher-images');
    expect(executable).not.toMatch(/DROP TABLE|TRUNCATE|DISABLE ROW LEVEL SECURITY/i);
  });

  test('169j AdminBanners.tsx: UPDATE/DELETE/INSERT s .select() a kontrolou počtu řádků', () => {
    const page = read(PAGE);

    const writeBlocks = [
      { name: 'handleComingSoonTitleSave', marker: 'const handleComingSoonTitleSave' },
      { name: 'handleComingSoonDescSave', marker: 'const handleComingSoonDescSave' },
      { name: 'handleComingSoonUpload', marker: 'const handleComingSoonUpload' },
      { name: 'handleDeleteBanner', marker: 'const handleDeleteBanner' },
      { name: 'toggleBannerActive', marker: 'const toggleBannerActive' },
      { name: 'handleUpdateBanner', marker: 'const handleUpdateBanner' },
    ];

    for (const { name, marker } of writeBlocks) {
      const start = page.indexOf(marker);
      expect(start, `${name} not found`).toBeGreaterThan(-1);
      const block = page.slice(start, start + 1500);
      expect(block, `${name}: missing .select("id")`).toContain('.select(\'id\')');
      expect(
        block,
        `${name}: missing affected-rows guard`,
      ).toMatch(/error \|\| !data \|\| data\.length === 0/);
    }
  });

  test('169k useHomepageVideoSimple.ts: update/insert cesty ověřují skutečně změněný řádek', () => {
    const hook = read(VIDEO_HOOK);

    const updateStart = hook.indexOf('// Update existing banner');
    expect(updateStart).toBeGreaterThan(-1);
    const updateBlock = hook.slice(updateStart, updateStart + 700);
    expect(updateBlock).toContain(".select('id')");
    expect(updateBlock).toMatch(/updateError \|\| !updatedRows \|\| updatedRows\.length === 0/);

    const insertStart = hook.indexOf('// Create new banner for homepage video');
    expect(insertStart).toBeGreaterThan(-1);
    const insertBlock = hook.slice(insertStart, insertStart + 700);
    expect(insertBlock).toContain(".select('id')");
    expect(insertBlock).toMatch(/insertError \|\| !insertedRows \|\| insertedRows\.length === 0/);
  });

  test('169l handleCreateBanner zůstal na bezpečném .select().single() vzoru', () => {
    const page = read(PAGE);
    const start = page.indexOf('const handleCreateBanner');
    const block = page.slice(start, start + 2000);
    expect(block).toContain('.select()');
    expect(block).toContain('.single()');
  });
});

/* ══════════════ B) ŽIVÉ CHOVÁNÍ PROTI STAGING DB ══════════════ */

function skipIfNotEnabled() {
  if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SUPABASE_ANON || !SERVICE_ROLE) {
    test.skip(true, 'staging-only opt-in — vyžaduje E2E_ADMIN_BANNERS_RLS=1 a staging env');
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
const createdBannerIds: string[] = [];
const createdCsbIds: string[] = [];
const uniq = () => Date.now() + '-' + Math.random().toString(36).slice(2, 8);

async function seedUser(
  db: SupabaseClient,
  opts: { role?: 'admin' | 'superadmin'; legacyUsersRole?: string; permission?: string },
) {
  const email = 'spec169-' + (opts.role ?? 'plain') + '-' + uniq() + '@onemil.test';
  const password = 'Spec169-' + Math.random().toString(36).slice(2, 10) + '!';
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error('createUser failed: ' + error?.message);
  const userId = data.user.id;
  createdUserIds.push(userId);

  if (opts.legacyUsersRole) {
    // Simuluje přesně produkční drift: stará public.users.role != canonical role.
    await db.from('users').update({ role: opts.legacyUsersRole }).eq('id', userId);
  }
  if (opts.role) {
    const { error: roleErr } = await db.from('user_roles').insert({ user_id: userId, role: opts.role });
    if (roleErr) throw new Error('user_roles seed failed: ' + roleErr.message);
  }
  if (opts.permission) {
    const { error: permErr } = await db
      .from('admin_permissions')
      .insert({ user_id: userId, permission_key: opts.permission });
    if (permErr) throw new Error('admin_permissions seed failed: ' + permErr.message);
  }
  return { id: userId, email, password };
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error('signIn failed: ' + error.message);
  return client;
}

test.describe('169 živé chování — banners / coming_soon_banners RLS', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => skipIfNotEnabled());

  test.afterAll(async () => {
    if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) return;
    const db = admin();
    if (createdBannerIds.length) await db.from('banners').delete().in('id', createdBannerIds);
    if (createdCsbIds.length) await db.from('coming_soon_banners').delete().in('id', createdCsbIds);
    for (const id of createdUserIds) {
      await db.from('admin_permissions').delete().eq('user_id', id);
      await db.from('user_roles').delete().eq('user_id', id);
      await db.auth.admin.deleteUser(id);
    }
  });

  test('169-1 superadmin může spravovat bannery', async () => {
    const db = admin();
    const superadmin = await seedUser(db, { role: 'superadmin' });
    const client = await signIn(superadmin.email, superadmin.password);

    const { data: created, error: insertError } = await client
      .from('banners')
      .insert({
        title: 'E2E Spec169 Superadmin ' + uniq(),
        image_url: 'https://placehold.co/1x1',
        active: true,
        target_page: 'homepage_customer',
      })
      .select('id')
      .single();
    expect(insertError).toBeNull();
    createdBannerIds.push(created!.id as string);

    const { data: updated, error: updateError } = await client
      .from('banners')
      .update({ title: 'E2E Spec169 Superadmin Updated' })
      .eq('id', created!.id)
      .select('id');
    expect(updateError).toBeNull();
    expect(updated).toHaveLength(1);
  });

  test('169-2 admin s canonical user_roles + banners.manage může spravovat, i když stará users.role="user"', async () => {
    const db = admin();
    const adminWithPerm = await seedUser(db, {
      role: 'admin',
      legacyUsersRole: 'user', // přesně produkční drift
      permission: 'banners.manage',
    });
    const client = await signIn(adminWithPerm.email, adminWithPerm.password);

    const { data: created, error: insertError } = await client
      .from('banners')
      .insert({
        title: 'E2E Spec169 AdminWithPerm ' + uniq(),
        image_url: 'https://placehold.co/1x1',
        active: true,
        target_page: 'homepage_customer',
      })
      .select('id')
      .single();
    expect(insertError).toBeNull();
    const bannerId = created!.id as string;
    createdBannerIds.push(bannerId);

    const { data: updated, error: updateError } = await client
      .from('banners')
      .update({ active: false })
      .eq('id', bannerId)
      .select('id');
    expect(updateError).toBeNull();
    expect(updated).toHaveLength(1);

    const { data: deleted, error: deleteError } = await client
      .from('banners')
      .delete()
      .eq('id', bannerId)
      .select('id');
    expect(deleteError).toBeNull();
    expect(deleted).toHaveLength(1);
    createdBannerIds.splice(createdBannerIds.indexOf(bannerId), 1);
  });

  test('169-3/169-4 admin bez banners.manage nemůže zapisovat, i když stará users.role="admin"', async () => {
    const db = admin();
    const adminNoPerm = await seedUser(db, {
      role: 'admin',
      legacyUsersRole: 'admin', // stará hodnota by dřív stačila — teď nesmí
    });
    const client = await signIn(adminNoPerm.email, adminNoPerm.password);

    const { error: insertError } = await client.from('banners').insert({
      title: 'SHOULD NOT EXIST',
      image_url: 'https://placehold.co/1x1',
      active: true,
      target_page: 'homepage_customer',
    });
    expect(insertError).not.toBeNull();

    const { data: updated, error: updateError } = await client
      .from('banners')
      .update({ title: 'HACKED' })
      .eq('id', createdBannerIds[0] ?? '00000000-0000-0000-0000-000000000000')
      .select('id');
    expect(updateError).toBeNull();
    expect(updated).toHaveLength(0);
  });

  test('169-5 běžný uživatel i anon nemohou zapisovat', async () => {
    const db = admin();
    const plain = await seedUser(db, {});
    const plainClient = await signIn(plain.email, plain.password);

    const { error: plainInsertError } = await plainClient.from('banners').insert({
      title: 'SHOULD NOT EXIST (plain)',
      image_url: 'https://placehold.co/1x1',
      active: true,
      target_page: 'homepage_customer',
    });
    expect(plainInsertError).not.toBeNull();

    const anon = anonClient();
    const { error: anonInsertError } = await anon.from('banners').insert({
      title: 'SHOULD NOT EXIST (anon)',
      image_url: 'https://placehold.co/1x1',
      active: true,
      target_page: 'homepage_customer',
    });
    expect(anonInsertError).not.toBeNull();
  });

  test('169-6 storage gate (has_admin_permission) souhlasí s tabulkovou RLS pro tytéž účty', async () => {
    const db = admin();
    const adminWithPerm = await seedUser(db, {
      role: 'admin',
      legacyUsersRole: 'user',
      permission: 'banners.manage',
    });
    const adminNoPerm = await seedUser(db, { role: 'admin', legacyUsersRole: 'admin' });

    const withPermClient = await signIn(adminWithPerm.email, adminWithPerm.password);
    const { data: gateTrue } = await withPermClient.rpc('has_admin_permission', {
      check_key: 'banners.manage',
    });
    expect(gateTrue).toBe(true);

    const noPermClient = await signIn(adminNoPerm.email, adminNoPerm.password);
    const { data: gateFalse } = await noPermClient.rpc('has_admin_permission', {
      check_key: 'banners.manage',
    });
    expect(gateFalse).toBe(false);
  });

  test('169-7 coming_soon_banners vyžaduje stejné oprávnění jako banners', async () => {
    const db = admin();
    const adminWithPerm = await seedUser(db, {
      role: 'admin',
      legacyUsersRole: 'user',
      permission: 'banners.manage',
    });
    const adminNoPerm = await seedUser(db, { role: 'admin', legacyUsersRole: 'admin' });

    const withPermClient = await signIn(adminWithPerm.email, adminWithPerm.password);
    const { data: created, error: insertError } = await withPermClient
      .from('coming_soon_banners')
      .insert({ image_url: 'https://placehold.co/1x1', title: 'E2E Spec169 CSB ' + uniq() })
      .select('id')
      .single();
    expect(insertError).toBeNull();
    createdCsbIds.push(created!.id as string);

    const noPermClient = await signIn(adminNoPerm.email, adminNoPerm.password);
    const { data: updated, error: updateError } = await noPermClient
      .from('coming_soon_banners')
      .update({ title: 'HACKED' })
      .eq('id', created!.id)
      .select('id');
    expect(updateError).toBeNull();
    expect(updated).toHaveLength(0);
  });

  test('169-9 veřejné čtení bannerů i coming_soon_banners zůstává funkční', async () => {
    const db = admin();
    const { data: banner } = await db
      .from('banners')
      .insert({
        title: 'E2E Spec169 Public Read ' + uniq(),
        image_url: 'https://placehold.co/1x1',
        active: true,
        target_page: 'homepage_customer',
      })
      .select('id')
      .single();
    createdBannerIds.push(banner!.id as string);

    const { data: csb } = await db
      .from('coming_soon_banners')
      .insert({ image_url: 'https://placehold.co/1x1', title: 'E2E Spec169 Public CSB ' + uniq() })
      .select('id')
      .single();
    createdCsbIds.push(csb!.id as string);

    const anon = anonClient();
    const { data: bannerRead, error: bannerReadError } = await anon
      .from('banners')
      .select('id')
      .eq('id', banner!.id);
    expect(bannerReadError).toBeNull();
    expect(bannerRead).toHaveLength(1);

    const { data: csbRead, error: csbReadError } = await anon
      .from('coming_soon_banners')
      .select('id')
      .eq('id', csb!.id);
    expect(csbReadError).toBeNull();
    expect(csbRead).toHaveLength(1);
  });
});
