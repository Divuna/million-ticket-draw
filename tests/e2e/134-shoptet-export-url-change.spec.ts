import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Spec 134 — changing the Shoptet export URL of an already connected partner.
 *
 * The rule the whole feature turns on: a new URL is a REQUEST, not a switch. Until
 * an admin approves it the partner stays connected and imports keep reading the old
 * link. Everything below exists to stop that guarantee eroding.
 *
 * These are source and SQL contracts. The parts that can only be proven against a
 * live database — that promote really overwrites the Vault key, that the unique
 * index really rejects a second pending change — are listed in the branch notes as
 * staging verification steps and are NOT claimed here.
 */

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

/** SQL with comments stripped, so assertions match real statements, not prose. */
const sqlOnly = (sql: string) =>
  sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

const migration = read(
  'supabase/migrations/20260818090000_shoptet_export_url_change_requests.sql',
);
const migrationSql = sqlOnly(migration);
const submitFn = read('supabase/functions/submit-shoptet-connection/index.ts');
const approveFn = read('supabase/functions/approve-shoptet-connection/index.ts');
const dashboard = read('src/pages/PartnerDashboard.tsx');
const adminPage = read('src/pages/AdminPartners.tsx');
const baseMigration = read(
  'supabase/migrations/20260628120000_shoptet_connection_requests.sql',
);

// ───────────────────────────────────────────────────────────────────────────────
// 1. Schema — a change can exist next to a live connection
// ───────────────────────────────────────────────────────────────────────────────

test('134a request_kind separates a first connection from a URL change', () => {
  expect(migrationSql).toContain('add column if not exists request_kind text not null default \'initial\'');
  expect(migrationSql).toContain("check (request_kind in ('initial','url_change'))");
});

test('134b the old single-live-row index no longer blocks a change request', () => {
  // The original index allowed exactly one submitted/approved/active row per
  // partner. An active partner fills that slot, so a change could never be filed.
  expect(sqlOnly(baseMigration)).toContain(
    "create unique index if not exists scr_partner_pending_unique\n  on public.shoptet_connection_requests(partner_id)\n  where status in ('submitted','approved','active')",
  );

  expect(migrationSql).toContain('drop index if exists public.scr_partner_pending_unique');
  // Rebuilt with the same meaning, scoped to the first connection.
  expect(migrationSql).toContain(
    "where status in ('submitted','approved','active')\n    and request_kind = 'initial'",
  );
});

test('134c the database is what stops a duplicate pending change', () => {
  expect(migrationSql).toContain('scr_partner_pending_change_unique');
  expect(migrationSql).toContain(
    "where status = 'submitted'\n    and request_kind = 'url_change'",
  );
  // Only 'submitted' is constrained, so a partner may change the URL again later.
  expect(migrationSql).not.toContain(
    "where status in ('submitted','approved','active')\n    and request_kind = 'url_change'",
  );
});

test('134d the migration touches nothing but this table', () => {
  expect(migrationSql).not.toMatch(/alter table public\.partners/i);
  expect(migrationSql).not.toMatch(/\bupdate\s+public\./i);
  expect(migrationSql).not.toMatch(/\bdelete\s+from\b/i);
  expect(migrationSql).not.toMatch(/wallet|payment|contest|ticket|reward_mode|shoptet_import_enabled/i);
  // No new Vault RPC: the existing ones already cover the change lifecycle.
  expect(migrationSql).not.toMatch(/create (or replace )?function/i);
  expect(migrationSql).not.toMatch(/vault\./i);
});

// ───────────────────────────────────────────────────────────────────────────────
// 2. Submit — the new URL goes to Vault and nowhere else
// ───────────────────────────────────────────────────────────────────────────────

test('134e a change can only be filed on top of a live connection', () => {
  expect(submitFn).toContain('no_active_connection');
  expect(submitFn).toContain(".eq(\"request_kind\", \"initial\")");
  expect(submitFn).toContain('.in("status", ["approved", "active"])');
});

test('134f the submitted URL reaches Vault only', () => {
  // One writer, and it is the Vault RPC.
  expect(submitFn).toContain('store_shoptet_pending_url');

  // The URL must never be written to a table, echoed back, or logged.
  expect(submitFn).not.toMatch(/\.insert\(\s*\{[^}]*\burl\b/s);
  expect(submitFn).not.toMatch(/\.update\(\s*\{[^}]*\burl\b/s);
  expect(submitFn).not.toMatch(/console\.(log|error|warn)\([^)]*\burl\b/);
  expect(submitFn).not.toMatch(/ok\(\{[^}]*\burl\b/s);

  // What the request row records is a boolean, never the value.
  expect(submitFn).toContain('url_received: true');
});

test('134g a duplicate change is reported, not swallowed as a server error', () => {
  // The partial unique index raises 23505 on the draft → submitted transition.
  expect(submitFn).toContain('updateErr.code === "23505"');
  expect(submitFn).toContain('change_already_pending');
  // The rejected attempt must not leave its URL sitting in Vault.
  expect(submitFn).toContain('delete_shoptet_pending_url');
});

test('134g2 Vault cleanup never chains .catch() onto a query builder', () => {
  // A PostgrestBuilder is a thenable with no .catch, so `rpc(...).catch(fn)` throws
  // a TypeError and crashes the handler with a bare 500. Found on staging: the very
  // first duplicate change request hit it, because the cleanup path had never run
  // before. Both functions must use try/catch instead.
  for (const src of [submitFn, approveFn]) {
    expect(src).not.toMatch(/\.rpc\([^)]*\)\s*\.catch\(/s);
  }
  expect(submitFn).toContain('try {\n      await admin.rpc("delete_shoptet_pending_url"');
  expect(approveFn).toContain('try {\n    await admin.rpc("delete_shoptet_pending_url"');
});

// ───────────────────────────────────────────────────────────────────────────────
// 3. Approve — swaps the URL and nothing else
// ───────────────────────────────────────────────────────────────────────────────

/** The approve branch that handles a URL change, isolated from onboarding. */
const changeBranch = approveFn.slice(
  approveFn.indexOf('if (action === "approve" && requestKind === "url_change")'),
  approveFn.indexOf('// ── 5a. APPROVE'),
);

test('134h approving a change is a separate branch from onboarding', () => {
  expect(changeBranch.length).toBeGreaterThan(200);
  expect(approveFn).toContain('const requestKind =');
});

test('134i approving a change rewrites the Vault URL only', () => {
  expect(changeBranch).toContain('promote_shoptet_pending_url');

  // The settings onboarding applies must NOT be re-applied to a live partner.
  expect(changeBranch).not.toContain('shoptet_customer_delivery');
  expect(changeBranch).not.toContain('shoptet_import_enabled: true');
  expect(changeBranch).not.toContain('reward_trigger_status');
  expect(changeBranch).not.toContain('reward_mode');

  // And it writes nothing to partners at all.
  expect(changeBranch).not.toMatch(/\.from\("partners"\)\s*\n\s*\.update\(/);
});

test('134j approval is refused if the partner points at a different Vault key', () => {
  // Otherwise promote would rewrite a key the importer never reads: the change
  // would look applied while imports carried on with the old URL.
  expect(changeBranch).toContain('expectedKeyName');
  expect(changeBranch).toContain('shoptet_export_secret_name !== expectedKeyName');
  expect(changeBranch).toContain('partner_key_mismatch');
});

test('134k a failed swap leaves the old URL live', () => {
  // promote is the only mutating call, and nothing is changed before it.
  const beforePromote = changeBranch.slice(0, changeBranch.indexOf('promote_shoptet_pending_url'));
  expect(beforePromote).not.toMatch(/\.update\(/);
  expect(changeBranch).toContain('vault_error');
});

test('134l the onboarding approval path is untouched', () => {
  // Everything the first connection depends on still happens in its own branch.
  const initialBranch = approveFn.slice(approveFn.indexOf('// ── 5a. APPROVE'));
  expect(initialBranch).toContain('shoptet_customer_delivery: "onemil"');
  expect(initialBranch).toContain('reward_trigger_status: scr.trigger_status');
  expect(initialBranch).toContain('shoptet_import_enabled: true');
  expect(initialBranch).toContain('status: "active"');
});

test('134m rejecting a change removes only the pending URL', () => {
  const rejectBranch = approveFn.slice(approveFn.indexOf('// ── 5b. REJECT'));
  expect(rejectBranch).toContain('delete_shoptet_pending_url');
  expect(rejectBranch).toContain('status: "rejected"');
  // The live key is never promoted or deleted on reject.
  expect(rejectBranch).not.toContain('promote_shoptet_pending_url');
  expect(rejectBranch).not.toMatch(/\.from\("partners"\)\s*\n\s*\.update\(/);
});

// ───────────────────────────────────────────────────────────────────────────────
// 4. Partner UI
// ───────────────────────────────────────────────────────────────────────────────

test('134n a pending change never makes the live connection look inactive', () => {
  // A change is a newer row, so a single "latest row" query would flip an active
  // partner back to "waiting for approval" and hide the widget snippet.
  expect(dashboard).toContain(".eq('request_kind', 'initial')");
  expect(dashboard).toContain(".eq('request_kind', 'url_change')");
  expect(dashboard).toContain('setShoptetChangeReq');

  // Connection state still derives from the connection row alone.
  expect(dashboard).toContain(
    "const isShoptetConnectionLive =\n    shoptetReq?.status === 'approved' || shoptetReq?.status === 'active';",
  );
});

test('134o the action appears only for a live connection', () => {
  expect(dashboard).toContain('{isShoptetConnectionLive && (');
  expect(dashboard).toContain('Změnit exportní odkaz');
  expect(dashboard).toContain('Odeslat ke schválení');
});

test('134p while a change waits, the partner is told the old link still runs', () => {
  expect(dashboard).toContain("shoptetChangeReq?.status === 'submitted'");
  expect(dashboard).toContain('Změna odkazu čeká na schválení');
  expect(dashboard).toContain('objednávky dál načítají z původního odkazu');
  // The button is replaced by the pending notice, so no second request can be filed.
  expect(dashboard).toContain('{shoptetChangePending ? (');
});

test('134q the partner UI never persists or redisplays the URL', () => {
  expect(dashboard).toContain('setShoptetChangeUrl');
  // Sent to the Edge Function, never inserted into the table.
  expect(dashboard).toContain("supabase.functions.invoke('submit-shoptet-connection'");
  const changeHandler = dashboard.slice(
    dashboard.indexOf('const handleShoptetChangeSubmit'),
    dashboard.indexOf('// Validates and returns the draft field payload'),
  );
  expect(changeHandler.length).toBeGreaterThan(200);

  // The insert must not carry the URL value. Checked against the payload itself
  // rather than the word "url", which legitimately appears as request_kind:'url_change'.
  const insertPayload = changeHandler.slice(
    changeHandler.indexOf('.insert({'),
    changeHandler.indexOf('.select(\'id\')'),
  );
  expect(insertPayload.length).toBeGreaterThan(50);
  expect(insertPayload).not.toContain('shoptetChangeUrl');
  expect(insertPayload).not.toMatch(/(^|[\s,{])url\s*:/);

  expect(changeHandler).not.toMatch(/console\.(log|warn)\(/);

  // Cleared on every exit path, so the URL cannot linger in component state.
  // The clear sits directly after the call and before any branching, which covers
  // success and failure in one place; the catch covers the throwing path.
  const invokeAt = changeHandler.indexOf("functions.invoke('submit-shoptet-connection'");
  const clearAfterInvoke = changeHandler.indexOf("setShoptetChangeUrl('')", invokeAt);
  const firstBranchAfterInvoke = changeHandler.indexOf('if (efError', invokeAt);
  expect(clearAfterInvoke).toBeGreaterThan(invokeAt);
  expect(clearAfterInvoke).toBeLessThan(firstBranchAfterInvoke);

  const catchBlock = changeHandler.slice(changeHandler.indexOf('} catch {'));
  expect(catchBlock).toContain("setShoptetChangeUrl('')");
  // The input is masked, like the onboarding URL field.
  expect(dashboard).toContain('id="shoptet-change-url"');
});

test('134r a change carries the live settings over, it does not renegotiate them', () => {
  const changeHandler = dashboard.slice(
    dashboard.indexOf('const handleShoptetChangeSubmit'),
    dashboard.indexOf('// Validates and returns the draft field payload'),
  );
  expect(changeHandler).toContain('shop_name: shoptetReq.shop_name');
  expect(changeHandler).toContain('trigger_status: shoptetReq.trigger_status');
  expect(changeHandler).toContain("request_kind: 'url_change'");
});

// ───────────────────────────────────────────────────────────────────────────────
// 5. Admin UI
// ───────────────────────────────────────────────────────────────────────────────

test('134s the admin can tell a change from a first connection', () => {
  expect(adminPage).toContain('request_kind');
  expect(adminPage).toContain('Změna exportního odkazu');
  expect(adminPage).toContain('První napojení');
  expect(adminPage).toContain('data-testid={`shoptet-request-${req.request_kind}`}');
});

test('134t the change card says what approval will and will not do', () => {
  expect(adminPage).toContain('Schválení přepne');
  expect(adminPage).toContain('pouze exportní odkaz');
  expect(adminPage).toContain('Zamítnutí ponechá v provozu původní odkaz');
  // Settings a change does not apply are not printed as if they were pending.
  expect(adminPage).toContain('{req.request_kind !== "url_change" && (');
});

test('134u the admin view still never selects or shows the URL', () => {
  expect(adminPage).not.toMatch(/select\([^)]*export_url/);
  expect(adminPage).not.toMatch(/shoptet_export_secret_name/);
  expect(adminPage).toContain('url_received');
});

// ───────────────────────────────────────────────────────────────────────────────
// 6. Blast radius
// ───────────────────────────────────────────────────────────────────────────────

test('134v nothing outside the Shoptet connection flow is involved', () => {
  for (const src of [submitFn, approveFn]) {
    expect(src).not.toMatch(/\bwallets\b|\bpayments\b|\bcontests\b|\btickets\b/);
    expect(src).not.toMatch(/buy_ticket_atomic|compute_partner_reward/);
  }
  // The importer is not modified by this feature — it keeps reading the same key.
  expect(migrationSql).not.toMatch(/import-shoptet-orders/);
});
