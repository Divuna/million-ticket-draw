import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import {
  appendDiagnosticsEntry,
  buildDiagnosticsEntry,
  generateCandidateUrlsWithDiagnostics,
  MAX_DIAGNOSTICS_ENTRIES,
  type CandidateSearchDiagnosticsEntry,
} from '../../supabase/functions/_shared/companyCandidateSearch.ts';

// Diagnostika vyhledávání kandidátů musí přežít mimo console.log Edge Function —
// ukládá se k discovery jobu do sloupce `search_diagnostics` a čte se běžným SQL.
// Zde: (a) migrace, (b) zapojení ve workeru, (c) chování pure helperů.

const read = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const migration = read('supabase/migrations/20260808100000_sales_lead_discovery_search_diagnostics.sql');
const worker = read('supabase/functions/sales-lead-discover/index.ts');
const shared = read('supabase/functions/_shared/companyCandidateSearch.ts');

const REQUIRED_KEYS = [
  'openai_raw_count',
  'openai_usable_count',
  'final_candidate_count',
  'fallback_reason',
] as const;

test.describe('Migrace — sloupec search_diagnostics', () => {
  test('přidává jsonb sloupec s prázdným polem jako defaultem, idempotentně', () => {
    expect(migration).toContain('ALTER TABLE public.sales_lead_discovery_jobs');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS search_diagnostics jsonb');
    expect(migration).toContain("NOT NULL DEFAULT '[]'::jsonb");
    expect(migration).toContain('BEGIN;');
    expect(migration).toContain('COMMIT;');
  });

  test('vynucuje, že hodnota je JSON pole (historie kol, ne poslední hodnota)', () => {
    expect(migration).toContain("jsonb_typeof(search_diagnostics) = 'array'");
    expect(migration).toContain('sales_lead_discovery_jobs_search_diagnostics_is_array');
  });

  test('je aditivní — nemění policy, RPC, scheduler ani jiné sloupce', () => {
    expect(migration).not.toMatch(/CREATE POLICY|DROP POLICY|ALTER POLICY/i);
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION|DROP FUNCTION/i);
    expect(migration).not.toMatch(/cron\.(schedule|unschedule)/i);
    expect(migration).not.toMatch(/DROP COLUMN|ALTER COLUMN|DROP TABLE|TRUNCATE/i);
    expect(migration).not.toMatch(/email_queue|resend|automation/i);
  });

  test('spustitelné SQL nesahá na vault ani na žádný secret', () => {
    // Komentáře o secretech jsou dokumentace, ne chování — testuj jen SQL příkazy.
    const sqlOnly = migration
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(sqlOnly).not.toMatch(/vault|decrypted_secret|api[_-]?key|bearer|sk-/i);
  });
});

test.describe('Worker — zápis diagnostiky k jobu', () => {
  test('používá variantu s diagnostikou místo holého generateCandidateUrls', () => {
    expect(worker).toContain('generateCandidateUrlsWithDiagnostics');
    expect(worker).toContain('const { urls: fresh, diagnostics }');
  });

  test('načte předchozí historii z jobu a jen k ní připisuje', () => {
    expect(worker).toContain('job.search_diagnostics');
    expect(worker).toContain('appendDiagnosticsEntry(');
    expect(worker).toContain('buildDiagnosticsEntry(');
  });

  test('persistuje search_diagnostics do sales_lead_discovery_jobs', () => {
    expect(worker).toContain('search_diagnostics: searchDiagnostics');
    const update = worker.split('.from("sales_lead_discovery_jobs").update(')[1] ?? '';
    expect(update).toContain('search_diagnostics');
  });

  test('neposílá do diagnostiky klíč ani token', () => {
    const block = worker.split('buildDiagnosticsEntry(')[1]?.split('});')[0] ?? '';
    expect(block).not.toMatch(/openaiKey|apiKey|token|authorization/i);
  });

  test('algoritmus hledání zůstal beze změny (kola, dedupe, prázdná kola)', () => {
    expect(worker).toContain('const added = fresh.filter((u) => !pool.includes(u));');
    expect(worker).toContain('searchRounds++');
    expect(worker).toContain('emptyRounds >= MAX_EMPTY_ROUNDS');
    expect(worker).toContain('pool = [...pool, ...added];');
  });
});

test.describe('Helpery — tvar a historie záznamů', () => {
  const diagnostics = {
    openai_raw_count: 12,
    openai_usable_count: 0,
    final_candidate_count: 9,
    fallback_reason: 'openai_no_usable_candidates' as const,
    openai_http_status: 200,
    openai_error_type: 'none' as const,
  };

  test('záznam obsahuje všech 6 povinných počtů plus round a čas', () => {
    const entry = buildDiagnosticsEntry({ round: 2, diagnostics, addedToPool: 9, at: '2026-08-08T10:00:00.000Z' });
    for (const key of REQUIRED_KEYS) expect(entry).toHaveProperty(key);
    expect(entry.round).toBe(2);
    expect(entry.at).toBe('2026-08-08T10:00:00.000Z');
    expect(entry.added_to_pool).toBe(9);
    expect(entry.fallback_reason).toBe('openai_no_usable_candidates');
  });

  test('záznam neobsahuje žádný secret ani volný text dotazu', () => {
    const entry = buildDiagnosticsEntry({ round: 0, diagnostics, addedToPool: 0 });
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toMatch(/sk-|bearer|authorization|api[_-]?key|token/i);
    expect(Object.keys(entry).sort()).toEqual([
      'added_to_pool',
      'at',
      'fallback_reason',
      'final_candidate_count',
      'openai_error_type',
      'openai_http_status',
      'openai_raw_count',
      'openai_usable_count',
      'round',
    ]);
  });

  test('append zachová předchozí kola, nepřepíše je poslední hodnotou', () => {
    let history: CandidateSearchDiagnosticsEntry[] = [];
    for (const round of [0, 1, 2]) {
      history = appendDiagnosticsEntry(
        history,
        buildDiagnosticsEntry({ round, diagnostics, addedToPool: round }),
      );
    }
    expect(history).toHaveLength(3);
    expect(history.map((e) => e.round)).toEqual([0, 1, 2]);
    expect(history.map((e) => e.added_to_pool)).toEqual([0, 1, 2]);
  });

  test('append snese chybějící/nevalidní historii z DB', () => {
    const entry = buildDiagnosticsEntry({ round: 0, diagnostics, addedToPool: 1 });
    expect(appendDiagnosticsEntry(null, entry)).toHaveLength(1);
    expect(appendDiagnosticsEntry(undefined, entry)).toHaveLength(1);
    expect(appendDiagnosticsEntry({ not: 'an array' }, entry)).toHaveLength(1);
  });

  test('historie je zastropovaná a drží nejnovější kola', () => {
    let history: CandidateSearchDiagnosticsEntry[] = [];
    const total = MAX_DIAGNOSTICS_ENTRIES + 5;
    for (let round = 0; round < total; round++) {
      history = appendDiagnosticsEntry(history, buildDiagnosticsEntry({ round, diagnostics, addedToPool: 0 }));
    }
    expect(history).toHaveLength(MAX_DIAGNOSTICS_ENTRIES);
    expect(history[history.length - 1].round).toBe(total - 1);
    expect(history[0].round).toBe(total - MAX_DIAGNOSTICS_ENTRIES);
  });

  test('sdílený modul nikde neloguje klíč do diagnostiky', () => {
    const diagBlock = shared.split('export function buildDiagnosticsEntry')[1]?.split('export function appendDiagnosticsEntry')[0] ?? '';
    expect(diagBlock).not.toMatch(/openaiKey|apiKey|Authorization|Bearer/);
  });
});

test.describe('Reálná diagnostika ze search vrstvy je uložitelná', () => {
  const realFetch = globalThis.fetch;

  test.afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('výstup generateCandidateUrlsWithDiagnostics jde 1:1 do záznamu bez secretů', async () => {
    globalThis.fetch = (async (input: unknown) => {
      const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
      if (url.includes('api.openai.com')) {
        // OpenAI vrátí jen zakázané URL → žádný použitelný kandidát.
        return new Response(JSON.stringify({ output_text: 'https://www.heureka.cz/x https://facebook.com/y' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('', { status: 404 });
    }) as typeof fetch;

    const { diagnostics } = await generateCandidateUrlsWithDiagnostics({
      leadGroup: 'e-shopy',
      round: 0,
      openaiKey: 'super-secret-key',
    });
    const entry = buildDiagnosticsEntry({ round: 0, diagnostics, addedToPool: 0 });

    expect(entry.fallback_reason).toBe('openai_no_usable_candidates');
    expect(entry.openai_raw_count).toBeGreaterThan(0);
    expect(entry.openai_usable_count).toBe(0);
    expect(entry.final_candidate_count).toBe(0);
    expect(JSON.stringify(entry)).not.toContain('super-secret-key');
    // Musí projít JSON round-tripem (ukládá se do jsonb sloupce).
    expect(JSON.parse(JSON.stringify(entry))).toEqual(entry);
  });
});
