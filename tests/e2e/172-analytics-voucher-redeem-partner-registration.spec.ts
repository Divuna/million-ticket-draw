/**
 * Spec 172 — analytics oprava dle auditu GPT Astra:
 *  1) voucherRedeem() posílal chybně `voucher_purchase` (mísilo se s nákupem
 *     voucheru v GA4) — musí posílat `voucher_redeemed`.
 *  2) chyběl konverzní event pro dokončenou partnerskou registraci — nový
 *     `analytics.partnerRegistrationCompleted()` volaný jen po skutečně
 *     úspěšném `supabase.auth.signUp` (ne po fake-success/existujícím emailu).
 *
 * Statický contract test (bez DB, bez secretů — běží v každém CI), stejný
 * vzor jako spec 164/165/171.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const ANALYTICS = 'src/lib/analytics.ts';
const PARTNER_REGISTER = 'src/pages/PartnerRegister.tsx';
const B2B_ANALYTICS = 'src/lib/b2bAnalytics.ts';

/** Extract an object-method body: `name: (...) => { ... },` up to the matching top-level `},`. */
function extractMethodBody(src: string, name: string): string {
  const start = src.indexOf(`${name}: (`);
  expect(start, `${name} not found in analytics.ts`).toBeGreaterThanOrEqual(0);
  const end = src.indexOf('\n  },', start);
  expect(end, `${name} has no closing '\\n  },'`).toBeGreaterThan(start);
  return src.slice(start, end);
}

test.describe('172 — voucherRedeem event fix + partner_registration_completed', () => {
  test('voucherPurchase() is unchanged — still sends exactly voucher_purchase', () => {
    const body = extractMethodBody(read(ANALYTICS), 'voucherPurchase');

    expect(body).toContain("console.log('[analytics] voucher_purchase'");
    expect(body).toContain("push('voucher_purchase'");
    expect(body).not.toContain('voucher_redeemed');
  });

  test('voucherRedeem() sends voucher_redeemed, not voucher_purchase', () => {
    const body = extractMethodBody(read(ANALYTICS), 'voucherRedeem');

    expect(body).toContain("console.log('[analytics] voucher_redeemed'");
    expect(body).toContain("push('voucher_redeemed'");
    expect(body).not.toContain('voucher_purchase');

    // Parameters preserved.
    expect(body).toContain('voucher_id: voucherId');
    expect(body).toContain('price');
  });

  test('voucher_purchase string does not appear anywhere in voucherRedeem — no leftover mix-up', () => {
    const src = read(ANALYTICS);
    const start = src.indexOf('voucherRedeem: (');
    const end = src.indexOf('\n  },', start);
    const voucherRedeemBlock = src.slice(start, end);

    expect(voucherRedeemBlock).not.toMatch(/voucher_purchase/);
  });

  test('partnerRegistrationCompleted() exists and sends only the event name — no personal or company data', () => {
    const body = extractMethodBody(read(ANALYTICS), 'partnerRegistrationCompleted');

    expect(body).toContain("console.log('[analytics] partner_registration_completed')");
    expect(body).toContain("push('partner_registration_completed')");

    // No second argument to push — event carries zero params.
    expect(body).not.toMatch(/push\('partner_registration_completed',/);

    // Defensive: none of the forbidden fields appear anywhere in this method body.
    for (const forbidden of [
      'email',
      'ico',
      'dic',
      'phone',
      'company',
      'user_id',
      'userId',
      'website',
    ]) {
      expect(
        body.toLowerCase(),
        `partnerRegistrationCompleted must not reference "${forbidden}"`
      ).not.toContain(forbidden.toLowerCase());
    }
  });

  test('PartnerRegister.tsx calls analytics.partnerRegistrationCompleted() only after signUp success checks, before setSubmitted', () => {
    const src = read(PARTNER_REGISTER);

    expect(src).toContain("import { analytics } from '@/lib/analytics';");

    const callAt = src.indexOf('analytics.partnerRegistrationCompleted()');
    expect(callAt, 'analytics.partnerRegistrationCompleted() must be called').toBeGreaterThanOrEqual(0);

    // Must come after all three success guards (authError, missing user, empty identities).
    const authErrorGuardAt = src.indexOf('if (authError)');
    const noUserGuardAt = src.indexOf('if (!authData?.user)');
    const emptyIdentitiesGuardAt = src.indexOf('identities.length === 0');
    expect(authErrorGuardAt).toBeGreaterThanOrEqual(0);
    expect(noUserGuardAt).toBeGreaterThan(authErrorGuardAt);
    expect(emptyIdentitiesGuardAt).toBeGreaterThan(noUserGuardAt);
    expect(callAt, 'must fire after all success guards').toBeGreaterThan(emptyIdentitiesGuardAt);

    // Must fire before (or at) the success-state transition, not after.
    const setSubmittedAt = src.indexOf('setSubmitted(true)');
    expect(setSubmittedAt).toBeGreaterThan(callAt);
  });

  test('analytics.partnerRegistrationCompleted() is never called inside the catch/error branch', () => {
    const src = read(PARTNER_REGISTER);

    const catchStart = src.indexOf('} catch (error: any) {');
    expect(catchStart, 'catch block not found').toBeGreaterThanOrEqual(0);
    const catchEnd = src.indexOf('\n    }\n\n    setLoading(false);', catchStart);
    expect(catchEnd, 'catch block end not found').toBeGreaterThan(catchStart);
    const catchBody = src.slice(catchStart, catchEnd);

    expect(catchBody).not.toContain('partnerRegistrationCompleted');
    // Error branch must not flip to the success state either.
    expect(catchBody).not.toContain('setSubmitted(true)');
  });

  test('PartnerRegister does not pass any personal/company field into the analytics call site', () => {
    const src = read(PARTNER_REGISTER);
    const callLine = src
      .split('\n')
      .find((line) => line.includes('analytics.partnerRegistrationCompleted()'));

    expect(callLine).toBeDefined();
    // Called with zero arguments.
    expect(callLine).toMatch(/analytics\.partnerRegistrationCompleted\(\)\s*;?\s*$/);
  });

  test('b2b_partner_register_click remains unchanged', () => {
    const analytics = read(B2B_ANALYTICS);
    expect(analytics).toContain("const B2B_LANDING_PATH = '/pro-eshopy'");
    expect(analytics).toContain("const PARTNER_REGISTER_PATH = '/partner/register'");
    expect(analytics).toContain("const GA4_EVENT_NAME = 'b2b_partner_register_click'");
    expect(analytics).toContain("window.gtag('event', GA4_EVENT_NAME");
  });

  test('other analytics events are untouched by this fix', () => {
    const src = read(ANALYTICS);

    expect(src).toContain("push('registration_completed')");
    expect(src).toContain("push('ticket_purchase'");
    expect(src).toContain("push('miocoin_purchase'");
  });
});
