import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import {
  domainBelongsToCompanyName,
  verifyCompanyWebsite,
  verifyDiscoveredCompanySite,
} from '../../supabase/functions/_shared/companyWebsiteVerifier.ts';

// Regrese k reálnému nálezu ze stagingu: web `czorg.eu` (adresář firem) byl
// spojen s právnickou osobou `Seznam.cz, a.s.`. Testy jedou proti stubnutému
// `fetch`, takže nesahají na síť ani na žádné prostředí.

const read = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const worker = read('supabase/functions/sales-lead-discover/index.ts');

const html = (body: string) => `<!doctype html><html><head><title>${body.slice(0, 40)}</title></head><body>${body}</body></html>`;

/** Adresář firem, který na homepage vypisuje IČO cizí firmy. */
const DIRECTORY_PAGE = html(`
  <h1>Adresář firem v České republice</h1>
  <p>Najděte ověřené firmy ve vašem městě — recenze, mapy a údaje z ARES.
  Přidat firmu. Kategorie, města, kontakt, obchodní podmínky, copyright 2026.</p>
  <ul><li>Seznam.cz, a.s. — IČO: 26168685 — Praha</li>
  <li>Alza.cz a.s. — Praha</li><li>Rohlik.cz — Praha</li></ul>
  ${'Další firmy v adresáři. '.repeat(20)}
`);

/** Běžný firemní web bez IČO, jehož název odpovídá doméně. */
const COMPANY_PAGE = html(`
  <h1>Kolonial Nábytek</h1>
  <p>Vítejte v e-shopu Kolonial Nábytek. Kontakt, obchodní podmínky, košík,
  objednat. Provozovatel: Kolonial Nábytek. Copyright 2026.</p>
  ${'Nabízíme nábytek do obývacího pokoje. '.repeat(20)}
`);

type FetchStub = (url: string) => { status?: number; body: string } | null;

async function withFetch<T>(stub: FetchStub, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    const url = String(typeof input === 'string' ? input : (input as Request).url);
    const hit = stub(url);
    if (!hit) return new Response('not found', { status: 404 });
    return new Response(hit.body, {
      status: hit.status ?? 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }) as typeof globalThis.fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test.describe('Adresář firem nesmí projít jako web firmy', () => {
  test('verifyDiscoveredCompanySite adresář zamítne, i když na něm je IČO', async () => {
    const site = await withFetch(
      (url) => (url.includes('czorg.eu') ? { body: DIRECTORY_PAGE } : null),
      () => verifyDiscoveredCompanySite('https://czorg.eu/'),
    );
    expect(site.verified).toBe(false);
    expect(site.reason).toBe('company_directory');
    // Cizí IČO se z adresáře nesmí vůbec vynést dál.
    expect(site.icoOnPage).toBeNull();
  });

  test('verifyCompanyWebsite adresář nepotvrdí ani při shodě IČO', async () => {
    const result = await withFetch(
      (url) => {
        if (url.includes('ares.gov.cz')) {
          return { body: JSON.stringify({ obchodniJmeno: 'Seznam.cz, a.s.', ico: '26168685' }) };
        }
        return url.includes('czorg.eu') ? { body: DIRECTORY_PAGE } : null;
      },
      () => verifyCompanyWebsite({
        companyName: 'Seznam.cz, a.s.',
        ico: '26168685',
        candidates: [{ url: 'https://czorg.eu/', source: 'discovery_candidate' }],
      }),
    );
    expect(result.status).toBe('unverified');
    expect(result.website).toBeNull();
    expect(result.alternatives[0]?.reason).toBe('company_directory');
  });

  test('běžný firemní web zůstává ověřitelný — kontrola se nezpřísnila plošně', async () => {
    const site = await withFetch(
      (url) => (url.includes('kolonialnabytek.cz') ? { body: COMPANY_PAGE } : null),
      () => verifyDiscoveredCompanySite('https://kolonialnabytek.cz/'),
    );
    expect(site.verified).toBe(true);
    expect(site.website).toContain('kolonialnabytek.cz');
  });
});

test.describe('Web A + název z webu → ARES vrátí firmu B', () => {
  test('cizí právnická osoba nesmí být přijata bez důkazu vazby na doménu', () => {
    // Přesný scénář ze zadání: doména neodpovídá názvu firmy z ARES.
    expect(domainBelongsToCompanyName('https://czorg.eu/', 'Seznam.cz, a.s.')).toBe(false);
    expect(domainBelongsToCompanyName('https://eshop-darky.cz/', 'Alza.cz a.s.')).toBe(false);
    // Ani kořen cizí domény identitu neprokáže — IČO tudy „nezachrání" vazbu.
    expect(domainBelongsToCompanyName('https://czorg.eu', 'Seznam.cz, a.s.')).toBe(false);
  });

  test('doména, která název firmy nese, projde dál', () => {
    expect(domainBelongsToCompanyName('https://seznam.cz/', 'Seznam.cz, a.s.')).toBe(true);
    expect(domainBelongsToCompanyName('https://eshop.taran.cz/', 'TARAN s.r.o.')).toBe(true);
  });

  test('worker použije shodu podle názvu jen s potvrzenou vazbou na doménu', () => {
    expect(worker).toContain('const byName = await aresByName(site.companyName);');
    expect(worker).toContain('domainBelongsToCompanyName(site.website, byName.legalName)');
    expect(worker).toContain('bump("ares_name_match_rejected")');
    // Bez potvrzení se ARES záznam nepoužije vůbec — název zůstane z webu.
    expect(worker).toContain('const name = reg?.legalName ?? site.companyName;');
  });

  test('IČO uvedené přímo na webu zůstává platným kotvením identity', () => {
    expect(worker).toContain('if (site.icoOnPage) reg = await aresByIco(site.icoOnPage);');
  });
});

test.describe('Diagnostika e-mailů se počítá jednou', () => {
  test('bump email_found/email_missing je ve smyčce právě jednou', () => {
    const occurrences = worker.split('bump(verifiedContact ? "email_found" : "email_missing")').length - 1;
    expect(occurrences).toBe(1);
  });
});
