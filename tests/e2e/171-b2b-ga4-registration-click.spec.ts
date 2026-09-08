import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test.describe('171 — B2B GA4 registration click tracking', () => {
  test('tracking is initialized from the app entry point', () => {
    const main = read('src/main.tsx');
    expect(main).toContain('initB2BAnalytics');
    expect(main).toContain('initB2BAnalytics();');
  });

  test('event is scoped to /pro-eshopy -> /partner/register', () => {
    const analytics = read('src/lib/b2bAnalytics.ts');
    expect(analytics).toContain("const B2B_LANDING_PATH = '/pro-eshopy'");
    expect(analytics).toContain("const PARTNER_REGISTER_PATH = '/partner/register'");
    expect(analytics).toContain("const GA4_EVENT_NAME = 'b2b_partner_register_click'");
    expect(analytics).toContain("window.location.pathname !== B2B_LANDING_PATH");
    expect(analytics).toContain("destination.pathname !== PARTNER_REGISTER_PATH");
  });

  test('event carries destination and CTA label without changing navigation', () => {
    const analytics = read('src/lib/b2bAnalytics.ts');
    expect(analytics).toContain("window.gtag('event', GA4_EVENT_NAME");
    expect(analytics).toContain('link_url:');
    expect(analytics).toContain('cta_text:');
    expect(analytics).not.toContain('preventDefault');
  });
});
