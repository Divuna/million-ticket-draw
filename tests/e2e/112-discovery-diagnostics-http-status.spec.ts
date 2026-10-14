import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import {
  appendDiagnosticsEntry,
  buildDiagnosticsEntry,
  generateCandidateUrlsWithDiagnostics,
} from '../../supabase/functions/_shared/companyCandidateSearch.ts';

// Diagnostika musí nést SKUTEČNÝ výsledek HTTP volání OpenAI, aby šlo bez
// console logs poznat příčinu nulového výsledku. DDG fallback byl odstraněn,
// takže OpenAI je jediný sledovaný zdroj.

const shared = fs.readFileSync('supabase/functions/_shared/companyCandidateSearch.ts', 'utf8').replace(/\r\n/g, '\n');

const realFetch = globalThis.fetch;
const GROUP = 'e-shopy';
const ROUND = 0;

let ddgFetchCount = 0;
type Responder = () => Response | Promise<Response>;
let onOpenAi: Responder = () => new Response(JSON.stringify({ output_text: '' }), { status: 200 });

/** Přesně to, co vrací přerušený fetch — bez čekání na reálný timeout. */
const abortError = () => Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
const networkError = () => Promise.reject(new TypeError('Failed to fetch'));

const openAiJson = (urls: string[]) =>
  new Response(JSON.stringify({ output_text: urls.join('\n') }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

async function runBatch() {
  return await generateCandidateUrlsWithDiagnostics({
    leadGroup: GROUP,
    round: ROUND,
    openaiKey: 'super-secret-key',
  });
}

test.beforeEach(() => {
  ddgFetchCount = 0;
  globalThis.fetch = (async (input: unknown) => {
    const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
    if (url.includes('api.openai.com')) return onOpenAi();
    if (url.includes('duckduckgo.com')) { ddgFetchCount += 1; return new Response('', { status: 200 }); }
    return new Response('', { status: 404 });
  }) as typeof fetch;
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
  onOpenAi = () => new Response(JSON.stringify({ output_text: '' }), { status: 200 });
});

test.describe('OpenAI — skutečný HTTP výsledek', () => {
  test('200 s použitelnými URL → status 200, error_type none', async () => {
    onOpenAi = () => openAiJson(['https://alza.cz']);

    const { diagnostics } = await runBatch();

    expect(diagnostics.openai_http_status).toBe(200);
    expect(diagnostics.openai_error_type).toBe('none');
    expect(diagnostics.fallback_reason).toBe('none');
    expect(ddgFetchCount).toBe(0);
  });

  test('429 → status 429 + http_error, bezpečně 0 kandidátů', async () => {
    onOpenAi = () => new Response(JSON.stringify({ error: { message: 'rate limit' } }), { status: 429 });

    const { diagnostics, urls } = await runBatch();

    expect(diagnostics.openai_http_status).toBe(429);
    expect(diagnostics.openai_error_type).toBe('http_error');
    expect(diagnostics.openai_raw_count).toBe(0);
    expect(urls).toEqual([]);
    expect(ddgFetchCount).toBe(0);
  });

  test('401 → status 401 + http_error', async () => {
    onOpenAi = () => new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401 });

    const { diagnostics } = await runBatch();

    expect(diagnostics.openai_http_status).toBe(401);
    expect(diagnostics.openai_error_type).toBe('http_error');
  });

  test('timeout/abort → status null + timeout, bezpečně 0 kandidátů', async () => {
    onOpenAi = abortError;

    const { diagnostics, urls } = await runBatch();

    expect(diagnostics.openai_http_status).toBeNull();
    expect(diagnostics.openai_error_type).toBe('timeout');
    expect(urls).toEqual([]);
    expect(ddgFetchCount).toBe(0);
  });

  test('síťová chyba → status null + network_error', async () => {
    onOpenAi = networkError;

    const { diagnostics, urls } = await runBatch();

    expect(diagnostics.openai_http_status).toBeNull();
    expect(diagnostics.openai_error_type).toBe('network_error');
    expect(urls).toEqual([]);
  });

  test('200 s nevalidním JSON → status 200 + parse_error', async () => {
    onOpenAi = () => new Response('{ tohle není JSON', { status: 200, headers: { 'content-type': 'application/json' } });

    const { diagnostics } = await runBatch();

    expect(diagnostics.openai_http_status).toBe(200);
    expect(diagnostics.openai_error_type).toBe('parse_error');
  });

  test('první chyba v dávce nezmizí pod pozdějším úspěchem', async () => {
    let call = 0;
    onOpenAi = () => {
      call += 1;
      return call === 1 ? new Response('{}', { status: 429 }) : openAiJson(['https://alza.cz']);
    };

    const { diagnostics } = await runBatch();

    expect(diagnostics.openai_http_status).toBe(429);
    expect(diagnostics.openai_error_type).toBe('http_error');
  });
});

test.describe('Uložený záznam a zpětná kompatibilita', () => {
  test('záznam nese HTTP diagnostiku, žádná DDG pole a žádný secret', async () => {
    onOpenAi = () => new Response('{}', { status: 401 });

    const { diagnostics } = await runBatch();
    const entry = buildDiagnosticsEntry({ round: 0, diagnostics, addedToPool: 0 });

    expect(entry.openai_http_status).toBe(401);
    expect(entry.openai_error_type).toBe('http_error');
    // Nové záznamy už DDG pole neobsahují.
    expect(entry).not.toHaveProperty('ddg_http_status');
    expect(entry).not.toHaveProperty('ddg_error_type');
    expect(entry).not.toHaveProperty('ddg_raw_count');
    expect(entry).not.toHaveProperty('ddg_usable_count');

    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain('super-secret-key');
    expect(serialized).not.toMatch(/bearer|authorization|api[_-]?key|sk-/i);
    expect(serialized).not.toContain('invalid api key');
    expect(JSON.parse(serialized)).toEqual(entry);
  });

  test('starý záznam s DDG poli zůstává čitelný a nepřepíše se', async () => {
    const legacyEntry = {
      round: 0,
      at: '2026-08-08T07:09:14.462Z',
      openai_raw_count: 0,
      openai_usable_count: 0,
      ddg_raw_count: 0,
      ddg_usable_count: 0,
      final_candidate_count: 0,
      fallback_reason: 'openai_empty' as const,
      openai_http_status: 429,
      openai_error_type: 'http_error',
      ddg_http_status: 202,
      ddg_error_type: 'none',
      added_to_pool: 0,
    };

    onOpenAi = () => new Response('{}', { status: 429 });
    const { diagnostics } = await runBatch();

    const history = appendDiagnosticsEntry(
      [legacyEntry],
      buildDiagnosticsEntry({ round: 1, diagnostics, addedToPool: 0 }),
    );

    expect(history).toHaveLength(2);
    expect(history[0]).toEqual(legacyEntry);
    expect(history[0].ddg_http_status).toBe(202);
    expect(history[1]).not.toHaveProperty('ddg_http_status');
    expect(JSON.parse(JSON.stringify(history))).toEqual(history);
  });
});

test.describe('Zdroj dat a kontrakt', () => {
  test('statusy pocházejí přímo z fetch odpovědi, ne z vedlejší kopie logiky', () => {
    expect(shared).toContain('httpStatus: res.status');
    expect(shared).toContain('errorType: classifyFetchError(err)');
    expect(shared).toContain('diagnostics.openai_http_status = result.httpStatus');
  });

  test('modul už neobsahuje DDG fallback ani jeho helpery', () => {
    expect(shared).not.toContain('searchDdg');
    expect(shared).not.toContain('parseDdg');
    expect(shared).not.toContain('DDG_TIMEOUT_MS');
    expect(shared).not.toContain('BROWSER_UA');
    expect(shared).not.toContain('duckduckgo.com/html');
    expect(shared).not.toContain('uddg=');
  });

  test('do diagnostiky se nikdy nedostane tělo odpovědi ani hlavičky', () => {
    const recordBlock = shared.split('const recordOpenAi =')[1]?.split('};')[0] ?? '';
    expect(recordBlock).not.toMatch(/res\.text\(\)|res\.json\(\)|headers|Authorization|openaiKey/i);
  });
});
