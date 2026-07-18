import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const migrationPath = path.join(
  repoRoot,
  'supabase/migrations/20260718201724_restrict_admin_role_partner_access.sql',
);
const adminUsersPath = path.join(repoRoot, 'src/pages/AdminUsers.tsx');
const adminAdminsPath = path.join(repoRoot, 'src/pages/AdminAdmins.tsx');

const read = (filePath: string) => fs.readFileSync(filePath, 'utf8');

test.describe('admin role and partner access security contract', () => {
  test('ordinary users and scoped admins cannot mutate user_roles directly', () => {
    const migration = read(migrationPath);

    expect(migration).toContain('DROP POLICY IF EXISTS admin_insert_roles ON public.user_roles');
    expect(migration).toContain('DROP POLICY IF EXISTS admin_update_roles ON public.user_roles');
    expect(migration).toContain('CREATE POLICY user_roles_insert_superadmin_only');
    expect(migration).toContain('CREATE POLICY user_roles_update_superadmin_only');
    expect(migration).toContain('CREATE POLICY user_roles_delete_superadmin_only');
    expect(migration).toContain('WITH CHECK (public.is_superadmin())');
    expect(migration).not.toContain("WITH CHECK (has_role(auth.uid(), 'admin'::app_role)");
    expect(migration).not.toContain("WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)");
  });

  test('superadmin user-management UI uses the protected set_user_role RPC arguments', () => {
    const adminUsers = read(adminUsersPath);

    expect(adminUsers).toContain("supabase.rpc('set_user_role'");
    expect(adminUsers).toContain('p_user_id: userId');
    expect(adminUsers).toContain('p_role: role');
    expect(adminUsers).not.toContain('target_user_id: userId');
    expect(adminUsers).not.toContain('new_role: role');
    expect(adminUsers).not.toContain('<option value="superadmin">');
  });

  test('set_user_role is not exposed to anon and still keeps internal superadmin checks', () => {
    const migration = read(migrationPath);

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text)');
    expect(migration).toContain('SET search_path TO public');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.set_user_role(uuid, text) FROM anon');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated');
    expect(migration).toContain("IF v_caller_role <> 'superadmin' THEN");
    expect(migration).toContain('You cannot change your own role.');
    expect(migration).toContain('Partner account roles cannot be changed.');
    expect(migration).toContain('Cannot remove the last superadmin.');
  });

  test('partner status RPC is superadmin/service-role only and not callable by anon', () => {
    const migration = read(migrationPath);
    const adminPortal = read(path.join(repoRoot, 'src/pages/AdminPartnersPortal.tsx'));

    expect(adminPortal).toContain("supabase.rpc('admin_set_partner_status'");
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.admin_set_partner_status');
    expect(migration).toContain('SET search_path TO public');
    expect(migration).toContain("current_setting('request.jwt.claim.role', true)");
    expect(migration).toContain('AND NOT public.is_superadmin()');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.admin_set_partner_status(uuid, public.partner_status, text) FROM anon');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.admin_set_partner_status(uuid, public.partner_status, text) TO authenticated');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.admin_set_partner_status(uuid, public.partner_status, text) TO service_role');
  });

  test('partner cannot update another partner and cannot self-approve via direct table update', () => {
    const migration = read(migrationPath);

    expect(migration).toContain('DROP POLICY IF EXISTS partners_update_admin ON public.partners');
    expect(migration).toContain('CREATE POLICY partners_update_superadmin');
    expect(migration).toContain('WITH CHECK (public.is_superadmin())');

    // The existing own-partner policy remains the row ownership boundary.
    expect(migration).not.toContain('DROP POLICY IF EXISTS partners_update_own');

    // The trigger blocks own-row writes to admin-controlled fields such as
    // status and Shoptet/internal billing controls while leaving normal partner
    // profile/billing/logo fields untouched.
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.guard_partner_self_update_sensitive_fields()');
    expect(migration).toContain('OLD.auth_user_id IS NOT DISTINCT FROM auth.uid()');
    expect(migration).toContain('NEW.auth_user_id IS NOT DISTINCT FROM OLD.auth_user_id');
    expect(migration).toContain('NEW.status IS DISTINCT FROM OLD.status');
    expect(migration).toContain('NEW.approved_at IS DISTINCT FROM OLD.approved_at');
    expect(migration).toContain('NEW.shoptet_import_enabled IS DISTINCT FROM OLD.shoptet_import_enabled');
    expect(migration).toContain('NEW.shoptet_export_secret_name IS DISTINCT FROM OLD.shoptet_export_secret_name');
    expect(migration).toContain('Partner self-service cannot update admin-controlled partner fields');
  });

  test('superadmin admin-management page remains wired to role and permission management', () => {
    const adminAdmins = read(adminAdminsPath);

    expect(adminAdmins).toContain("from('user_roles')");
    expect(adminAdmins).toContain("from('admin_permissions')");
    expect(adminAdmins).toContain("supabase.functions.invoke('invite-subadmin'");
    expect(adminAdmins).toContain("action_name: 'subadmin_granted'");
    expect(adminAdmins).toContain("action_name: 'subadmin_revoked'");
  });

  test('superadmin-only partner administration Edge Functions do not accept broad admin role', () => {
    const edgeFunctions = [
      'admin-generate-partner-api-key',
      'rotate-partner-api-key',
      'approve-partner-registration',
      'get-pending-partner-registrations',
      'approve-shoptet-connection',
    ];

    for (const fn of edgeFunctions) {
      const source = read(path.join(repoRoot, `supabase/functions/${fn}/index.ts`));

      expect(source, fn).toContain("user_roles");
      expect(source, fn).toContain("role");
      expect(source, fn).toContain("superadmin");
      expect(source, fn).not.toContain('["admin", "superadmin"]');
      expect(source, fn).not.toContain("['admin', 'superadmin']");
      expect(source, fn).not.toContain('includes(roleData.role)');
    }
  });
});
