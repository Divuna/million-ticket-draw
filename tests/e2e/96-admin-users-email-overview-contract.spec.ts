import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const migrationPath = path.join(
  repoRoot,
  'supabase/migrations/20260723165000_admin_users_email_overview.sql',
);
const adminUsersPath = path.join(repoRoot, 'src/pages/AdminUsers.tsx');

const read = (filePath: string) => fs.readFileSync(filePath, 'utf8');

test.describe('admin users authoritative e-mail contract', () => {
  test('the UI uses the guarded overview and renders the returned e-mail', () => {
    const source = read(adminUsersPath);

    expect(source).toContain(".rpc('get_admin_users_overview')");
    expect(source).toContain("email: row.email || ''");
    expect(source).toContain('user.email.toLowerCase().includes(needle)');
    expect(source).toContain('{user.email}');
    expect(source).not.toContain("email: '',\n          role");
  });

  test('the overview reads the authoritative Auth e-mail and real account creation date', () => {
    const migration = read(migrationPath);

    expect(migration).toContain('FROM auth.users auth_user');
    expect(migration).toContain('auth_user.email::text');
    expect(migration).toContain('auth_user.created_at');
    expect(migration).toContain('auth_user.deleted_at IS NULL');
    expect(migration).not.toContain('encrypted_password');
    expect(migration).not.toContain('raw_user_meta_data');
    expect(migration).not.toContain('confirmation_token');
  });

  test('ordinary and anonymous users cannot read other account e-mails', () => {
    const migration = read(migrationPath);

    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path TO public');
    expect(migration).toContain('auth.uid() IS NULL OR NOT EXISTS');
    expect(migration).toContain("caller_role.role IN ('admin', 'superadmin')");
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.get_admin_users_overview() FROM PUBLIC',
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.get_admin_users_overview() FROM anon',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_admin_users_overview() TO authenticated',
    );
  });

  test('partner account protection remains visible to the role selector', () => {
    const migration = read(migrationPath);
    const source = read(adminUsersPath);

    expect(migration).toContain('partner.auth_user_id = auth_user.id');
    expect(migration).toContain('AS is_partner_account');
    expect(source).toContain('isPartnerAccount: Boolean(row.is_partner_account)');
    expect(source).toContain('Partnerský účet');
  });
});
