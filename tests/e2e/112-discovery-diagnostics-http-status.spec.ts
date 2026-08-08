import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import {
  appendDiagnosticsEntry,
  buildDiagnosticsEntry,
  buildQueriesForRound,
  generateCandidateUrlsWithDiagnostics,
} from '../../supabase/functions/_shared/companyCandidateSearch.ts';

// Diagnostika musí nést SKUTEČNÝ výsledek HTTP volání obou zdrojů, aby šlo bez
// console logs poznat, zda selhal OpenAI, DDG, nebo oba — a proč.

const shared = fs.readFileSync('supabase/functions/_shared/companyCandidateSearch.ts', 'utf8').replace(/\r\n/g, '\n');

const realFetch = globalThis.fetch;
const GROUP = 'e-shopy';
const ROUND = 0;
const QUERIES_PER_ROUND = buildQueriesForRound(GROUP, ROUND).length;

type Responder = () => Response | Promise<Response>;

let onOpenAi: Responder = () => new Response(JSON.stringify({ output_text: '' }), { status: 200 });
let onDdg: Responder = () => new Response('<html></html>', { status: 200 });

/** Přesně to, co vrací přerušený fetch — bez čekání na reálný timeout. */
const abortError = () => Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
const networkError = () => Promise.reject(new TypeError('Failed to fetch'));

const ddgHtml = (url: string) =>
  new Response(`<a href="//duckduckgo.com/l/?uddg=${encodeURIComponent(url)}&rut=x">o</a>`, {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });

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
  globalThis.fetch = (async (input: unknown) => {
    const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
    if (url.includes('api.openai.com')) return onOpenAi();
    if (url.includes('duckduckgo.com')) return onDdg();
    return new Response('', { status: 404 });
  }) as typeof fetch;
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
  onOpenAi = () => new Response(JSON.stringify({ output_text: '' }), { status: 200 });
  onDdg = () => new Response('<html></html>', { status: 200 });
});

test.describe('OpenAI — skutečný HTTP výsledek', () => {
  test('200 s použitelnými URL → status 200, error_type none, DDG se nevolá', async () => {
    onOpenAi = () => openAiJson(['https://alza.cz']);

    const { diagnostics } = await runBatch();

    expect(diagnostics.openai_http_status).toBe(200);
    expect(diagnostics.openai_error_type).toBe('none');
    expect(diagnostics.ddg_http_status).toBeNull();
    expect(diagnostics.ddg_error_type).toBe('not_called');
    expect(diagnostics.fallback_reason).toBe('none');
  });

  test('401 → status 401 + http_error', async () => {
    onOpenAi = () => new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401 });
    onDdg = () => ddgHtml('https://kosik.cz');

    const { diagnostics } = await runBatch();

    expect(diagnostics.openai_http_status).toBe(401);
    expect(diagnostics.openai_error_type).toBe('http_error');
    expect(diagnostics.openai_raw_count).toBe(0);
  });

  test('429 → status 429 + http_error', async () => {
    onOpenAi = () => new Response(JSON.stringify({ error: { message: 'rate limit' } }), { status: 429 });
    onDdg = () => ddgHtml('https://kosik.cz');

    const { diagnostics } = await runBatch();

    expect(diagnostics.openai_http_status).toBe(429);
    expect(diagnostics.openai_error_type).toBe('http_error');
  });

  test('timeout/abort → status null + timeout', async () => {
    onOpenAi = abortError;
    onDdg = () => ddgHtml('https://kosik.cz');

    const { diagnostics } = await runBatch();

    expect(diagnostics.openai_http_status).toBeNull();
    expect(diagnostics.openai_error_type).toBe('timeout');
  });

  test('síťová chyba → status null + network_error', async () => {
    onOpenAi = networkError;
    onDdg = () => ddgHtml('https://kosik.cz');

    const { diagnostics } = await runBatch();

    expect(diagnostics.openai_http_status).toBeNull();
    expect(diagnostics.openai_error_type).toBe('network_error');
  });

  test('200 s nevalidním JSON → status 200 + parse_error', async () => {
    onOpenAi = () => new Response('{ tohle není JSON', { status: 200, headers: { 'content-type': 'application/json' } });
    onDdg = () => ddgHtml('https://kosik.cz');

    const { diagnostics } = await runBatch();

    expect(diagnostics.openai_http_status).toBe(200);
    expect(diagnostics.openai_error_type).toBe('parse_error');
  });
});

test.describe('DDG — skutečný HTTP výsledek', () => {
  test('200 → status 200 + none', async () => {
    onOpenAi = () => openAiJson([]);
    onDdg = () => ddgHtml('https://decathlon.cz');

    const { diagnostics, urls } = await runBatch();

    expect(diagnostics.ddg_http_status).toBe(200);
    expect(diagnostics.ddg_error_type).toBe('none');
    expect(urls).toEqual(['https://decathlon.cz/']);
  });

  test('403 → status 403 + http_error', async () => {
    onOpenAi = () => openAiJson([]);
    onDdg = () => new Response('blocked', { status: 403 });

    const { diagnostics, urls } = await runBatch();

    expect(diagnostics.ddg_http_status).toBe(403);
    expect(diagnostics.ddg_error_type).toBe('http_error');
    expect(diagnostics.ddg_raw_count).toBe(0);
    expect(urls).toEqual([]);
  });

  test('timeout/abort → status null + timeout, job nespadne', async () => {
    onOpenAi = () => openAiJson([]);
    onDdg = abortError;

    const { diagnostics, urls } = await runBatch();

    expect(diagnostics.ddg_http_status).toBeNull();
    expect(diagnostics.ddg_error_type).toBe('timeout');
    expect(urls).toEqual([]);
  });
});

test.describe('Chování a bezpečnost', () => {
  test('při selhání OpenAI DDG fallback stále funguje a dodá kandidáty', async () => {
    onOpenAi = () => new Response('{}', { status: 401 });
    onDdg = () => ddgHtml('https://dm.cz');

    const { urls, diagnostics } = await runBatch();

    expect(urls).toEqual(['https://dm.cz/']);
    expect(diagnostics.openai_error_type).toBe('http_error');
    expect(diagnostics.ddg_error_type).toBe('none');
    expect(diagnostics.ddg_usable_count).toBeGreaterThan(0);
  });

  test('oba zdroje selžou → 0 kandidátů, oba statusy zachyceny, bez výjimky', async () => {
    onOpenAi = () => new Response('{}', { status: 401 });
    onDdg = () => new Response('blocked', { status: 403 });

    const { urls, diagnostics } = await runBatch();

    expect(urls).toEqual([]);
    expect(diagnostics.openai_http_status).toBe(401);
    expect(diagnostics.ddg_http_status).toBe(403);
    expect(diagnostics.openai_error_type).toBe('http_error');
    expect(diagnostics.ddg_error_type).toBe('http_error');
  });

  test('první chyba v dávce nezmizí pod pozdějším úspěchem', async () => {
    let call = 0;
    onOpenAi = () => {
      call += 1;
      return call === 1
        ? new Response('{}', { status: 429 })
        : openAiJson(['https://alza.cz']);
    };
    onDdg = () => ddgHtml('https://kosik.cz');

    const { diagnostics } = await runBatch();

    expect(QUERIES_PER_ROUND).toBeGreaterThan(1);
    expect(diagnostics.openai_http_status).toBe(429);
    expect(diagnostics.openai_error_type).toBe('http_error');
  });

  test('uložený záznam nese HTTP diagnostiku a žádný secret', async () => {
    onOpenAi = () => new Response('{}', { status: 401 });
    onDdg = () => new Response('blocked', { status: 403 });

    const { diagnostics } = await runBatch();
    const entry = buildDiagnosticsEntry({ round: 0, diagnostics, addedToPool: 0 });

    expect(entry.openai_http_status).toBe(401);
    expect(entry.openai_error_type).toBe('http_error');
    expect(entry.ddg_http_status).toBe(403);
    expect(entry.ddg_error_type).toBe('http_error');

    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain('super-secret-key');
    expect(serialized).not.toMatch(/bearer|authorization|api[_-]?key|sk-|user-agent/i);
    // Nikdy neukládáme tělo odpovědi ani hlavičky.
    expect(serialized).not.toContain('blocked');
    expect(serialized).not.toContain('invalid api key');
    expect(JSON.parse(serialized)).toEqual(entry);
  });

  test('starý záznam bez nových polí zůstává validní a nepřepíše se', async () => {
    const legacyEntry = {
      round: 0,
      at: '2026-08-08T05:15:14.462Z',
      openai_raw_count: 0,
      openai_usable_count: 0,
      ddg_raw_count: 0,
      ddg_usable_count: 0,
      final_candidate_count: 0,
      fallback_reason: 'openai_empty',
      added_to_pool: 0,
    };

    onOpenAi = () => new Response('{}', { status: 401 });
    onDdg = () => new Response('blocked', { status: 403 });
    const { diagnostics } = await runBatch();

    // Historie z DB může obsahovat staré i nové záznamy vedle sebe.
    const history = appendDiagnosticsEntry(
      [legacyEntry],
      buildDiagnosticsEntry({ round: 1, diagnostics, addedToPool: 0 }),
    );

    expect(history).toHaveLength(2);
    expect(history[0]).toEqual(legacyEntry);
    expect(history[0]).not.toHaveProperty('openai_http_status');
    expect(history[1].openai_http_status).toBe(401);
    expect(JSON.parse(JSON.stringify(history))).toEqual(history);
  });
});

test.describe('Zdroj dat a kontrakt', () => {
  test('statusy pocházejí přímo z fetch odpovědi, ne z vedlejší kopie logiky', () => {
    expect(shared).toContain('httpStatus: res.status');
    expect(shared).toContain('errorType: classifyFetchError(err)');
    expect(shared).toContain('httpStatus: null');
    // Diagnostika jen přebírá, co vrátilo volání zdroje.
    expect(shared).toContain('diagnostics.openai_http_status = result.httpStatus');
    expect(shared).toContain('diagnostics.ddg_http_status = result.httpStatus');
  });

  test('do diagnostiky se nikdy nedostane tělo odpovědi ani hlavičky', () => {
    const recordBlock = shared.split('const recordSource =')[1]?.split('};')[0] ?? '';
    expect(recordBlock).not.toMatch(/res\.text\(\)|res\.json\(\)|headers|Authorization|openaiKey/i);
  });
});
