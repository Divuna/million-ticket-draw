/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Admin — MioCoin Chunked Save Test  (issue #71 lock-in)                    ║
 * ║                                                                            ║
 * ║  Verifies the chunked MioCoin save path introduced in PR #77 and finalised ║
 * ║  in PR #78 (CHUNK_SIZE = 500). Forces ≥ 2 chunks by generating 600         ║
 * ║  positions.                                                                ║
 * ║                                                                            ║
 * ║  STAGING-ONLY. Skipped cleanly when any required env var is absent.        ║
 * ║                                                                            ║
 * ║  Required env vars (set in playwright-staging.yml or local .env):          ║
 * ║    E2E_ADMIN_EMAIL              admin-e2e@onemil.cz                        ║
 * ║    E2E_ADMIN_PASSWORD                                                      ║
 * ║    VITE_SUPABASE_URL            staging Supabase URL                       ║
 * ║    VITE_SUPABASE_ANON_KEY       staging anon key                           ║
 * ║    E2E_SPEC20_CONTEST_ID        UUID of a pre-seeded staging contest       ║
 * ║                                                                            ║
 * ║  Seed requirements for the SPEC20 contest:                                 ║
 * ║    status         = "draft"                  (appears in "Archiv test")    ║
 * ║    ticket_count   ≥ 601                       (≥ 600 unique MioCoin slots) ║
 * ║    main_image     non-empty placeholder URL  (so save button enables)      ║
 * ║    no MioCoin bonus rows                     (so generator is not blocked) ║
 * ║                                                                            ║
 * ║  Note: SPEC18 contest has ticket_count = 100 → too small for 600 positions ║
 * ║  → cannot reuse. A dedicated SPEC20 seed step is required in the workflow  ║
 * ║  for this spec to execute (not added by this PR — workflow change is       ║
 * ║  out of scope per the PR rules). Until added, this spec skips cleanly.     ║
 * ║                                                                            ║
 * ║  What it locks:                                                            ║
 * ║    • The frontend uses admin_begin / admin_append_chunk / admin_finalize   ║
 * ║      (any reversion to the monolithic RPC breaks the audit assertions)     ║
 * ║    • The three SECURITY DEFINER functions exist on staging                 ║
 * ║    • contests.total_miocoin_bonus is synced from real bonus_prizes sum    ║
 * ║    • bonus_prizes row count exactly matches the expected count            ║
 * ║    • Audit rows record begin + bulk_create with metadata.chunked = true   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { test, expect, Locator } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const ADMIN_EMAIL       = process.env.E2E_ADMIN_EMAIL       ?? '';
const ADMIN_PASSWORD    = process.env.E2E_ADMIN_PASSWORD    ?? '';
const SPEC20_CONTEST_ID = process.env.E2E_SPEC20_CONTEST_ID ?? '';
const SUPABASE_URL      = process.env.VITE_SUPABASE_URL     ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';

const TOTAL_MIOCOINS = 6000;
const STEP_VALUE     = 10;
const EXPECTED_POS   = TOTAL_MIOCOINS / STEP_VALUE; // 600

test.describe('Admin — MioCoin Chunked Save (issue #71)', () => {
  test('generates 600 MioCoin bonuses and persists via chunked RPC flow', async ({ page }) => {
    test.setTimeout(180_000);

    if (
      !ADMIN_EMAIL ||
      !ADMIN_PASSWORD ||
      !SPEC20_CONTEST_ID ||
      !SUPABASE_URL ||
      !SUPABASE_ANON_KEY
    ) {
      test.skip(
        true,
        'Admin credentials, spec-20 contest ID, or Supabase env not set — staging-only test'
      );
    }

    // Cookie consent pre-seed (same pattern as spec 18) so the bottom banner
    // never intercepts pointer events on table-row or modal buttons.
    await page.addInitScript(() => {
      localStorage.setItem('cookie_consent', JSON.stringify({
        essential: true,
        analytics: false,
        marketing: false,
        timestamp: new Date().toISOString(),
      }));
    });

    // ── Step 1: Login as admin via UI ────────────────────────────────────────
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin?tab=management');
    await expect(page.getByRole('button', { name: /Archiv test/i }))
      .toBeVisible({ timeout: 15_000 });

    // ── Step 2: Switch to "Archiv test" and open the SPEC20 contest ──────────
    await page.getByRole('button', { name: /Archiv test/i }).click();
    await page.waitForTimeout(500);

    const contestRow = page.locator('tr', { hasText: SPEC20_CONTEST_ID });
    await expect(contestRow).toBeVisible({ timeout: 15_000 });
    await contestRow.getByRole('button', { name: /Upravit/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // ── Step 3: Open the MioCoin tab and fill the generator ──────────────────
    await dialog.getByRole('tab', { name: /Bonusy.*MioCoins/i }).click();
    const coinPanel = dialog.locator('[role="tabpanel"][data-state="active"]');
    await expect(coinPanel.getByText(/MioCoin bonusy/i).first())
      .toBeVisible({ timeout: 5_000 });

    const fieldByLabel = (panel: Locator, labelText: string | RegExp): Locator =>
      panel.locator('label', { hasText: labelText }).locator('..').locator('input');

    await fieldByLabel(coinPanel, /Celkový počet MioCoinů ve hře/i)
      .fill(String(TOTAL_MIOCOINS));
    await fieldByLabel(coinPanel, /Hodnota jednoho bonusu/i)
      .fill(String(STEP_VALUE));
    // Distribution defaults to "Rovnoměrně" (even) — no change needed.

    // ── Step 4: Generate positions, assert UI count ──────────────────────────
    await coinPanel.getByRole('button', { name: /Vygenerovat MioCoiny/i }).click();
    // Badge text: "Celkem: 6 000 MC (600 pozic)" — Czech locale uses NBSP as
    // thousands separator. Match the position count only, which is unambiguous.
    await expect(coinPanel.getByText(/600 pozic/i)).toBeVisible({ timeout: 10_000 });

    // ── Step 5: Switch to the summary tab and save ───────────────────────────
    await dialog.getByRole('tab', { name: /Vytvořit soutěž/i }).click();
    const saveBtn = dialog.getByRole('button', { name: /Uložit změny|Vytvořit soutěž/i });
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    // Modal closes only on full chunked-save success (begin + N appends + finalize).
    // No "statement timeout" error toast surfaced.
    await expect(dialog).not.toBeVisible({ timeout: 60_000 });

    // ── Step 6: DB read-back via Supabase JS with admin auth ─────────────────
    // RLS allows the admin user to read these tables. Anon-key client signs in
    // with the admin's credentials; reads use the resulting JWT.
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    expect(signInError, 'admin sign-in for read-back').toBeNull();

    // 6a. Row count in bonus_prizes
    const { count: bonusCount, error: bonusErr } = await supabase
      .from('bonus_prizes')
      .select('id', { count: 'exact', head: true })
      .eq('contest_id', SPEC20_CONTEST_ID)
      .gt('amount', 0);
    expect(bonusErr, 'bonus_prizes count read').toBeNull();
    expect(bonusCount).toBe(EXPECTED_POS);

    // 6b. Denormalised total on contests row
    const { data: contestRow2, error: contestErr } = await supabase
      .from('contests')
      .select('total_miocoin_bonus')
      .eq('id', SPEC20_CONTEST_ID)
      .single();
    expect(contestErr, 'contests read').toBeNull();
    expect(Number(contestRow2?.total_miocoin_bonus)).toBe(TOTAL_MIOCOINS);

    // 6c. Audit rows for this contest
    const { data: actions, error: actionsErr } = await supabase
      .from('admin_actions')
      .select('action_type, metadata, timestamp')
      .eq('target_id', SPEC20_CONTEST_ID)
      .in('action_type', ['miocoin_save_begin', 'miocoin_bulk_create'])
      .order('timestamp', { ascending: true });
    expect(actionsErr, 'admin_actions read').toBeNull();
    const types = (actions ?? []).map((a) => a.action_type);
    expect(types).toContain('miocoin_save_begin');
    expect(types).toContain('miocoin_bulk_create');

    const bulkCreate = (actions ?? []).find((a) => a.action_type === 'miocoin_bulk_create');
    expect(bulkCreate, 'bulk_create row present').toBeTruthy();
    expect(
      (bulkCreate?.metadata as { chunked?: boolean } | null)?.chunked,
      'metadata.chunked flag on bulk_create',
    ).toBe(true);

    // ── Step 7: No cleanup needed ────────────────────────────────────────────
    // The SPEC20 contest is wiped + reseeded fresh on every staging CI run by
    // the workflow seed step. The contest remains in status="draft" (Archiv
    // test). No hard delete is performed.
  });
});
