/**
 * Admin → Affiliate message send (spec 29)
 *
 * Locks the fix for "Zprávu nelze odeslat": the messages INSERT RLS policy set
 * lacked an admin policy, so admin replies to any user (incl. affiliate
 * partners) were denied. Migration 20260603_messages_admin_insert_policy.sql
 * restores messages_insert_admin (authenticated admin/superadmin via user_roles).
 *
 * Flow: seed a temp auth user (affiliate recipient) → admin logs in →
 * /admin/messages/<auth_user_id> → send → no error toast + bubble visible →
 * DB readback confirms the admin message row was inserted.
 *
 * STAGING-ONLY. Skips cleanly when required env vars are missing.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL              ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD           ?? '';
const SUPABASE_URL   = process.env.VITE_SUPABASE_URL            ?? '';
const SERVICE_KEY    = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const unique = Date.now().toString(36).toLowerCase();
const RECIPIENT_EMAIL = `spec29-affiliate-${unique}@onemil.cz`;
const RECIPIENT_PASSWORD = `Spec29${unique}!`;
const MESSAGE_TEXT = `Spec29 admin zpráva ${unique}`;

test.describe('Admin → Affiliate message send (spec 29)', () => {
  test.describe.configure({ retries: 0 });

  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD || !SUPABASE_URL || !SERVICE_KEY,
    'Missing required env vars — skipping spec 29',
  );

  let recipientId: string | null = null;

  test.beforeAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await admin.auth.admin.createUser({
      email: RECIPIENT_EMAIL,
      password: RECIPIENT_PASSWORD,
      email_confirm: true,
      user_metadata: { affiliate_registration: true, name: 'Spec29 Recipient' },
    });
    if (error) throw new Error(`Recipient seed failed: ${error.message}`);
    recipientId = data.user?.id ?? null;
    if (!recipientId) throw new Error('Recipient auth user id missing');
  });

  test.afterAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    if (recipientId) {
      await (admin as any).from('messages').delete().eq('user_id', recipientId);
      await admin.auth.admin.deleteUser(recipientId);
    }
  });

  test('admin can send a message to an affiliate user (RLS allows admin insert)', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem(
        'cookie_consent',
        JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }),
      );
    });

    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.goto(`/admin/messages/${recipientId}`);

    const input = page.getByPlaceholder('Napište odpověď…');
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill(MESSAGE_TEXT);
    await page.getByRole('button', { name: 'Odeslat' }).click();

    // Must NOT show the failure toast
    await expect(page.locator('[data-sonner-toast]', { hasText: 'Zprávu nelze odeslat' }))
      .toHaveCount(0, { timeout: 5_000 });

    // Message bubble appears in the thread
    await expect(page.getByText(MESSAGE_TEXT, { exact: false })).toBeVisible({ timeout: 10_000 });

    // DB readback — admin message row persisted to the affiliate recipient
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    let saved: any = null;
    for (let i = 0; i < 20; i += 1) {
      const { data } = await (admin as any)
        .from('messages')
        .select('user_id, sender, content')
        .eq('user_id', recipientId)
        .eq('sender', 'admin')
        .eq('content', MESSAGE_TEXT)
        .maybeSingle();
      if (data) { saved = data; break; }
      await page.waitForTimeout(500);
    }
    expect(saved, 'admin message to affiliate must be saved').toBeTruthy();
    expect(saved.sender).toBe('admin');
    expect(saved.user_id).toBe(recipientId);
  });
});
