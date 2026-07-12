import { test, expect } from '@playwright/test';
import { verifyCompanyWebsite } from '../../supabase/functions/_shared/companyWebsiteVerifier.ts';
import { crawlCompanyWebsite } from '../../supabase/functions/_shared/companyEmailCrawler.ts';
import { parseDuckDuckGoResults, findOfficialWebsiteCandidates, extractUrlsFromResponses } from '../../supabase/functions/_shared/companyWebsiteSearch.ts';

// Behaviorální testy verifieru a e-mailového crawleru s mockovaným fetch.
// Pokrývají scénáře z požadavku: správný web, špatná AI doména, přesměrování na
// oficiální doménu, zaparkovaná/prázdná doména, web jiné firmy, IČO shoda,
// veřejný e-mail na kontaktu, e-mail na cizí tech doméně, ověřený web bez e-mailu.

const realFetch = globalThis.fetch;

// Nastaví se v každém testu před voláním.
let pages: Record<string, { status?: number; location?: string; body?: string; contentType?: string }> = {};
let aresJson: unknown = { ekonomickeSubjekty: [] };

function normalizeKey(url: string): string {
  try { return new URL(url).toString(); } catch { return url; }
}

test.beforeEach(() => {
  pages = {};
  aresJson = { ekonomickeSubjekty: [] };
  globalThis.fetch = (async (input: unknown, _init?: unknown) => {
    const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
    if (url.includes('ares.gov.cz')) {
      return new Response(JSON.stringify(aresJson), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const p = pages[normalizeKey(url)] ?? pages[url];
    if (!p) return new Response('', { status: 404 });
    if (p.status && p.status >= 300 && p.status < 400) {
      return new Response(null, { status: p.status, headers: { location: p.location ?? '' } });
    }
    return new Response(p.body ?? '', {
      status: p.status ?? 200,
      headers: { 'content-type': p.contentType ?? 'text/html; charset=utf-8' },
    });
  }) as typeof fetch;
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

const filler = ' Vítejte na našem oficiálním webu. Nabízíme kvalitní služby a produkty pro naše zákazníky po celé České republice. '.repeat(4);

test('správný oficiální web s identitou firmy je potvrzen', async () => {
  pages['https://testfirma.cz/'] = { body: `<html><body><h1>Testfirma s.r.o.</h1>${filler}<a href="/kontakt">Kontakt</a> © 2026 Testfirma s.r.o.</body></html>` };
  const r = await verifyCompanyWebsite({ companyName: 'Testfirma s.r.o.', ico: null, candidates: [{ url: 'https://testfirma.cz', source: 'web_search' }] });
  expect(r.status).toBe('verified');
  expect(r.website).toBe('https://testfirma.cz/');
  expect(r.confidence).toBeGreaterThanOrEqual(88);
});

test('web navržený AI, který patří jiné firmě, se nepotvrdí', async () => {
  pages['https://wrong-shop.cz/'] = { body: `<html><body><h1>Úplně jiná značka XYZ</h1>${filler} Kontakt © 2026 Jiná firma</body></html>` };
  const r = await verifyCompanyWebsite({ companyName: 'Testfirma s.r.o.', ico: null, candidates: [{ url: 'https://wrong-shop.cz', source: 'AI candidate' }] });
  expect(r.status).toBe('unverified');
  expect(r.website).toBeNull();
});

test('přesměrování se sleduje a ověří se finální oficiální doména', async () => {
  pages['https://firma.cz/'] = { status: 301, location: 'https://www.firma.cz/cs/' };
  pages['https://www.firma.cz/cs/'] = { body: `<html><body><h1>Firma s.r.o.</h1>${filler} Kontakt © Firma s.r.o.</body></html>` };
  const r = await verifyCompanyWebsite({ companyName: 'Firma s.r.o.', ico: null, candidates: [{ url: 'https://firma.cz', source: 'web_search' }] });
  expect(r.status).toBe('verified');
  expect(r.website).toBe('https://www.firma.cz/cs/');
});

test('zaparkovaná doména je zamítnuta', async () => {
  pages['https://parked.cz/'] = { body: `<html><body>Tato doména je na prodej. Doména je na prodej.${filler}</body></html>` };
  const r = await verifyCompanyWebsite({ companyName: 'Parked s.r.o.', ico: null, candidates: [{ url: 'https://parked.cz', source: 'web_search' }] });
  expect(r.status).toBe('unverified');
  expect(r.website).toBeNull();
});

test('prázdný web je zamítnut', async () => {
  pages['https://empty.cz/'] = { body: '<html><body>Ahoj</body></html>' };
  const r = await verifyCompanyWebsite({ companyName: 'Empty s.r.o.', ico: null, candidates: [{ url: 'https://empty.cz', source: 'web_search' }] });
  expect(r.status).toBe('unverified');
  expect(r.website).toBeNull();
});

test('shoda podle IČO má nejvyšší důvěru (100)', async () => {
  aresJson = { obchodniJmeno: 'Kofola a.s.', ico: '12345678' };
  pages['https://kofola.cz/'] = { body: `<html><body><h1>Kofola a.s.</h1>${filler} IČO: 12345678 Kontakt © Kofola</body></html>` };
  const r = await verifyCompanyWebsite({ companyName: 'Kofola a.s.', ico: '12345678', candidates: [{ url: 'https://kofola.cz', source: 'web_search' }] });
  expect(r.status).toBe('verified');
  expect(r.confidence).toBe(100);
  expect(r.website).toBe('https://kofola.cz/');
});

test('crawler najde veřejný e-mail na kontaktní stránce', async () => {
  pages['https://firma.cz/'] = { body: `<html><body><h1>Firma</h1><a href="/kontakt">Kontakt</a></body></html>` };
  pages['https://firma.cz/kontakt'] = { body: `<html><body>Napište nám: <a href="mailto:info@firma.cz">info@firma.cz</a></body></html>` };
  const r = await crawlCompanyWebsite('https://firma.cz/', '', '');
  expect(r.found).toBe(true);
  if (r.found) {
    expect(r.email).toBe('info@firma.cz');
    expect(r.sourceUrl).toBe('https://firma.cz/kontakt');
  }
});

test('crawler ignoruje e-mail na cizí technické doméně', async () => {
  pages['https://firma2.cz/'] = { body: `<html><body>Web běží na <a href="mailto:noreply@sentry.io">noreply@sentry.io</a> a support@readymag.com</body></html>` };
  const r = await crawlCompanyWebsite('https://firma2.cz/', '', '');
  expect(r.found).toBe(false);
});

test('ověřený web bez e-mailu vrátí found:false', async () => {
  pages['https://firma3.cz/'] = { body: `<html><body><h1>Firma 3</h1><p>Žádný kontaktní e-mail zde není uveden.</p></body></html>` };
  const r = await crawlCompanyWebsite('https://firma3.cz/', '', '');
  expect(r.found).toBe(false);
});

test('extractUrlsFromResponses vytáhne URL z anotací I z textu (markdown)', () => {
  const json = {
    output: [
      {
        content: [
          {
            text: 'Oficiální web reklamní agentury DDB Prague je [www.ddb.cz](https://www.ddb.cz/).',
            annotations: [{ type: 'url_citation', url: 'https://cited-source.cz/o-nas' }],
          },
        ],
      },
    ],
  };
  const urls = extractUrlsFromResponses(json as never);
  expect(urls).toContain('https://cited-source.cz/o-nas');
  expect(urls.some((u) => u.startsWith('https://www.ddb.cz'))).toBe(true);
});

test('parseDuckDuckGoResults vytáhne cílové URL z DDG výsledků', () => {
  const html =
    `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent('https://ddb.about95.cz/')}&rut=x">DDB</a>` +
    `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent('https://www.firmy.cz/detail/485098-ddb.html')}&rut=y">firmy</a>`;
  const urls = parseDuckDuckGoResults(html);
  expect(urls).toContain('https://ddb.about95.cz/');
  expect(urls.some((u) => u.includes('firmy.cz'))).toBe(true);
});

test('findOfficialWebsiteCandidates najde reálný web a odfiltruje katalog', async () => {
  const html =
    `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent('https://ddb.about95.cz/o-nas')}&rut=x">DDB</a>` +
    `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent('https://www.firmy.cz/detail/485098-ddb.html')}&rut=y">firmy</a>`;
  globalThis.fetch = (async () =>
    new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })) as typeof fetch;
  const cands = await findOfficialWebsiteCandidates({ companyName: 'DDB Prague', city: 'Praha' });
  expect(cands.map((c) => c.url)).toContain('https://ddb.about95.cz/');
  expect(cands.some((c) => c.url.includes('firmy.cz'))).toBe(false);
});
