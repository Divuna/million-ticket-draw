import { test, expect } from '@playwright/test';
import {
  buildQueriesForRound,
  generateCandidateUrls,
  generateCandidateUrlsWithDiagnostics,
} from '../../supabase/functions/_shared/companyCandidateSearch.ts';

// Robustnost generování kandidátů (mockovaný fetch).
// OpenAI je JEDINÝ zdroj — DuckDuckGo fallback byl odstraněn, protože z Edge
// runtime vracel HTTP 202 bez výsledků. Kolo bez použitelných kandidátů musí
// skončit bezpečně prázdné, ne shodit job.

const realFetch = globalThis.fetch;

const GROUP = 'e-shopy';
const ROUND = 0;
// buildQueriesForRound vrací 2 dotazy na kolo → OpenAI se volá max 2×.
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

type Handler = (call: FetchCall, queryIndex: number) => Response | Promise<Response>;

let onOpenAi: Handler = () => openAiResponse([]);

test.beforeEach(() => {
  calls = [];
  onOpenAi = () => openAiResponse([]);
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
    const call: FetchCall = { url, init };
    calls.push(call);
    if (url.includes('api.openai.com')) return onOpenAi(call, openAiCalls().length - 1);
    return new Response('', { status: 404 });
  }) as typeof fetch;
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test('1) OpenAI vrátí použitelné URL → kandidáti se vrátí', async () => {
  onOpenAi = () => openAiResponse(['https://alza.cz/nabidka', 'https://kosik.cz']);

  const { urls, diagnostics } = await generateCandidateUrlsWithDiagnostics({
    leadGroup: GROUP,
    round: ROUND,
    openaiKey: 'test-key',
  });

  expect(openAiCalls()).toHaveLength(QUERIES_PER_ROUND);
  expect(urls).toEqual(['https://alza.cz/', 'https://kosik.cz/']);
  expect(diagnostics.fallback_reason).toBe('none');
  expect(diagnostics.openai_usable_count).toBeGreaterThan(0);
  expect(diagnostics.final_candidate_count).toBe(urls.length);
});

test('2) OpenAI vrátí 0 URL → bezpečně 0 kandidátů (openai_empty)', async () => {
  onOpenAi = () => openAiResponse([]);

  const { urls, diagnostics } = await generateCandidateUrlsWithDiagnostics({
    leadGroup: GROUP,
    round: ROUND,
    openaiKey: 'test-key',
  });

  expect(urls).toEqual([]);
  expect(diagnostics.openai_raw_count).toBe(0);
  expect(diagnostics.openai_usable_count).toBe(0);
  expect(diagnostics.fallback_reason).toBe('openai_empty');
});

test('3) OpenAI vrátí jen zakázané/nepoužitelné URL → bezpečně 0 kandidátů', async () => {
  onOpenAi = () => openAiResponse([
    'https://www.heureka.cz/e-shopy',
    'https://facebook.com/nejakyeshop',
    'https://firmy.cz/detail/123',
  ]);

  const { urls, diagnostics } = await generateCandidateUrlsWithDiagnostics({
    leadGroup: GROUP,
    round: ROUND,
    openaiKey: 'test-key',
  });

  expect(urls).toEqual([]);
  expect(diagnostics.openai_raw_count).toBeGreaterThan(0);
  expect(diagnostics.openai_usable_count).toBe(0);
  expect(diagnostics.fallback_reason).toBe('openai_no_usable_candidates');
});

test('4) duplicity napříč dotazy → výsledek je deduplikovaný', async () => {
  onOpenAi = (_call, index) =>
    openAiResponse(index === 0
      ? ['https://alza.cz', 'https://kosik.cz']
      : ['https://www.alza.cz/akce', 'https://ALZA.cz/jine', 'https://dm.cz']);

  const { urls, diagnostics } = await generateCandidateUrlsWithDiagnostics({
    leadGroup: GROUP,
    round: ROUND,
    openaiKey: 'test-key',
  });

  expect(urls).toEqual(['https://alza.cz/', 'https://kosik.cz/', 'https://dm.cz/']);
  const hosts = urls.map((u) => new URL(u).hostname);
  expect(new Set(hosts).size).toBe(hosts.length);
  expect(diagnostics.final_candidate_count).toBe(3);
});

test('5) chyba OpenAI → bezpečně 0 kandidátů, žádná výjimka', async () => {
  onOpenAi = () => new Response(JSON.stringify({ error: { message: 'rate limit' } }), { status: 429 });

  const urls = await generateCandidateUrls({ leadGroup: GROUP, round: ROUND, openaiKey: 'test-key' });

  expect(urls).toEqual([]);
});

test('6) DDG se nikdy nevolá — fallback je odstraněn', async () => {
  // Ani při úspěchu, ani při prázdném výsledku, ani při chybě OpenAI.
  for (const responder of [
    () => openAiResponse(['https://alza.cz']),
    () => openAiResponse([]),
    () => new Response('{}', { status: 429 }),
  ] as Handler[]) {
    calls = [];
    onOpenAi = responder;
    await generateCandidateUrls({ leadGroup: GROUP, round: ROUND, openaiKey: 'test-key' });
    expect(ddgCalls()).toHaveLength(0);
    expect(calls.every((c) => c.url.includes('api.openai.com'))).toBe(true);
  }
});

test('7) bez klíče se nevolá nic a vrátí se 0 kandidátů', async () => {
  const { urls, diagnostics } = await generateCandidateUrlsWithDiagnostics({
    leadGroup: GROUP,
    round: ROUND,
  });

  expect(calls).toHaveLength(0);
  expect(urls).toEqual([]);
  expect(diagnostics.openai_error_type).toBe('not_called');
  expect(diagnostics.final_candidate_count).toBe(0);
});

test('diagnostika obsahuje jen bezpečné počty a stav, žádný klíč ani token', async () => {
  onOpenAi = () => openAiResponse(['https://alza.cz']);

  const { diagnostics } = await generateCandidateUrlsWithDiagnostics({
    leadGroup: GROUP,
    round: ROUND,
    openaiKey: 'super-secret-key',
  });

  expect(Object.keys(diagnostics).sort()).toEqual([
    'fallback_reason',
    'final_candidate_count',
    'openai_error_type',
    'openai_http_status',
    'openai_raw_count',
    'openai_usable_count',
  ]);
  expect(JSON.stringify(diagnostics)).not.toContain('super-secret-key');
});
