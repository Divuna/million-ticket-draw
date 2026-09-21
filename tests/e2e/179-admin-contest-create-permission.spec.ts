/**
 * Spec 179 — delegated contest creation permission (`contests.create`).
 *
 * Superadmin can grant/revoke a Phase 2 admin_permissions key that lets a
 * plain admin CREATE and PREPARE a contest (draft/pending) without ever being
 * able to publish it (status -> active), pause/close it, or touch bonus
 * prizes. This is a static/contract test: it verifies the source of truth in
 * each layer (frontend permission wiring, route gating, UI restrictions, and
 * the new SQL migration's guard) without requiring a live Supabase project —
 * same pattern as specs 136/171/172/175.
 */
import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const PERMISSIONS_HOOK = 'src/hooks/useAdminPermissions.ts';
const APP_TSX = 'src/App.tsx';
const CONTEST_MGMT = 'src/components/AdminContestManagement.tsx';
const ADMIN_ADMINS = 'src/pages/AdminAdmins.tsx';

function findMigration(): string {
  const dir = resolve(process.cwd(), 'supabase/migrations');
  const match = readdirSync(dir).find((f) => f.includes('admin_contest_create_permission'));
  expect(match, 'admin_contest_create_permission migration file not found').toBeTruthy();
  return read(`supabase/migrations/${match}`);
}

test.describe('179 — contests.create permission key exists and is wired consistently', () => {
  test('ADMIN_PERMISSION_KEYS / LABELS include contests.create', () => {
    const src = read(PERMISSIONS_HOOK);
    expect(src).toMatch(/ADMIN_PERMISSION_KEYS = \[[\s\S]*'contests\.create',?[\s\S]*\] as const/);
    expect(src).toMatch(/'contests\.create':\s*'[^']+'/);
  });

  test('ADMIN_ROUTE_PERMISSION maps /admin/contests -> contests.create', () => {
    const src = read(PERMISSIONS_HOOK);
    expect(src).toContain("'/admin/contests': 'contests.create'");
  });

  test('SUBADMIN_ENTRY_ROUTES includes /admin/contests with contests.create', () => {
    const src = read(PERMISSIONS_HOOK);
    expect(src).toMatch(/path:\s*'\/admin\/contests',\s*permission:\s*'contests\.create'/);
  });

  test('AdminAdmins grant UI automatically covers the new key (iterates ADMIN_PERMISSION_KEYS, no hardcoded list)', () => {
    const src = read(ADMIN_ADMINS);
    expect(src).toContain('ADMIN_PERMISSION_KEYS.map((key) =>');
    // Must not hardcode a duplicate, narrower permission list that would need
    // manual updates whenever a new key (like contests.create) is added.
    expect(src).not.toMatch(/\[\s*'vouchers\.manage',\s*'content\.manage'/);
  });
});

test.describe('179 — /admin/contests route is permission-gated, not superadmin-gated', () => {
  test('App.tsx wires /admin/contests through RequirePermission, reusing AdminContestManagement', () => {
    const src = read(APP_TSX);
    expect(src).toContain(
      '<Route path="/admin/contests" element={<RequirePermission permission="contests.create"><AdminContestManagement /></RequirePermission>} />'
    );
    // Must not be wrapped in RequireSuperadmin instead/also.
    const line = src.split('\n').find((l) => l.includes('path="/admin/contests"'));
    expect(line).toBeDefined();
    expect(line).not.toContain('RequireSuperadmin');
  });

  test('the superadmin-only contest detail route is untouched', () => {
    const src = read(APP_TSX);
    expect(src).toContain(
      '<Route path="/admin/contest/:contestId" element={<RequireSuperadmin><ContestDetailAdmin /></RequireSuperadmin>} />'
    );
  });
});

test.describe('179 — AdminContestManagement restricts a prepare-only admin to draft/pending', () => {
  test('PREPARE_ONLY_STATUS_OPTIONS excludes active/paused/closed', () => {
    const src = read(CONTEST_MGMT);
    const start = src.indexOf('const PREPARE_ONLY_STATUS_OPTIONS');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = src.slice(start, src.indexOf(';', start) + 1);
    expect(block).toContain('"draft"');
    expect(block).toContain('"pending"');
    expect(block).not.toContain('"active"');
    expect(block).not.toContain('"paused"');
  });

  test('both ContestModal and the list view swap status options based on isSuperAdmin', () => {
    const src = read(CONTEST_MGMT);
    expect(src).toContain('const statusOptionsForRole = isSuperAdmin ? SELECTABLE_STATUS_OPTIONS : PREPARE_ONLY_STATUS_OPTIONS;');
    expect(src).toContain('const rowStatusOptions = isSuperAdmin ? SELECTABLE_STATUS_OPTIONS : PREPARE_ONLY_STATUS_OPTIONS;');
    expect(src).toContain('{statusOptionsForRole.map((option) => (');
    expect(src).toContain('{rowStatusOptions.map((option) => {');
  });

  test('canEditContestRow only allows a prepare-only admin to edit draft/pending rows', () => {
    const src = read(CONTEST_MGMT);
    expect(src).toContain(
      'const canEditContestRow = (status: string) =>\n    isSuperAdmin || (isPrepareOnlyAdmin && (status === "draft" || status === "pending"));'
    );
  });

  test('"Otevřít" (superadmin contest detail) and "Uzavřít" (close) are superadmin-only in the row actions', () => {
    const src = read(CONTEST_MGMT);
    const otevritIdx = src.indexOf('Otevřít');
    expect(otevritIdx).toBeGreaterThan(0);
    const beforeOtevrit = src.slice(Math.max(0, otevritIdx - 400), otevritIdx);
    expect(beforeOtevrit).toContain('{isSuperAdmin && (');

    const uzavritGuardIdx = src.indexOf('{isSuperAdmin && contest.status === "active" && (');
    expect(uzavritGuardIdx).toBeGreaterThan(0);
  });

  test('bonus prize / MioCoin bonus / economy tabs remain superadmin-only (not exposed to contests.create)', () => {
    const src = read(CONTEST_MGMT);
    // The tab-visibility block must still be gated on isSuperAdmin alone —
    // bonus_prizes RLS + RPCs are superadmin-only (20260908110000), so
    // exposing these tabs to a plain admin would silently fail every write.
    const tabsBlockStart = src.indexOf('<TabsTrigger value="create">Vytvořit soutěž</TabsTrigger>');
    expect(tabsBlockStart).toBeGreaterThan(0);
    const before = src.slice(Math.max(0, tabsBlockStart - 900), tabsBlockStart);
    expect(before).toContain('{isSuperAdmin && (');
    expect(before).toContain('Bonusy – MioCoins');
    expect(before).toContain('Bonusy – věcné');
    expect(before).toContain('Ekonomika');
    // Must not have been changed to also check hasAdminPermission/canPrepareContests.
    expect(before).not.toMatch(/isSuperAdmin\s*\|\|\s*hasAdminPermission/);
  });

  test('bulk-move-to-draft excludes an already-paused (previously live) contest for non-superadmin', () => {
    const src = read(CONTEST_MGMT);
    expect(src).toContain(
      '(c.status === "pending" || (isSuperAdmin && c.status === "paused"))'
    );
  });
});

test.describe('179 — admin_manage_contest SQL guard enforces the permission at the DB layer', () => {
  test('superadmin branch is unconditional (unchanged behavior)', () => {
    const sql = findMigration();
    expect(sql).toContain("v_is_superadmin := public.has_role(v_admin_id, 'superadmin'::public.app_role);");
    expect(sql).toContain('IF NOT (v_is_superadmin OR (v_is_admin AND v_can_prepare)) THEN');
  });

  test('plain admin needs the explicit contests.create row — role alone is not enough', () => {
    const sql = findMigration();
    expect(sql).toContain("v_can_prepare    := public.has_admin_permission('contests.create', v_admin_id);");
    // The bare "any admin" guard from the prior hardening migration must be gone.
    expect(sql).not.toMatch(/IF NOT \(\s*public\.has_role\(v_admin_id, 'admin'::public\.app_role\)\s*OR\s*public\.has_role\(v_admin_id, 'superadmin'::public\.app_role\)\s*\)\s*THEN/);
  });

  test('non-superadmin cannot request a status other than draft/pending', () => {
    const sql = findMigration();
    expect(sql).toContain("p_status NOT IN ('draft', 'pending')");
    expect(sql).toContain('Spuštění, pozastavení a uzavření provádí superadmin');
  });

  test('non-superadmin cannot update a contest that already left draft/pending', () => {
    const sql = findMigration();
    expect(sql).toContain(
      "IF NOT v_is_superadmin AND v_old_record.status NOT IN ('draft', 'pending') THEN"
    );
  });

  test('closed-is-final and the ticket_count lock are preserved byte-for-byte', () => {
    const sql = findMigration();
    expect(sql).toContain("IF v_old_record.status = 'closed'");
    expect(sql).toContain('Uzavřenou soutěž nelze vrátit do stavu %.');
    expect(sql).toContain('Počet tiketů určuje pozici hlavní výhry.');
  });

  test('audit trail and Sofinity notification are preserved', () => {
    const sql = findMigration();
    expect(sql).toContain('INSERT INTO admin_actions (');
    expect(sql).toContain('PERFORM notify_sofinity_event(');
  });

  test('grants remain authenticated + service_role, never anon/PUBLIC', () => {
    const sql = findMigration();
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION public.admin_manage_contest(uuid, text, text, text, text, text, integer, numeric, text, boolean) FROM anon;'
    );
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.admin_manage_contest(uuid, text, text, text, text, text, integer, numeric, text, boolean) TO authenticated;'
    );
  });
});

test.describe('179 — contests RLS cannot be bypassed by a direct PostgREST request', () => {
  test('the legacy unrestricted "Allow admin full access to contests" policy is dropped', () => {
    const sql = findMigration();
    expect(sql).toContain('DROP POLICY IF EXISTS "Allow admin full access to contests" ON public.contests;');
  });

  test('INSERT/UPDATE/DELETE policies all require superadmin OR (admin + contests.create + draft/pending)', () => {
    const sql = findMigration();
    // The header comment includes a rollback snippet that also mentions these
    // policy names — search only the real executable SQL after BEGIN;.
    const bodyStart = sql.indexOf('\nBEGIN;');
    expect(bodyStart).toBeGreaterThan(0);
    const body = sql.slice(bodyStart);
    for (const policy of ['contests_admin_insert', 'contests_admin_update', 'contests_admin_delete']) {
      const start = body.indexOf(`CREATE POLICY "${policy}"`);
      expect(start, `${policy} not found in executable SQL`).toBeGreaterThan(0);
      const end = body.indexOf(');', start) + 2;
      const block = body.slice(start, end);
      expect(block).toContain("public.has_role(auth.uid(), 'superadmin'::app_role)");
      expect(block).toContain("public.has_admin_permission('contests.create')");
      expect(block).toContain("status IN ('draft', 'pending')");
    }
  });

  test('SELECT policies are untouched — this migration never redefines them', () => {
    const sql = findMigration();
    expect(sql).not.toContain('CREATE POLICY "contests_admin_select_all"');
    expect(sql).not.toContain('CREATE POLICY contests_winner_select_own');
    expect(sql).not.toContain('DROP POLICY IF EXISTS "contests_admin_select_all"');
  });

  test('bonus_prizes RLS/RPCs are explicitly out of scope for this migration', () => {
    const sql = findMigration();
    expect(sql).not.toContain('ON public.bonus_prizes');
    expect(sql).not.toContain('admin_manage_bonus_prize');
    expect(sql).not.toContain('admin_begin_miocoin_save');
  });
});
