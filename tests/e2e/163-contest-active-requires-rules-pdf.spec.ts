/**
 * Spec 163 — Soutěž nesmí být `active` bez nahraných pravidel (PDF)
 *
 * Staging-only, self-contained. Pracuje výhradně s čerstvě založenými soutěžemi
 * a nikdy nevydá tiket ani nic finančního — testovací soutěže vznikají jako
 * `pending`/`active` bez jediného prodeje a v `afterAll` se mažou.
 *
 * Zamyká:
 *   163a INSERT `active` bez PDF                     → zamítnuto
 *   163b INSERT `active` s PDF                       → projde
 *   163c `pending` bez PDF → UPDATE na `active`      → zamítnuto
 *   163d doplnit PDF → aktivace                      → projde
 *   163e aktivní soutěži odebrat PDF (NULL i "  ")   → zamítnuto
 *   163f admin flow „Active + PDF"                   → končí `active` s uloženým PDF
 *   163g historicky `active` bez PDF                 → prodej tiketu dál funguje
 *   163h `create-contest` neumí založit `active`     → statický kontrakt
 *
 * 163g je záměrný: ochrana hlídá PŘECHODY do vadného stavu, ne klidový stav.
 * Kdyby to byl CHECK constraint, přestal by u historických řádků procházet
 * `next_ticket_number` a rozbil by se nákup tiketu.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const STAGING_REF  = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const RUN_ID = Date.now();
const TITLE_PREFIX = `E2E Spec163 ${RUN_ID}`;
const PDF_URL = 'https://example.invalid/spec163-rules.pdf';

const isStaging = SUPABASE_URL.includes(STAGING_REF) && !!SERVICE_ROLE;

const svc = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const baseContest = (suffix: string) => ({
  title: `${TITLE_PREFIX} ${suffix}`,
  name: `${TITLE_PREFIX} ${suffix}`,
  main_prize: 'E2E cena',
  main_image: 'https://example.invalid/spec163.png',
  ticket_count: 10,
  ticket_price: 1,
});

/** Porušení invariantu hlásí trigger jako check_violation (SQLSTATE 23514). */
const isInvariantViolation = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === '23514' || /pravidel|rules/i.test(error.message ?? ''));

test.describe.serial('163 — active soutěž vyžaduje PDF pravidel', () => {
  test.skip(!isStaging, 'staging-only — vyžaduje staging URL a service role');

  test.afterAll(async () => {
    await svc().from('contests').delete().like('title', `${TITLE_PREFIX}%`);
  });

  test('163a: INSERT active bez PDF je zamítnut', async () => {
    const { data, error } = await svc()
      .from('contests')
      .insert({ ...baseContest('a'), status: 'active' })
      .select('id');

    expect(isInvariantViolation(error), `očekáván check_violation, přišlo: ${JSON.stringify(error)}`).toBe(true);
    expect(data ?? []).toHaveLength(0);
  });

  test('163b: INSERT active s PDF projde', async () => {
    const { data, error } = await svc()
      .from('contests')
      .insert({ ...baseContest('b'), status: 'active', rules_pdf_url: PDF_URL })
      .select('id, status, rules_pdf_url')
      .single();

    expect(error, JSON.stringify(error)).toBeNull();
    expect(data?.status).toBe('active');
    expect(data?.rules_pdf_url).toBe(PDF_URL);
  });

  test('163c: pending bez PDF nelze aktivovat', async () => {
    const client = svc();
    const { data: created, error: insErr } = await client
      .from('contests')
      .insert({ ...baseContest('c'), status: 'pending' })
      .select('id')
      .single();
    expect(insErr, JSON.stringify(insErr)).toBeNull();

    const { error } = await client.from('contests').update({ status: 'active' }).eq('id', created!.id);
    expect(isInvariantViolation(error), `očekáván check_violation, přišlo: ${JSON.stringify(error)}`).toBe(true);

    const { data: after } = await client.from('contests').select('status').eq('id', created!.id).single();
    expect(after?.status, 'soutěž musí zůstat neaktivní').toBe('pending');
  });

  test('163d: po doplnění PDF aktivace projde', async () => {
    const client = svc();
    const { data: created } = await client
      .from('contests')
      .insert({ ...baseContest('d'), status: 'pending' })
      .select('id')
      .single();

    const { error: pdfErr } = await client
      .from('contests')
      .update({ rules_pdf_url: PDF_URL })
      .eq('id', created!.id);
    expect(pdfErr, JSON.stringify(pdfErr)).toBeNull();

    const { error: actErr } = await client
      .from('contests')
      .update({ status: 'active' })
      .eq('id', created!.id);
    expect(actErr, JSON.stringify(actErr)).toBeNull();

    const { data: after } = await client
      .from('contests')
      .select('status, rules_pdf_url')
      .eq('id', created!.id)
      .single();
    expect(after?.status).toBe('active');
    expect(after?.rules_pdf_url).toBe(PDF_URL);
  });

  test('163e: aktivní soutěži nelze odebrat PDF', async () => {
    const client = svc();
    const { data: created } = await client
      .from('contests')
      .insert({ ...baseContest('e'), status: 'active', rules_pdf_url: PDF_URL })
      .select('id')
      .single();

    // NULL
    const { error: nullErr } = await client
      .from('contests')
      .update({ rules_pdf_url: null })
      .eq('id', created!.id);
    expect(isInvariantViolation(nullErr), JSON.stringify(nullErr)).toBe(true);

    // Prázdný / bílý řetězec — nesmí být cesta okolo.
    const { error: blankErr } = await client
      .from('contests')
      .update({ rules_pdf_url: '   ' })
      .eq('id', created!.id);
    expect(isInvariantViolation(blankErr), JSON.stringify(blankErr)).toBe(true);

    const { data: after } = await client
      .from('contests')
      .select('status, rules_pdf_url')
      .eq('id', created!.id)
      .single();
    expect(after?.rules_pdf_url).toBe(PDF_URL);
    expect(after?.status).toBe('active');
  });

  test('163f: admin flow „Active + PDF" končí aktivní soutěží s pravidly', async () => {
    // Zrcadlí opravené pořadí z AdminContestManagement: soutěž vznikne jako
    // `pending`, pak se uloží PDF a teprve potom se aktivuje. V žádném okamžiku
    // neexistuje aktivní soutěž bez pravidel.
    const client = svc();

    const { data: created, error: createErr } = await client
      .from('contests')
      .insert({ ...baseContest('f'), status: 'pending' })
      .select('id, status')
      .single();
    expect(createErr, JSON.stringify(createErr)).toBeNull();
    expect(created?.status, 'mezistav nesmí být active').toBe('pending');

    await client.from('contests').update({ rules_pdf_url: PDF_URL }).eq('id', created!.id);
    const { error: actErr } = await client
      .from('contests')
      .update({ status: 'active' })
      .eq('id', created!.id);
    expect(actErr, JSON.stringify(actErr)).toBeNull();

    const { data: final } = await client
      .from('contests')
      .select('status, rules_pdf_url')
      .eq('id', created!.id)
      .single();
    expect(final?.status).toBe('active');
    expect(final?.rules_pdf_url).toBe(PDF_URL);

    // Žádný finanční dopad: soutěž nikdy neprodala tiket.
    const { count } = await client
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('contest_id', created!.id);
    expect(count ?? 0).toBe(0);
  });

  test('163g: historicky active soutěž bez PDF dál prodává tikety', async () => {
    // Ochrana hlídá PŘECHODY, ne klidový stav. Kdyby to byl CHECK constraint,
    // přestal by u těchto řádků procházet `next_ticket_number` a rozbil by se
    // nákup tiketu. Test to drží jako vědomé rozhodnutí, ne jako opomenutí.
    const client = svc();
    const { data: legacy } = await client
      .from('contests')
      .select('id, next_ticket_number')
      .eq('status', 'active')
      .is('rules_pdf_url', null)
      .limit(1)
      .maybeSingle();

    test.skip(!legacy, 'staging nemá historickou active soutěž bez PDF');

    const { error } = await client
      .from('contests')
      .update({ next_ticket_number: legacy!.next_ticket_number })
      .eq('id', legacy!.id);
    expect(error, `historický řádek musí zůstat aktualizovatelný: ${JSON.stringify(error)}`).toBeNull();
  });

  test('163h: create-contest neumí založit aktivní soutěž', () => {
    // Statický kontrakt: EF `rules_pdf_url` vůbec nepřijímá, takže by aktivní
    // soutěž vytvořená tudy byla vždy bez pravidel — obchvat kolem admin UI.
    const src = fs.readFileSync('supabase/functions/create-contest/index.ts', 'utf8');
    expect(src).toMatch(/if \(status === 'active'\)/);
    expect(src).toContain('Contest cannot be created as active');

    // Funkce `rules_pdf_url` ani nepřijímá, ani neukládá — kontroluje se INSERT
    // payload, ne celý soubor: vysvětlující komentář ten název legitimně obsahuje.
    const insertBlock = src.slice(src.indexOf('.insert({'), src.indexOf('.select()'));
    expect(insertBlock.length).toBeGreaterThan(0);
    expect(insertBlock).not.toContain('rules_pdf_url');
    const destructured = src.match(/const \{([^}]*)\} = await req\.json\(\)/)?.[1] ?? '';
    expect(destructured).not.toContain('rules_pdf_url');
  });
});
