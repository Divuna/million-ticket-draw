import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import {
  canStartClassification,
  canStartSearchRound,
  DISCOVERY_COST_CAPS,
  directOpenAiCalls,
  emptyDiscoveryCostTelemetry,
  stopAfterCandidate,
  stopAfterSearchRound,
} from '../../supabase/functions/sales-lead-discover/discoveryCostGuard.ts';
import { generateCandidateUrlsWithDiagnostics } from '../../supabase/functions/_shared/companyCandidateSearch.ts';

const realFetch = globalThis.fetch;
let openAiCalls = 0;
let responder: () => Response | Promise<Response> = () => new Response(JSON.stringify({ output_text: '' }), { status: 200 });

function useMockProvider() {
  globalThis.fetch = (async (input: unknown) => {
    const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
    if (!url.includes('api.openai.com')) throw new Error('Unexpected non-OpenAI fetch in mock provider test');
    openAiCalls += 1;
    return responder();
  }) as typeof fetch;
}

test.beforeEach(() => {
  openAiCalls = 0;
  responder = () => new Response(JSON.stringify({ output_text: '' }), { status: 200 });
  useMockProvider();
});
test.afterEach(() => { globalThis.fetch = realFetch; });

for (const status of [429, 500]) {
  test(`provider HTTP ${status}: exactly one search call and terminal provider stop`, async () => {
    responder = () => new Response('{}', { status });
    const { urls, diagnostics } = await generateCandidateUrlsWithDiagnostics({ leadGroup: 'e-shopy', round: 0, openaiKey: 'mock-key' });
    expect(openAiCalls).toBe(1);
    expect(diagnostics.openai_api_calls).toBe(1);
    expect(urls).toEqual([]);
    expect(stopAfterSearchRound({ providerError: `http_${status}`, usableCandidates: 0 })).toBe('provider_error');
  });
}

test('one complete successful round with zero usable candidates stops without another round', async () => {
  const { urls, diagnostics } = await generateCandidateUrlsWithDiagnostics({ leadGroup: 'e-shopy', round: 0, openaiKey: 'mock-key' });
  expect(openAiCalls).toBe(2);
  expect(diagnostics.openai_api_calls).toBe(2);
  expect(urls).toEqual([]);
  expect(stopAfterSearchRound({ providerError: null, usableCandidates: 0 })).toBe('empty_search_round');
});

test('ten checked candidates without a created lead reaches the deterministic stop', () => {
  expect(stopAfterCandidate({ candidatesChecked: 9, createdCount: 0 })).toBeNull();
  expect(stopAfterCandidate({ candidatesChecked: 10, createdCount: 0 })).toBe('zero_created_after_10_candidates');
  expect(stopAfterCandidate({ candidatesChecked: 10, createdCount: 1 })).toBeNull();
});

test('hard direct-call cap is 24 and classification cap is 20', () => {
  const telemetry = emptyDiscoveryCostTelemetry();
  telemetry.search_api_calls = 4;
  telemetry.classification_api_calls = 20;
  expect(directOpenAiCalls(telemetry)).toBe(DISCOVERY_COST_CAPS.maxDirectOpenAiCalls);
  expect(canStartSearchRound({ searchRounds: 2, telemetry })).toBe('max_search_rounds_reached');
  expect(canStartClassification(telemetry)).toBe('max_classification_calls_reached');
});

test('worker and migration persist the server-side guard without touching e-mail delivery', () => {
  const worker = fs.readFileSync('supabase/functions/sales-lead-discover/index.ts', 'utf8');
  const migration = fs.readFileSync('supabase/migrations/20260819130000_sales_lead_discovery_cost_guard.sql', 'utf8');
  expect(worker).toContain('effectiveMaxCandidates(job.max_candidates)');
  expect(worker).toContain('stopAfterSearchRound');
  expect(worker).toContain('stopAfterCandidate');
  expect(worker).toContain('...costTelemetry');
  expect(migration).toContain('VALUES (v_group, 5, 20');
  expect(migration).toContain('search_api_calls');
  expect(migration).toContain('classification_api_calls');
  expect(migration).toContain('provider_errors');
  expect(migration).toContain('input_tokens');
  expect(migration).not.toMatch(/email_batch|send_sales|process-sales-lead-email/i);
});
