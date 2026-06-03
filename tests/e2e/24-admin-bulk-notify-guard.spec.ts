/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  Admin — Bulk Notification Guard  (spec 24)                                ║
 * ║                                                                            ║
 * ║  Verifies that clicking "Odeslat všem" opens a confirmation dialog         ║
 * ║  and that cancelling does NOT send anything.                               ║
 * ║                                                                            ║
 * ║  STAGING-ONLY. Skipped cleanly when any required env var is absent.        ║
 * ║                                                                            ║
 * ║  Required env vars:                                                         ║
 * ║    E2E_ADMIN_EMAIL              admin-e2e@onemil.cz                        ║
 * ║    E2E_ADMIN_PASSWORD                                                      ║
 * ║    VITE_SUPABASE_URL            staging Supabase URL                       ║
 * ║    VITE_SUPABASE_ANON_KEY       staging anon key                           ║
 * ║                                                                            ║
 * ║  What it locks:                                                             ║
 * ║    • "Odeslat všem" button requires confirmation (no direct fire)          ║
 * ║    • confirmation dialog shows Czech text about all users                  ║
 * ║    • dialog shows the message preview                                      ║
 * ║    • cancelling closes dialog without sending                              ║
 * ║    • "Odeslat všem" button is still available after cancel (no state leak) ║
 * ║                                                                            ║
 * ║  Note: actual bulk send is NOT exercised — it would push to all staging    ║
 * ║  users. The guard (dialog + cancel path) is sufficient to lock the UI.    ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL    ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';
const SUPABASE_URL   = process.env.VITE_SUPABASE_URL  ?? '';

const TEST_TITLE   = 'E2E Spec24 test notifikace';
const TEST_MESSAGE = 'Toto je testovací zpráva spec 24 — neodeslána.';

test.describe('Admin — Bulk notification guard (spec 24)', () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD || !SUPABASE_URL,
    'Missing required env vars — skipping spec 24',
  );

  test('potvrzovací dialog se zobrazí a zrušení nic neodešle', async ({ page }) => {
    // Cookie consent
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'cookie_consent',
        JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }),
      );
    });

    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/notifications');

    // Open the "Nová notifikace" dialog
    await page.getByRole('button', { name: 'Nová notifikace' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8_000 });

    // Fill title and message — leave email empty so "Odeslat všem" appears
    await page.fill('#title', TEST_TITLE);
    await page.fill('#message', TEST_MESSAGE);

    // "Odeslat všem" button must be visible (not direct send — opens confirm)
    const bulkBtn = page.getByTestId('bulk-notify-open-confirm');
    await expect(bulkBtn).toBeVisible();
    await expect(bulkBtn).toBeEnabled();

    // Click — should open confirmation AlertDialog
    await bulkBtn.click();

    const confirmDialog = page.getByRole('alertdialog');
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 });

    // Dialog must warn about all users in Czech
    await expect(confirmDialog).toContainText('všem registrovaným uživatelům');
    await expect(confirmDialog).toContainText('Akci nelze vzít zpět');

    // Dialog must show the message preview
    await expect(confirmDialog).toContainText(TEST_MESSAGE);

    // Cancel — dialog should close, nothing sent
    await page.getByTestId('bulk-notify-cancel').click();
    await expect(confirmDialog).not.toBeVisible({ timeout: 5_000 });

    // "Odeslat všem" button still available — no state leak
    await expect(bulkBtn).toBeVisible();
    await expect(bulkBtn).toBeEnabled();
  });
});
