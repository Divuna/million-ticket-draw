/**
 * Spec 165 — AdminAdmins.tsx role changes go through the protected
 * set_user_role RPC (draft -> issued sibling fix, admin nález P1 #2)
 *
 * Static contract test (no DB, no secrets — runs in every CI, same pattern
 * as spec 91/152/164).
 *
 * Bug (read-only admin audit finding P1 #2): `promoteToAdmin()` and
 * `demoteToUser()` in `src/pages/AdminAdmins.tsx` mutated `public.user_roles`
 * directly via `.from('user_roles').update(...)` / `.insert(...)`, bypassing
 * the existing protected `set_user_role(p_user_id uuid, p_role text)` RPC
 * that already enforces: superadmin-only, no self-role-change, partner
 * accounts blocked, last-superadmin protection, and writes both
 * `user_roles` + `public.users` plus an `audit_logs` row.
 *
 * This test locks that both functions now call ONLY `set_user_role`, that
 * no direct INSERT/UPDATE into `user_roles` remains in either function body,
 * that all previously-existing guards (superadmin page gate, partner guard,
 * "never touch superadmin from this page") are unchanged, and that the
 * existing `subadmin_granted` / `subadmin_revoked` admin_actions audit calls
 * are preserved verbatim (same contract as spec 91).
 *
 * set_user_role itself (superadmin-only / no self-change / partner blocked /
 * last-superadmin protection / writes user_roles + public.users / audit_logs
 * row) is asserted directly against the live migration source, mirroring
 * spec 91's existing coverage of the same RPC.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const ADMIN_ADMINS = 'src/pages/AdminAdmins.tsx';
const SET_USER_ROLE_MIGRATION =
  'supabase/migrations/20260718201724_restrict_admin_role_partner_access.sql';

/** Extract a top-level function body by its `const <name> = async (...) => {` declaration. */
function extractFunctionBody(src: string, constName: string): string {
  const startMarker = `const ${constName} = async (`;
  const start = src.indexOf(startMarker);
  expect(start, `${constName} not found in AdminAdmins.tsx`).toBeGreaterThanOrEqual(0);
  const end = src.indexOf('\n  };', start);
  expect(end, `${constName} has no closing '\\n  };'`).toBeGreaterThan(start);
  return src.slice(start, end);
}

test.describe('AdminAdmins.tsx — role changes use set_user_role RPC, not direct user_roles writes', () => {
  test('promoteToAdmin no longer writes user_roles directly and calls set_user_role(..., "admin")', () => {
    const src = read(ADMIN_ADMINS);
    const body = extractFunctionBody(src, 'promoteToAdmin');

    expect(
      body,
      'promoteToAdmin must not INSERT/UPDATE user_roles directly'
    ).not.toMatch(/from\(\s*['"]user_roles['"]\s*\)\s*\.\s*(update|insert)/);

    expect(body).toMatch(/rpc\(\s*['"]set_user_role['"]/);
    expect(body).toContain('p_user_id: target.id');
    expect(body).toMatch(/p_role:\s*['"]admin['"]/);
  });

  test('demoteToUser no longer writes user_roles directly and calls set_user_role(..., "user")', () => {
    const src = read(ADMIN_ADMINS);
    const body = extractFunctionBody(src, 'demoteToUser');

    expect(
      body,
      'demoteToUser must not INSERT/UPDATE user_roles directly'
    ).not.toMatch(/from\(\s*['"]user_roles['"]\s*\)\s*\.\s*(update|insert)/);

    expect(body).toMatch(/rpc\(\s*['"]set_user_role['"]/);
    expect(body).toContain('p_user_id: target.id');
    expect(body).toMatch(/p_role:\s*['"]user['"]/);
  });

  test('no direct INSERT/UPDATE/DELETE into user_roles remains anywhere in the file', () => {
    const src = read(ADMIN_ADMINS);

    // The only remaining user_roles interaction must be the read in
    // fetchUsers() (used to populate the promotable-users search list).
    expect(src).not.toMatch(/from\(\s*['"]user_roles['"]\s*\)\s*\.\s*(update|insert|delete|upsert)/);
    expect(src).toMatch(/from\(\s*['"]user_roles['"]\s*\)\s*\.\s*select/);
  });

  test('page still gates on isSuperAdmin and never mutates the superadmin role from this page', () => {
    const src = read(ADMIN_ADMINS);

    // Route-level gate unchanged.
    expect(src).toContain('if (!isSuperAdmin)');
    expect(src).toContain("<Navigate to=\"/admin\" replace />");

    // promoteToAdmin: existing admin/superadmin rows are never promoted again.
    const promote = extractFunctionBody(src, 'promoteToAdmin');
    expect(promote).toContain("if (target.role === 'admin' || target.role === 'superadmin') return;");

    // demoteToUser: only an 'admin' row is demotable; superadmin/user rows return early.
    const demote = extractFunctionBody(src, 'demoteToUser');
    expect(demote).toContain("if (target.role !== 'admin') {");

    // UI never offers a superadmin action from this page.
    expect(src).toContain('Vlastník — nelze měnit');
    expect(src).not.toMatch(/p_role:\s*['"]superadmin['"]/);
  });

  test('partner guard remains in promoteToAdmin (partner accounts are rejected before any RPC call)', () => {
    const src = read(ADMIN_ADMINS);
    const promote = extractFunctionBody(src, 'promoteToAdmin');

    const partnerGuardAt = promote.indexOf('if (target.isPartnerAccount)');
    const rpcCallAt = promote.indexOf("rpc('set_user_role'");
    expect(partnerGuardAt, 'partner guard must exist').toBeGreaterThanOrEqual(0);
    expect(rpcCallAt, 'set_user_role call must exist').toBeGreaterThan(0);
    expect(partnerGuardAt, 'partner guard must run before the RPC call').toBeLessThan(rpcCallAt);

    expect(promote).toContain('Partnerský účet nelze povýšit na admina.');
  });

  test('existing subadmin_granted / subadmin_revoked admin_actions audit calls are preserved', () => {
    const src = read(ADMIN_ADMINS);
    const promote = extractFunctionBody(src, 'promoteToAdmin');
    const demote = extractFunctionBody(src, 'demoteToUser');

    expect(promote).toContain("action_name: 'subadmin_granted'");
    expect(demote).toContain("action_name: 'subadmin_revoked'");

    // The RPC call must happen before the audit action_name is logged, and
    // the audit log call itself must be unchanged (log_admin_action RPC).
    expect(promote.indexOf("rpc('set_user_role'")).toBeLessThan(
      promote.indexOf("rpc('log_admin_action'")
    );
    expect(demote.indexOf("rpc('set_user_role'")).toBeLessThan(
      demote.indexOf("rpc('log_admin_action'")
    );
  });

  test('same UI text and toasts are preserved (no wording change)', () => {
    const src = read(ADMIN_ADMINS);

    expect(src).toContain("description: 'Uživatel byl povýšen na subadmina.'");
    expect(src).toContain("description: 'Nepodařilo se povýšit uživatele.'");
    expect(src).toContain("description: 'Subadminovi byla odebrána admin práva.'");
    expect(src).toContain("description: 'Nepodařilo se odebrat admin práva.'");
  });

  test('admin_permissions and invite-subadmin flows are untouched', () => {
    const src = read(ADMIN_ADMINS);

    expect(src).toContain("from('admin_permissions')");
    expect(src).toContain("supabase.functions.invoke('invite-subadmin'");
  });

  test('set_user_role RPC: superadmin-only, no self-change, partner blocked, last-superadmin protected, dual write + audit', () => {
    const migration = read(SET_USER_ROLE_MIGRATION);

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text)');
    expect(migration).toContain("IF v_caller_role <> 'superadmin' THEN");
    expect(migration).toContain('Only superadmin can change user roles.');
    expect(migration).toContain('You cannot change your own role.');
    expect(migration).toContain('Partner account roles cannot be changed.');
    expect(migration).toContain('Cannot remove the last superadmin.');

    // Dual write: user_roles + public.users.
    expect(migration).toMatch(/INSERT INTO public\.user_roles/);
    expect(migration).toContain('ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role');
    expect(migration).toContain('UPDATE public.users SET role = p_role WHERE id = p_user_id');

    // Audit.
    expect(migration).toMatch(/INSERT INTO public\.audit_logs/);
    expect(migration).toContain("'user_role_updated'");

    // Grants: no anon, authenticated + service_role only.
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.set_user_role(uuid, text) FROM anon');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO service_role');
  });
});
