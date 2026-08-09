import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { classificationMatchesJobScope } from '../../supabase/functions/sales-lead-discover/categoryPolicy';

const worker = fs
  .readFileSync('supabase/functions/sales-lead-discover/index.ts', 'utf8')
  .replace(/\r\n/g, '\n');
const loop = worker.split('const url = pool[cursor];')[1] ?? '';
const categoryGuard = loop.split('// Firma prosla overenim webu i ARES.')[0] ?? '';
const afterCategoryGuard = loop.split('// Firma prosla overenim webu i ARES.')[1] ?? '';

test.describe('automatic discovery category enforcement', () => {
  test('auto-created e-shopy job accepts an e-shopy classification', () => {
    expect(classificationMatchesJobScope({
      autoCreated: true,
      requestedGroup: 'e-shopy',
      classifiedGroup: 'e-shopy',
    })).toBe(true);
  });

  for (const classifiedGroup of ['jine', 'gastronomie']) {
    test(`auto-created e-shopy job rejects ${classifiedGroup}`, () => {
      expect(classificationMatchesJobScope({
        autoCreated: true,
        requestedGroup: 'e-shopy',
        classifiedGroup,
      })).toBe(false);
    });
  }

  test('a rejected category increments wrong_category and the funnel before continuing', () => {
    expect(categoryGuard).toContain('counters.wrong_category++;');
    expect(categoryGuard).toContain('bump("wrong_category");');
    expect(categoryGuard).toMatch(/bump\("wrong_category"\);\s+continue;/);
  });

  test('a rejected category cannot reach persistence or increment created_count', () => {
    expect(categoryGuard).not.toMatch(/sales_lead_propose|findVerifiedDiscoveryContact|created_count\+\+/);
    expect(afterCategoryGuard).toContain('const rpcName = verifiedContact');
    expect(afterCategoryGuard).toContain('counters.created_count++;');
  });

  test('manual discovery keeps accepting another classified category', () => {
    expect(classificationMatchesJobScope({
      autoCreated: false,
      requestedGroup: 'reklamni-agentury',
      classifiedGroup: 'gastronomie',
    })).toBe(true);
    expect(afterCategoryGuard).toContain(
      'cls.slug && validSlugs.has(cls.slug) ? cls.slug : null',
    );
  });

  test('website, identity, directory, dedupe, ARES and email protections remain in place', () => {
    for (const invariant of [
      'verifyDiscoveredCompanySite',
      'domainBelongsToCompanyName',
      'verifyCompanyWebsite',
      'aresByIco',
      'aresByName',
      'website_domain.eq.',
      'verifyEmailOnOfficialSourcePage',
    ]) {
      expect(worker).toContain(invariant);
    }
    expect(worker).not.toMatch(/resend|email_queue|send-sales-lead/i);
  });
});
