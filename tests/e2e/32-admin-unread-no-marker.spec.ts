/**
 * Admin unread badge counts plain user messages (spec 32)
 *
 * Locks the fix: the admin "Zprávy" badge used to count ONLY unread
 * SUPPORT REQUEST marker rows, so a normal customer/partner/affiliate message
 * (sender='user', no handoff) never showed up. Now the badge counts
 * conversations with any unread user message.
 *
 * Flow: seed an unread user message (no marker) for a temp auth user → admin
 * sees the conversation in /admin/messages marked "Čeká na odpověď" and the
 * nav badge shows a count → admin opens the thread (marks it read) → the seeded
 * message is read in the DB.
 *
 * Does NOT touch Bob / ai-chat. STAGING-ONLY. Skips when env vars missing.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loginViaUI } from './helpers/auth';

const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL              ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD           ?? '';
const SUPABASE_URL   = process.env.VITE_SUPABASE_URL           ?? '';
const SERVICE_KEY    = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const unique = Date.now().toString(36).toLowerCase();
const EMAIL = `spec32-user-${unique}@onemil.cz`;
const PASSWORD = `Spec32${unique}!`;
const MESSAGE = `spec32 plain user message ${unique}`;

test.describe('Admin unread badge counts plain user messages (spec 32)', () => {
  test.describe.configure({ retries: 0 });

  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD || !SUPABASE_URL || !SERVICE_KEY,
    'Missing required env vars — skipping spec 32',
  );

  let uid: string | null = null;

  test.beforeAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL, password: PASSWORD, email_confirm: true,
      user_metadata: { name: 'Spec32 User' },
    });
    if (error) throw new Error(`user seed failed: ${error.message}`);
    uid = data.user?.id ?? null;
    if (!uid) throw new Error('uid missing');
    // Plain user message, no SUPPORT REQUEST marker, unread.
    const { error: msgErr } = await (admin as any).from('messages').insert({
      user_id: uid, sender: 'user', content: MESSAGE, read: false,
    });
    if (msgErr) throw new Error(`message seed failed: ${msgErr.message}`);
  });

  test.afterAll(async () => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    if (uid) {
      await (admin as any).from('messages').delete().eq('user_id', uid);
      await admin.auth.admin.deleteUser(uid);
    }
  });

  test('plain user message shows in admin list + badge, clears after read', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('cookie_consent', JSON.stringify({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }));
    });
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/admin/messages');

    // Conversation appears (no marker needed) and is "Čeká na odpověď"
    const card = page.getByTestId(`admin-thread-${uid}`);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText('Čeká na odpověď');

    // Nav badge shows a numeric count (>= 1)
    const badge = page.getByTestId('admin-messages-unread-badge').first();
    await expect(badge).toBeVisible({ timeout: 8_000 });
    await expect(badge).toHaveText(/\d+/);

    // Admin opens the thread → AdminMessageThread marks user messages read
    await card.click();
    await page.waitForURL(new RegExp(`/admin/messages/${uid}`), { timeout: 15_000 });

    // DB readback: the seeded message is now read
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    let read = false;
    for (let i = 0; i < 20; i += 1) {
      const { data } = await (admin as any).from('messages').select('read').eq('user_id', uid).eq('content', MESSAGE).maybeSingle();
      if (data?.read === true) { read = true; break; }
      await page.waitForTimeout(500);
    }
    expect(read, 'admin opening the thread must mark the user message read').toBe(true);
  });
});
