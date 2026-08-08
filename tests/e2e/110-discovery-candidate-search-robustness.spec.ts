import { test, expect } from '@playwright/test';
import {
  buildQueriesForRound,
  generateCandidateUrls,
  generateCandidateUrlsWithDiagnostics,
} from '../../supabase/functions/_shared/companyCandidateSearch.ts';

// Behaviorální testy robustnosti generování kandidátů (mockovaný fetch).
// Pokrývají dvě potvrzené chyby:
//  1) searchDdg nepředával AbortController.signal do fetch → timeout se nevynutil,
//  2) DDG fallback se spouštěl jen při 0 vrácených URL, takže když OpenAI vrátila
//     samé zakázané/nepoužitelné URL, výsledek byl 0 kandidátů a DDG se nezavolalo.

const realFetch = globalThis.fetch;

const GROUP = 'e-shopy';
const ROUND = 0;
// buildQueriesForRound vrací 2 dotazy na kolo → každý zdroj se volá max 2×.
const QUERIES_PER_ROUND = buildQueriesForRound(GROUP, ROUND).length;

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

let calls: FetchCall[] = [];

const openAiCalls = () => calls.filter((c) => c.url.includes('api.openai.com'));
const ddgCalls = () => calls.filter((c) => c.url.includes('duckduckgo.com'));

/** Odpověď OpenAI Responses API s URL v textu (stejný tvar, jaký parser čte). */
function openAiResponse(urls: string[]): Response {
  return new Response(
    JSON.stringify({ output_text: `Seznam firem:\n${urls.join('\n')}` }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

/** DuckDuckGo HTML výsledek s odkazy ve tvaru ?uddg=<encoded>. */
function ddgResponse(urls: string[]): Response {
  const links = urls
    .map((u) => `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(u)}&rut=x">odkaz</a>`)
    .join('\n');
  return new Response(`<html><body>${links}</body></html>`, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

type Handler = (call: FetchCall, queryIndex: number) => Response | Promise<Response>;

let onOpenAi: Handler = () => openAiResponse([]);
let onDdg: Handler = () => ddgResponse([]);

test.beforeEach(() => {
  calls = [];
  onOpenAi = () => openAiResponse([]);
  onDdg = () => ddgResponse([]);
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
    const call: FetchCall = { url, init };
    calls.push(call);
    if (url.includes('api.openai.com')) return onOpenAi(call, openAiCalls().length - 1);
    if (url.includes('duckduckgo.com')) return onDdg(call, ddgCalls().length - 1);
    return new Response('', { status: 404 });
  }) as typeof fetch;
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test('1) OpenAI vrátí použitelné URL → DDG se vůbec nevolá', async () => {
  onOpenAi = () => openAiResponse(['https://alza.cz/nabidka', 'https://kosik.cz']);

  const { urls, diagnostics } = await generateCandidateUrlsWithDiagnostics({
    leadGroup: GROUP,
    round: ROUND,
    openaiKey: 'test-key',
  });

  expect(ddgCalls()).toHaveLength(0);
  expect(openAiCalls()).toHaveLength(QUERIES_PER_ROUND);
  expect(urls).toEqual(['https://alza.cz/', 'https://kosik.cz/']);
  expect(diagnostics.fallback_reason).toBe('none');
  expect(diagnostics.openai_usable_count).toBeGreaterThan(0);
  expect(diagnostics.ddg_raw_count).toBe(0);
  expect(diagnostics.final_candidate_count).toBe(urls.length);
});

test('2) OpenAI vrátí 0 URL → DDG fallback se spustí (openai_empty)', async () => {
  onOpenAi = () => openAiResponse([]);
  onDdg = () => ddgResponse(['https://decathlon.cz']);

  const { urls, diagnostics } = await generateCandidateUrlsWithDiagnostics({
    leadGroup: GROUP,
    round: ROUND,
    openaiKey: 'test-key',
  });

  expect(ddgCalls()).toHaveLength(QUERIES_PER_ROUND);
  expect(urls).toEqual(['https://decathlon.cz/']);
  expect(diagnostics.openai_raw_count).toBe(0);
  expect(diagnostics.openai_usable_count).toBe(0);
  expect(diagnostics.fallback_reason).toBe('openai_empty');
});

test('3) OpenAI vrátí jen zakázané/nepoužitelné URL → DDG fallback se spustí', async () => {
  // Regrese: dřív `urls.length !== 0` fallback přeskočilo a výsledek byl 0 kandidátů.
  onOpenAi = () => openAiResponse([
    'https://www.heureka.cz/e-shopy',
    'https://facebook.com/nejakyeshop',
    'https://firmy.cz/detail/123',
    'ftp://neplatny.example.com',
  ]);
  onDdg = () => ddgResponse(['https://dm.cz']);

  const { urls, diagnostics } = await generateCandidateUrlsWithDiagnostics({
    leadGroup: GROUP,
    round: ROUND,
    openaiKey: 'test-key',
  });

  expect(diagnostics.openai_raw_count).toBeGreaterThan(0);
  expect(diagnostics.openai_usable_count).toBe(0);
  expect(diagnostics.fallback_reason).toBe('openai_no_usable_candidates');
  expect(ddgCalls()).toHaveLength(QUERIES_PER_ROUND);
  expect(urls).toEqual(['https://dm.cz/']);
});

test('4) OpenAI + DDG vrátí duplicity → výsledek je deduplikovaný', async () => {
  // 1. dotaz: OpenAI dodá alza.cz. 2. dotaz: OpenAI nic → DDG vrátí alza znovu + kosik.
  onOpenAi = (_call, index) => openAiResponse(index === 0 ? ['https://alza.cz'] : []);
  onDdg = () => ddgResponse(['https://www.alza.cz/akce', 'https://kosik.cz', 'https://ALZA.cz/jine']);

  const { urls, diagnostics } = await generateCandidateUrlsWithDiagnostics({
    leadGroup: GROUP,
    round: ROUND,
    openaiKey: 'test-key',
  });

  expect(urls).toEqual(['https://alza.cz/', 'https://kosik.cz/']);
  const hosts = urls.map((u) => new URL(u).hostname);
  expect(new Set(hosts).size).toBe(hosts.length);
  expect(diagnostics.final_candidate_count).toBe(2);
});

test('5) DDG timeout skončí bezpečně prázdným výsledkem a job nespadne', async () => {
  // Stub odpoví až na abort — bez předaného signálu by fetch nikdy nedoběhl.
  test.setTimeout(90_000);
  onOpenAi = () => openAiResponse([]);
  onDdg = (call) => new Promise<Response>((_resolve, reject) => {
    const signal = call.init?.signal;
    if (!signal) return; // stará chyba: bez signálu visí až do timeoutu testu
    signal.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    });
  });

  const urls = await generateCandidateUrls({ leadGroup: GROUP, round: ROUND, openaiKey: 'test-key' });

  expect(urls).toEqual([]);
  expect(ddgCalls()).toHaveLength(QUERIES_PER_ROUND);
});

test('6) DDG fetch skutečně dostává AbortSignal', async () => {
  onOpenAi = () => openAiResponse([]);
  onDdg = () => ddgResponse(['https://expert.cz']);

  await generateCandidateUrls({ leadGroup: GROUP, round: ROUND, openaiKey: 'test-key' });

  const ddg = ddgCalls();
  expect(ddg.length).toBeGreaterThan(0);
  for (const call of ddg) {
    const signal = call.init?.signal;
    expect(signal).toBeTruthy();
    expect(typeof signal?.addEventListener).toBe('function');
    expect(signal?.aborted).toBe(false);
  }
});

test('7) chyba OpenAI + funkční DDG → kandidáti se vrátí', async () => {
  onOpenAi = () => new Response(JSON.stringify({ error: { message: 'unauthorized' } }), { status: 401 });
  onDdg = () => ddgResponse(['https://adidas.cz', 'https://www.reserved.com']);

  const { urls, diagnostics } = await generateCandidateUrlsWithDiagnostics({
    leadGroup: GROUP,
    round: ROUND,
    openaiKey: 'test-key',
  });

  // toHomepage zachovává `www.` v URL; strip se děje jen v dedupe klíči.
  expect(urls).toEqual(['https://adidas.cz/', 'https://www.reserved.com/']);
  expect(diagnostics.openai_usable_count).toBe(0);
  expect(diagnostics.ddg_usable_count).toBeGreaterThan(0);
  expect(diagnostics.fallback_reason).toBe('openai_empty');
});

test('8) oba zdroje prázdné → bezpečně 0 kandidátů bez výjimky', async () => {
  onOpenAi = () => openAiResponse([]);
  onDdg = () => ddgResponse([]);

  const { urls, diagnostics } = await generateCandidateUrlsWithDiagnostics({
    leadGroup: GROUP,
    round: ROUND,
    openaiKey: 'test-key',
  });

  expect(urls).toEqual([]);
  expect(diagnostics.final_candidate_count).toBe(0);
  expect(diagnostics.ddg_usable_count).toBe(0);
  expect(diagnostics.fallback_reason).toBe('openai_empty');
});

test('diagnostika obsahuje jen bezpečné počty a důvod, žádný klíč ani token', async () => {
  onOpenAi = () => openAiResponse(['https://alza.cz']);

  const { diagnostics } = await generateCandidateUrlsWithDiagnostics({
    leadGroup: GROUP,
    round: ROUND,
    openaiKey: 'super-secret-key',
  });

  expect(Object.keys(diagnostics).sort()).toEqual([
    'ddg_error_type',
    'ddg_http_status',
    'ddg_raw_count',
    'ddg_usable_count',
    'fallback_reason',
    'final_candidate_count',
    'openai_error_type',
    'openai_http_status',
    'openai_raw_count',
    'openai_usable_count',
  ]);
  expect(JSON.stringify(diagnostics)).not.toContain('super-secret-key');
});
