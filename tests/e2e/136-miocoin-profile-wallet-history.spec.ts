import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  getMioCoinCodeFromSearch,
  withoutMioCoinCode,
} from '../../src/lib/miocoinRedeemUrl';
import {
  formatSignedMioCoin,
  getMioCoinHistoryLabel,
} from '../../src/lib/miocoinHistory';

/**
 * Spec 136 — automated code redemption and customer MioCoin history.
 *
 * These source contracts complement spec 50, which runs the real manual redemption
 * against staging. This spec intentionally sends no e-mails and opens no production
 * session; it verifies the exact client and SQL boundaries that make the email-link
 * continuation, idempotence, own-history isolation, and presentation safe.
 */
const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

const redeemCard = read('src/components/RedeemMioCoinCard.tsx');
const historyComponent = read('src/components/MioCoinHistory.tsx');
const historyHelpers = read('src/lib/miocoinHistory.ts');
const redeemClient = read('src/lib/miocoinRedeem.ts');
const profile = read('src/pages/Profile.tsx');
const login = read('src/pages/Login.tsx');
const register = read('src/pages/Register.tsx');
const auth = read('src/hooks/useAuth.ts');
const historyMigration = read('supabase/migrations/20260818120000_customer_miocoin_history.sql');
const redeemMigration = read('supabase/migrations/20260531_redeem_miocoin_code.sql');

const codeOnly = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('--'))
    .join('\n');

test.describe('136 — MioCoin code from an e-mail link', () => {
  test('automatically reads, normalises, redeems and removes the email-link code', () => {
    expect(getMioCoinCodeFromSearch('?miocoin_code=abc-123')).toBe('ABC-123');
    expect(getMioCoinCodeFromSearch('?other=value')).toBeNull();
    expect(withoutMioCoinCode('?miocoin_code=ABC-123&tab=wallet')).toBe('?tab=wallet');
    expect(redeemCard).toContain("redeemMioCoinCode(codeFromUrl)");
    expect(redeemClient).toContain('supabase.rpc.bind(supabase)');
    expect(redeemCard).toContain('automaticallyAttemptedCode.current === codeFromUrl');
    expect(redeemCard).toContain('withoutMioCoinCode(location.search)');
    expect(redeemCard).toContain("title: automatic ? 'MioCoiny uplatněny' : 'Kód uplatněn'");
  });

  test('an unauthenticated visitor continues from login back to the same profile URL', () => {
    expect(login).toContain('const redirectTarget = getSafeRedirectPath(redirectRaw);');
    expect(login).toContain('navigate(redirectTarget || "/profile", { replace: true });');
  });

  test('the login-to-register route and email registration preserve a safe return target', () => {
    expect(login).toContain('`/register?redirect=${encodeURIComponent(redirectRaw)}`');
    expect(register).toContain("const redirectTarget = getSafeRedirectPath(searchParams.get('redirect'));" );
    expect(register).toContain("navigate(redirectTarget || '/profile');");
    expect(register).toContain("signInWithOAuth(provider, searchParams.get('redirect'))");
    expect(register).toContain('redirectTarget,');
    expect(auth).toContain('redirectAfterSignUp: string | null = null');
    expect(auth).toContain("const safeRedirect = safeRedirectPath(redirectAfterSignUp) ?? '/';");
    expect(auth).toContain('emailRedirectTo: redirectUrl');
  });

  test('a repeated open cannot credit a code twice', () => {
    expect(redeemMigration).toContain('FOR UPDATE;');
    expect(redeemMigration).toContain("IF v_row.status = 'activated' THEN");
    expect(redeemMigration).toContain("'already_used'");
    expect(redeemCard).toContain('automaticallyAttemptedCode.current = codeFromUrl;');
  });

  test('manual code input remains available and calls the same canonical RPC', () => {
    expect(redeemCard).toContain('const handleRedeem = async () => {');
    expect(redeemCard).toContain('const result = await redeemMioCoinCode(trimmed);');
    expect(redeemCard).toContain('placeholder="ZADEJTE MIOCOIN KÓD…"');
    expect(redeemCard).toContain('Uplatnit kód');
  });
});

test.describe('136 — customer MioCoin history', () => {
  test('replaces the narrow transfer list with the complete customer history component', () => {
    expect(profile).toContain('<MioCoinHistory refreshKey={walletHistoryRefreshKey} />');
    expect(profile).not.toContain('Historie převodů');
    expect(profile).toContain('onRedeemed={() => {');
    expect(profile).toContain('setWalletHistoryRefreshKey((version) => version + 1);');
    expect(historyComponent).toContain('supabase.rpc.bind(supabase)');
  });

  test('partner reward rows use only existing partner, website and order data', () => {
    expect(historyMigration).toContain('public.wallet_transactions AS wt');
    expect(historyMigration).toContain('public.partner_coin_activations AS activation');
    expect(historyMigration).toContain('public.partner_reward_codes AS reward_code');
    expect(historyMigration).toContain('public.partners AS partner');
    expect(historyMigration).toContain('COALESCE(activation.external_order_id, reward_code.external_order_id)');
    expect(historyHelpers).toContain('return `Získáno od ${entry.partner_name}`;');
    expect(historyComponent).toContain('Objednávka {entry.external_order_id}');
    expect(historyComponent).toContain('{entry.partner_website_url}');
  });

  test('records existing incoming and outgoing sources, including decimal values', () => {
    for (const entryType of [
      'miocoin_code_credit',
      'payment_credit',
      'top_up',
      'bonus_credit',
      'bonus_transfer_to_main',
      'ticket_purchase',
      'benefit_purchase',
      'voucher_purchase',
      'refund_debit',
    ]) {
      expect(historyHelpers).toContain(`${entryType}:`);
    }
    expect(formatSignedMioCoin(31.3)).toBe('+31,3 MioCoinu');
    expect(formatSignedMioCoin(-20)).toBe('−20 MioCoinů');
    expect(getMioCoinHistoryLabel({ entry_type: 'miocoin_code_credit', partner_name: 'vereonika sro' }))
      .toBe('Získáno od vereonika sro');
    expect(getMioCoinHistoryLabel({ entry_type: 'ticket_purchase', partner_name: null }))
      .toBe('Použito v soutěži');
    expect(historyComponent).toContain("? 'text-green-700'");
    expect(historyComponent).toContain("? 'text-red-600'");
  });

  test('the RPC can return only the authenticated customer’s own history', () => {
    const sql = codeOnly(historyMigration);
    expect(sql).toContain("WHERE wt.user_id = auth.uid()");
    expect(sql).toContain("WHERE transfer.user_id = auth.uid()");
    expect(sql).not.toMatch(/p_user_id/);
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.get_my_miocoin_history(integer) FROM PUBLIC, anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.get_my_miocoin_history(integer) TO authenticated;");
    expect(sql).toContain("SET search_path = ''");
  });
});
