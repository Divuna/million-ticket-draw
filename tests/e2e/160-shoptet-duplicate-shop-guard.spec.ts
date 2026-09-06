import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Spec 160 — TODO #349, bod 3: one e-shop, one active partner connection.
 *
 * Before this guard existed, an admin could approve a Shoptet connection whose
 * export URL pointed at an e-shop ANOTHER partner was already importing from.
 * Both partners would then have a live import of the same orders, and the same
 * purchase would issue a MioCoin reward twice.
 *
 * The guard runs in `approve-shoptet-connection` BEFORE
 * `promote_shoptet_pending_url`, so a refused approval leaves Vault, `partners`
 * and the request row exactly as they were.
 *
 * Critically it must NOT break the invariant that the Shoptet export URL lives
 * only in Vault: the comparison happens inside a SECURITY DEFINER RPC and only
 * the conflicting partner's identity comes back out.
 *
 * Static source contract — no network, no DB, no e-mails.
 */

// git on Windows checks SQL out with CRLF; normalise so multi-line anchors hold.
const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

/**
 * Strips comments so ordering and "must not contain" assertions test real code
 * rather than the safety notes that legitimately name the things being guarded.
 */
const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('--'))
    .join('\n');

const migration = read('supabase/migrations/20260906100000_shoptet_connection_duplicate_shop_guard.sql');
const approveEf = read('supabase/functions/approve-shoptet-connection/index.ts');
const submitEf = read('supabase/functions/submit-shoptet-connection/index.ts');
const dashboard = read('src/pages/PartnerDashboard.tsx');

test.describe('160 — #349: one e-shop cannot be active under two partners', () => {
  // ── the guard itself ─────────────────────────────────────────────────────
  test('160a) the conflict check compares normalised hosts', () => {
    expect(migration).toContain('create or replace function public.shoptet_export_url_host');
    // hostname only: no scheme, no port, no path, no query (so no hash can leak in)
    expect(migration).toContain("substring(p_url from '^[a-z]+://([^/:?#]+)')");
    expect(migration).toContain('lower(');
    expect(migration).toContain("'^www\\.', ''");
  });

  test('160b) a conflict is only raised against an ACTIVELY connected other partner', () => {
    const fn = migration.slice(migration.indexOf('function public.shoptet_pending_url_conflict'));
    // never the partner being approved
    expect(fn).toContain('p.id <> p_partner_id');
    // "actively connected" = import on, or an approved/active connection request
    expect(fn).toContain('p.shoptet_import_enabled is true');
    expect(fn).toContain("r.status in ('approved', 'active')");
  });

  test('160c) the URL never leaves Vault — only the partner identity comes back', () => {
    const fn = migration.slice(migration.indexOf('function public.shoptet_pending_url_conflict'));
    // The return payload carries no URL, no hash and no hostname.
    const returns = fn.match(/jsonb_build_object\([^;]*?\)/gs) ?? [];
    expect(returns.length).toBeGreaterThan(0);
    for (const r of returns) {
      expect(r).not.toContain('v_pending_url');
      expect(r).not.toContain('v_host');
      expect(r).not.toContain('decrypted_secret');
    }
    // and nothing is written to an application table
    expect(fn).not.toMatch(/\binsert into\b/i);
    expect(fn).not.toMatch(/\bupdate public\./i);
  });

  test('160d) both helper functions are service_role only', () => {
    const flat = migration.replace(/\s+/g, ' ');
    for (const sig of ['public.shoptet_export_url_host(text)', 'public.shoptet_pending_url_conflict(uuid, uuid)']) {
      expect(flat).toContain(`revoke all on function ${sig} from public, anon, authenticated;`);
      expect(flat).toContain(`grant execute on function ${sig} to service_role;`);
    }
    expect(migration).not.toMatch(/grant execute on function public\.shoptet_(export_url_host|pending_url_conflict)[^;]*to (anon|authenticated)/);
  });

  test('160e) the migration is additive — no table, data or reward changes', () => {
    expect(migration).not.toMatch(/\bALTER TABLE\b/i);
    expect(migration).not.toMatch(/\bDROP TABLE\b/i);
    expect(migration).not.toMatch(/\b(insert|update|delete)\s+(into\s+)?public\.(partners|partner_reward_codes|partner_coin_activations|wallets|payments|contests)\b/i);
    // exactly the two new helpers, nothing else redefined
    const created = migration.match(/create or replace function public\.(\w+)/g) ?? [];
    expect(created).toHaveLength(2);
  });

  // ── wiring into the approval flow ────────────────────────────────────────
  test('160f) the guard runs before the Vault promote, for BOTH approve branches', () => {
    // Compared on code with comments stripped — a comment naming the promote RPC
    // must not be able to satisfy or break this ordering assertion.
    const code = codeOnly(approveEf);
    const guardIdx = code.indexOf('shoptet_pending_url_conflict');
    const firstPromoteIdx = code.indexOf('promote_shoptet_pending_url');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(firstPromoteIdx).toBeGreaterThan(guardIdx);

    // It sits above the url_change branch, so a change request that repoints an
    // already-live connection at someone else's shop is refused too.
    const changeBranchIdx = code.indexOf('action === "approve" && requestKind === "url_change"');
    expect(changeBranchIdx).toBeGreaterThan(guardIdx);
  });

  test('160g) a conflict is refused with 409 eshop_already_connected', () => {
    expect(approveEf).toContain('eshop_already_connected');
    expect(approveEf).toContain('409');
    // reject is untouched — the guard only gates approve
    expect(approveEf).toContain('if (action === "approve") {');
  });

  test('160h) the refusal never logs or returns the URL or the hash', () => {
    // Comments legitimately explain what must not leak; assert on the code.
    const code = codeOnly(approveEf);
    const guardBlock = code.slice(
      code.indexOf('shoptet_pending_url_conflict'),
      code.indexOf('action === "approve" && requestKind === "url_change"'),
    );
    expect(guardBlock.length).toBeGreaterThan(0);
    expect(guardBlock).not.toMatch(/\burl\b/i);
    expect(guardBlock).not.toMatch(/\bhash\b/i);
    expect(guardBlock).not.toMatch(/decrypted_secret/);
  });

  // ── #349 points 1 and 2 must stay exactly as they are ────────────────────
  test('160i) the second manual admin approval is untouched', () => {
    expect(approveEf).toContain('access_denied_superadmin_only');
    expect(approveEf).toContain('.eq("status", "submitted")');
    expect(submitEf).toContain('shoptet_connection_requests');
    // approving still flips the connection live exactly as before
    expect(approveEf).toContain('shoptet_import_enabled: true');
    expect(approveEf).toContain('shoptet_customer_delivery: "onemil"');
  });

  test('160j) the partner dashboard snippet section is unchanged and still gated', () => {
    expect(dashboard).toContain('Zobrazení MioCoinů v e-shopu');
    expect(dashboard).toContain('Kopírovat kód');
    expect(dashboard).toContain('buildShoptetWidgetSnippet');
    expect(dashboard).toContain("shoptetReq?.status === 'approved' || shoptetReq?.status === 'active'");
  });

  test('160k) no reward, price or import logic was re-implemented here', () => {
    for (const src of [migration, approveEf]) {
      expect(src).not.toContain('compute_partner_reward');
      expect(src).not.toContain('price_per_coin');
      expect(src).not.toContain('reward_mc');
      expect(src).not.toContain('balance_coins');
    }
    // the guard adds no multi-shop concept — #348 stays out of scope
    expect(migration).not.toMatch(/\bshop_id\b|\beshop_id\b|multi[_-]?shop/i);
  });
});
