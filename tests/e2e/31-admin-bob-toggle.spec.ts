/**
 * Admin Bob on/off toggle (spec 31) — Phase 1
 *
 * Verifies the global Bob switch (settings.bob_enabled via SECURITY DEFINER RPC
 * get_bob_enabled):
 *   • RPC returns ONLY a boolean to an authenticated user
 *   • Admin can flip Bob off/on from /admin/messages (status text + nav pulse)
 *   • When Bob is OFF, a customer message is saved but ai-chat is NOT called
 *     (no ai reply row), and the customer sees the Czech handoff toast
 *
 * Does NOT touch Bob prompt / CTA / response format.
 * STAGING-ONLY. Skips cleanly when required env vars are missing.
 * Always restores bob_enabled='true' in afterAll.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL              ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD           ?? '';
const TEST_EMAIL     = process.env.E2E_TEST_EMAIL              ?? '';
const TEST_PASSWORD  = process.env.E2E_TEST_PASSWORD           ?? '';
const SUPABASE_URL   = process.env.VITE_SUPABASE_URL           ?? '';
const ANON_KEY       = process.env.VITE_SUPABASE_ANON_KEY      ?? '';
const SERVICE_KEY    = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

async function setBob(value: boolean) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  await (admin as any).from('settings').upsert(
    { key: 'bob_enabled', value: value ? 'true' : 'false', updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
}

test.describe('Admin Bob on/off toggle (spec 31)', () => {
  test.describe.configure({ retries: 0 });

  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD || !TEST_EMAIL || !TEST_PASSWORD || !SUPABASE_URL || !ANON_KEY || !SERVICE_KEY,
    'Missing required env vars — skipping spec 31',
  );

  test.beforeAll(async () => { await setBob(true); });
  test.afterAll(async () => { await setBob(true); });

  test('get_bob_enabled RPC returns only a boolean for authenticated user', async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY);
    const { error: signInErr } = await client.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
    expect(signInErr).toBeNull();
    const { data, error } = await (client as any).rpc('get_bob_enabled');
    expect(error).toBeNull();
    expect(typeof data).toBe('boolean');
  });

  test('admin can flip Bob off and on — status text + nav pulse', async ({ page }) => {
    await setBob(true);
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('cookie_consent', JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }));
    });
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/messages');

    const status = page.getByTestId('admin-bob-status');
    await expect(status).toHaveText('Bob aktivní', { timeout: 15_000 });
    // No pulse when Bob is on
    await expect(page.getByTestId('admin-nav-messages-bob-off')).toHaveCount(0);

    // Toggle OFF
    await page.getByTestId('admin-bob-toggle').getByRole('switch').click();
    await expect(status).toHaveText('Bob vypnutý', { timeout: 8_000 });
    // DB reflects off
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: row } = await (admin as any).from('settings').select('value').eq('key', 'bob_enabled').maybeSingle();
    expect(row?.value).toBe('false');

    // After reload the top nav shows the orange pulse on Zprávy
    await page.reload();
    await expect(page.getByTestId('admin-nav-messages-bob-off')).toBeVisible({ timeout: 10_000 });

    // Toggle back ON
    await page.getByTestId('admin-bob-toggle').getByRole('switch').click();
    await expect(status).toHaveText('Bob aktivní', { timeout: 8_000 });
    await page.reload();
    await expect(page.getByTestId('admin-nav-messages-bob-off')).toHaveCount(0, { timeout: 10_000 });
  });

  test('Bob OFF: customer message saved, ai-chat not called', async ({ page }) => {
    await setBob(false);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: u } = await (admin as any).from('users').select('id').eq('email', TEST_EMAIL).maybeSingle();
    const uid = u?.id as string | undefined;
    expect(uid, 'test customer must exist in public.users').toBeTruthy();

    const tStart = new Date().toISOString();
    const text = `spec31 bob-off ${Date.now()}`;

    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('cookie_consent', JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }));
    });
    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto('/messages');

    const input = page.getByPlaceholder('Napište zprávu...');
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill(text);
    await input.press('Enter');

    // Czech handoff toast
    await expect(page.locator('[data-sonner-toast], [role="status"]').filter({ hasText: 'předali podpoře' }).first())
      .toBeVisible({ timeout: 10_000 });

    // DB: user message saved, NO ai reply created after tStart for this user
    let saved = false;
    for (let i = 0; i < 20; i += 1) {
      const { data } = await (admin as any).from('messages').select('id').eq('user_id', uid).eq('sender', 'user').eq('content', text).maybeSingle();
      if (data) { saved = true; break; }
      await page.waitForTimeout(500);
    }
    expect(saved, 'customer message must be saved when Bob is off').toBe(true);

    const { count: aiCount } = await (admin as any)
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid).eq('sender', 'ai').gt('created_at', tStart);
    expect(aiCount ?? 0, 'ai-chat must NOT be called when Bob is off').toBe(0);
  });
});
