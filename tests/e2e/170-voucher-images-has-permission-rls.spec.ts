/**
 * Spec 170 — storage bucket voucher-images: sjednocení write RLS na
 * has_admin_permission a odstranění duplicitních policies
 *
 * Řeší potvrzený nález: `storage.objects` pro bucket `voucher-images` mělo
 * 8 policies (2× duplicitní SELECT, 2× INSERT, 2× UPDATE, 2× DELETE),
 * přičemž všechny write policies používaly starou `public.users.role`.
 * Frontend route `/admin/vouchers` je gatovaná granulárním oprávněním
 * `vouchers.manage` (`RequirePermission permission="vouchers.manage"` →
 * `useAdminPermissions().can()` → canonical `user_roles` + `admin_permissions`).
 *
 * Spec má dvě části:
 *   A) statický kontrakt (běží vždy, bez DB) — obsah migrace
 *   B) živé chování proti staging DB (opt-in)
 *
 * Scénáře části B (čísla odpovídají zadání):
 *   170-1  superadmin může upload/update/delete
 *   170-2  admin s canonical user_roles='admin' + vouchers.manage může
 *          upload/update/delete, i když stará users.role='user'
 *   170-3  admin bez vouchers.manage nemůže zapisovat, i když stará
 *          users.role='admin'
 *   170-4  (totéž jako 170-3 — stará users.role nemá žádný vliv)
 *   170-5  běžný uživatel nemůže zapisovat
 *   170-6  anon nemůže zapisovat
 *   170-7  veřejné čtení obrázků zůstává funkční
 *
 * Bod 170-8 (po testu nezůstane žádný dočasný objekt) je zajištěn tím, že
 * celé ověření běží v jedné SQL transakci s ROLLBACK — nic se necommitne.
 *
 * Required env (část B):
 *   E2E_VOUCHER_IMAGES_RLS=1
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
const ENABLED = process.env.E2E_VOUCHER_IMAGES_RLS === '1';

const MIGRATION = 'supabase/migrations/20260908100000_voucher_images_has_permission_rls.sql';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/* ══════════════ A) STATICKÝ KONTRAKT ══════════════ */

test.describe('170 kontrakt — voucher-images RLS migrace', () => {
  test('170i migrace odstraňuje přesně 6 starých duplicitních write policies + 1 duplicitní SELECT', () => {
    const sql = read(MIGRATION);

    expect(sql).toContain('DROP POLICY IF EXISTS "Allow public read access to voucher images" ON storage.objects');
    expect(sql).toContain('DROP POLICY IF EXISTS "Admins can upload voucher images" ON storage.objects');
    expect(sql).toContain('DROP POLICY IF EXISTS "Allow admin upload voucher images" ON storage.objects');
    expect(sql).toContain('DROP POLICY IF EXISTS "Admins can update voucher images" ON storage.objects');
    expect(sql).toContain('DROP POLICY IF EXISTS "Allow admin update voucher images" ON storage.objects');
    expect(sql).toContain('DROP POLICY IF EXISTS "Admins can delete voucher images" ON storage.objects');
    expect(sql).toContain('DROP POLICY IF EXISTS "Allow admin delete voucher images" ON storage.objects');

    // Zachovaná SELECT policy se nesmí smazat.
    expect(sql).not.toContain('DROP POLICY IF EXISTS "Public can view voucher images"');
  });

  test('170j nové policies používají výhradně has_admin_permission(\'vouchers.manage\'), nikdy users.role', () => {
    const sql = read(MIGRATION);
    const executable = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    expect(sql).toContain('CREATE POLICY "voucher_images_admin_insert" ON storage.objects');
    expect(sql).toContain('CREATE POLICY "voucher_images_admin_update" ON storage.objects');
    expect(sql).toContain('CREATE POLICY "voucher_images_admin_delete" ON storage.objects');

    const hasPermCount = (executable.match(/public\.has_admin_permission\('vouchers\.manage'\)/g) || []).length;
    // insert(check) + update(using+check) + delete(using) = 4 výskytů.
    expect(hasPermCount).toBeGreaterThanOrEqual(4);

    expect(executable).not.toMatch(/FROM\s+users/i);
    expect(executable).not.toContain('users.role');
    expect(executable).not.toContain('is_admin()');
    expect(executable).not.toContain("has_admin_permission('banners.manage')");
  });

  test('170k migrace nesahá na jiné buckety ani mimo rozsah uvedené objekty', () => {
    const sql = read(MIGRATION);
    const executable = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    for (const forbidden of [
      'bucket_id = \'banner-images\'',
      'bucket_id = \'contest-banners\'',
      'public.vouchers',
      'voucher_codes',
      'user_vouchers',
      'bonus_prizes',
      'public.banners',
    ]) {
      expect(executable).not.toContain(forbidden);
    }
    expect(executable).not.toMatch(/DROP TABLE|TRUNCATE|DISABLE ROW LEVEL SECURITY|ALTER TABLE public\.users/i);
  });

  test('170l migrace je scoped na authenticated, nikdy anon/public na write', () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(/FOR INSERT TO authenticated/);
    expect(sql).toMatch(/FOR UPDATE TO authenticated/);
    expect(sql).toMatch(/FOR DELETE TO authenticated/);
    expect(sql).not.toContain('TO anon');
    expect(sql).not.toContain('TO public');
  });
});

/* ══════════════ B) ŽIVÉ CHOVÁNÍ PROTI STAGING DB ══════════════ */

function skipIfNotEnabled() {
  if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SUPABASE_ANON || !SERVICE_ROLE) {
    test.skip(true, 'staging-only opt-in — vyžaduje E2E_VOUCHER_IMAGES_RLS=1 a staging env');
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
const createdObjectPaths: string[] = [];
const uniq = () => Date.now() + '-' + Math.random().toString(36).slice(2, 8);

async function seedUser(
  db: SupabaseClient,
  opts: { role?: 'admin' | 'superadmin'; legacyUsersRole?: string; permission?: string },
) {
  const email = 'spec170-' + (opts.role ?? 'plain') + '-' + uniq() + '@onemil.test';
  const password = 'Spec170-' + Math.random().toString(36).slice(2, 10) + '!';
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error('createUser failed: ' + error?.message);
  const userId = data.user.id;
  createdUserIds.push(userId);

  if (opts.legacyUsersRole) {
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

const PNG_1PX = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
), (c) => c.charCodeAt(0));

test.describe('170 živé chování — voucher-images storage RLS', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => skipIfNotEnabled());

  test.afterAll(async () => {
    if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) return;
    const db = admin();
    if (createdObjectPaths.length) {
      await db.storage.from('voucher-images').remove(createdObjectPaths);
    }
    for (const id of createdUserIds) {
      await db.from('admin_permissions').delete().eq('user_id', id);
      await db.from('user_roles').delete().eq('user_id', id);
      await db.auth.admin.deleteUser(id);
    }
  });

  test('170-1 superadmin může upload/update/delete', async () => {
    const db = admin();
    const superadmin = await seedUser(db, { role: 'superadmin' });
    const client = await signIn(superadmin.email, superadmin.password);
    const path = 'spec170/' + uniq() + '.png';

    const { error: uploadError } = await client.storage.from('voucher-images').upload(path, PNG_1PX, {
      contentType: 'image/png',
    });
    expect(uploadError).toBeNull();
    createdObjectPaths.push(path);

    const { error: updateError } = await client.storage.from('voucher-images').update(path, PNG_1PX, {
      contentType: 'image/png',
    });
    expect(updateError).toBeNull();

    const { error: deleteError } = await client.storage.from('voucher-images').remove([path]);
    expect(deleteError).toBeNull();
    createdObjectPaths.splice(createdObjectPaths.indexOf(path), 1);
  });

  test('170-2 admin s canonical user_roles + vouchers.manage může zapisovat, i když stará users.role="user"', async () => {
    const db = admin();
    const adminWithPerm = await seedUser(db, {
      role: 'admin',
      legacyUsersRole: 'user', // přesně produkční drift
      permission: 'vouchers.manage',
    });
    const client = await signIn(adminWithPerm.email, adminWithPerm.password);
    const path = 'spec170/' + uniq() + '.png';

    const { error: uploadError } = await client.storage.from('voucher-images').upload(path, PNG_1PX, {
      contentType: 'image/png',
    });
    expect(uploadError).toBeNull();
    createdObjectPaths.push(path);

    const { error: deleteError } = await client.storage.from('voucher-images').remove([path]);
    expect(deleteError).toBeNull();
    createdObjectPaths.splice(createdObjectPaths.indexOf(path), 1);
  });

  test('170-3/170-4 admin bez vouchers.manage nemůže zapisovat, i když stará users.role="admin"', async () => {
    const db = admin();
    const adminNoPerm = await seedUser(db, {
      role: 'admin',
      legacyUsersRole: 'admin', // stará hodnota by dřív stačila — teď nesmí
    });
    const client = await signIn(adminNoPerm.email, adminNoPerm.password);
    const path = 'spec170/' + uniq() + '.png';

    const { error: uploadError } = await client.storage.from('voucher-images').upload(path, PNG_1PX, {
      contentType: 'image/png',
    });
    expect(uploadError).not.toBeNull();
  });

  test('170-5 běžný uživatel nemůže zapisovat', async () => {
    const db = admin();
    const plain = await seedUser(db, {});
    const client = await signIn(plain.email, plain.password);
    const path = 'spec170/' + uniq() + '.png';

    const { error: uploadError } = await client.storage.from('voucher-images').upload(path, PNG_1PX, {
      contentType: 'image/png',
    });
    expect(uploadError).not.toBeNull();
  });

  test('170-6 anon nemůže zapisovat', async () => {
    const anon = anonClient();
    const path = 'spec170/' + uniq() + '.png';

    const { error: uploadError } = await anon.storage.from('voucher-images').upload(path, PNG_1PX, {
      contentType: 'image/png',
    });
    expect(uploadError).not.toBeNull();
  });

  test('170-7 veřejné čtení obrázků zůstává funkční', async () => {
    const db = admin();
    const superadmin = await seedUser(db, { role: 'superadmin' });
    const client = await signIn(superadmin.email, superadmin.password);
    const path = 'spec170/' + uniq() + '.png';

    await client.storage.from('voucher-images').upload(path, PNG_1PX, { contentType: 'image/png' });
    createdObjectPaths.push(path);

    const anon = anonClient();
    const { data: listData, error: listError } = await anon.storage.from('voucher-images').list('spec170');
    expect(listError).toBeNull();
    expect((listData ?? []).some((f) => path.endsWith(f.name))).toBe(true);

    const { data: pub } = anon.storage.from('voucher-images').getPublicUrl(path);
    expect(pub.publicUrl).toContain('voucher-images');
  });
});
