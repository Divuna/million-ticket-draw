import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Spec 138 — the customer MioCoin reward e-mail must be written in real Czech.
 *
 * The bug this locks: the e-mail body inside update_partner_order_reward_status
 * was authored WITHOUT diacritics — "Mate pripravene MioCoiny", "Dobry den",
 * "dekujeme za nakup". That was never an Outlook or a charset problem; the
 * source string itself had the accents stripped, so every customer who received
 * a reward code read broken Czech.
 *
 * Static spec: no network, no database, no e-mail. It reads the migration that
 * currently defines the function, so it fails the moment somebody reintroduces
 * the accent-less wording — including through a brand new migration.
 *
 * Covers:
 *   138a) the newest definition is the one this spec checks (no stale target)
 *   138b) every required Czech word is present, with its diacritics
 *   138c) the accent-less forms are gone, subject line included
 *   138d) the code label renders as "VÁŠ MIOCOIN KÓD"
 *   138e) only the wording changed — trigger, idempotency, amount, URL and code
 *         are all still exactly as they were
 *   138f) there is one single live source of this e-mail, not a second copy
 */

const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations');
const FUNCTION_NAME = 'update_partner_order_reward_status';
const DEFINES_FUNCTION = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${FUNCTION_NAME}\\b`);

/** Git on Windows checks files out with CRLF; every match here is newline-agnostic. */
const readSql = (file: string): string =>
  readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8').replace(/\r\n/g, '\n');

/** Migration filenames are timestamp-prefixed, so lexicographic order is apply order. */
const definingMigrations = (): string[] =>
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => DEFINES_FUNCTION.test(readSql(f)));

/** The migration that defines the function last — the one that is actually live. */
const newestDefinition = (): { file: string; sql: string } => {
  const files = definingMigrations();
  expect(files.length, 'at least one migration must define the function').toBeGreaterThan(0);
  const file = files[files.length - 1];
  return { file, sql: readSql(file) };
};

/** Just the e-mail body — the dollar-quoted $html$ ... $html$ block. */
const emailHtml = (sql: string): string => {
  const m = /\$html\$([\s\S]*?)\$html\$/.exec(sql);
  expect(m, 'the migration must contain the $html$ e-mail body').not.toBeNull();
  return m![1];
};

test.describe('138 — customer MioCoin reward e-mail is written in Czech', () => {
  test('138a) the spec targets the newest definition of the function', () => {
    // Pinned so a later migration that silently reverts the wording cannot hide
    // behind an older file. Bump this deliberately when the function changes.
    expect(newestDefinition().file).toBe('20260818110000_partner_reward_customer_email_czech.sql');
  });

  test('138b) every required Czech word is present with its diacritics', () => {
    const html = emailHtml(newestDefinition().sql);

    for (const word of [
      'Máte', 'připravené', 'Dobrý', 'děkujeme', 'nákup', 'Získali',
      'můžete', 'peněžence', 'kód', 'přihlášení', 'tlačítko', 'použijte',
    ]) {
      expect(html, `missing Czech word: ${word}`).toContain(word);
    }

    // And the full sentences, so a partial revert cannot pass on single words.
    expect(html).toContain('>Máte připravené MioCoiny</h1>');
    expect(html).toContain('>Dobrý den,</p>');
    expect(html).toContain('děkujeme za nákup u <strong>%1$s</strong>');
    expect(html).toContain('Získali jste <strong>%2$s</strong>');
    expect(html).toContain('které můžete uplatnit ve své peněžence OneMil.');
    expect(html).toContain('Kód uplatníte po přihlášení v sekci Profil &rarr; Peněženka.');
    expect(html).toContain('Pokud tlačítko nefunguje, použijte odkaz:');
    expect(html).toContain('MioCoiny jsou interní kredit OneMil a lze je použít pouze v rámci platformy OneMil.');
    expect(html).toContain('Luxusní soutěže. Skutečné výhry.');
  });

  test('138c) the accent-less wording is gone, subject line included', () => {
    const { sql } = newestDefinition();

    // Comment lines legitimately quote the old wording to explain the bug, so
    // this looks at executable SQL only.
    const code = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');

    for (const stripped of [
      'Mate pripravene', 'Dobry den', 'dekujeme za nakup', 'Ziskali jste',
      'muzete uplatnit', 've sve penezence', 'Vas MioCoin kod',
      'Kod uplatnite', 'po prihlaseni', 'Penezenka', 'tlacitko nefunguje',
      'pouzijte odkaz', 'interni kredit', 'Luxusni souteze', 'Skutecne vyhry',
    ]) {
      expect(code, `accent-less wording is back: ${stripped}`).not.toContain(stripped);
    }

    // The subject is part of the same e-mail and lives outside the $html$ block.
    expect(code).toContain("'Máte připravené MioCoiny od OneMil'");
  });

  test('138d) the code label renders as VÁŠ MIOCOIN KÓD', () => {
    const html = emailHtml(newestDefinition().sql);

    const label = /text-transform:uppercase;[^"]*">([^<]+)<\/div>/.exec(html);
    expect(label, 'the MioCoin code label must still exist').not.toBeNull();

    // The source keeps natural casing and the CSS uppercases it, so this asserts
    // what the customer actually sees rather than how it is stored.
    expect(label![1]).toBe('Váš MioCoin kód');
    expect(label![1].toUpperCase()).toContain('KÓD');
    expect(label![1].toUpperCase()).toBe('VÁŠ MIOCOIN KÓD');
  });

  test('138e) only the wording changed — behaviour is untouched', () => {
    const { sql } = newestDefinition();

    // Trigger: both status branches, unchanged.
    expect(sql).toContain("IF v_order_status IN ('paid', 'delivered', 'completed') THEN");
    expect(sql).toContain("ELSIF v_order_status IN ('cancelled', 'returned', 'unpaid', 'not_picked_up') THEN");

    // Idempotency: one e-mail per code, one pending -> issued transition.
    expect(sql).toContain("(v_metadata->>'customer_email_enqueued_at') IS NULL");
    expect(sql).toContain("v_was_pending := (v_row.status = 'pending')");
    expect(sql).toContain("v_new_status := 'issued'");
    expect(sql).toContain("'already_redeemed', true");

    // The amount still goes through the Czech formatter — no second rounding here.
    expect(sql).toContain('public.format_miocoin_cz(v_row.coins)');
    expect(sql).not.toMatch(/\bround\s*\(/i);
    expect(sql).not.toMatch(/\bfloor\s*\(/i);

    // Redeem URL and voucher code are unchanged.
    expect(sql).toContain("'https://onemil.cz/profile?miocoin_code=' || v_row.code");

    // Still service_role only.
    expect(sql).toContain(
      `REVOKE ALL ON FUNCTION public.${FUNCTION_NAME}(uuid, text, text) FROM PUBLIC, anon, authenticated;`,
    );
    expect(sql).toContain(
      `GRANT EXECUTE ON FUNCTION public.${FUNCTION_NAME}(uuid, text, text) TO service_role;`,
    );
  });

  test('138f) the e-mail has exactly one live source', () => {
    // Older migrations still carry the old wording — that is correct, history is
    // not rewritten. What must not exist is a SECOND live template building a
    // competing customer e-mail for the same reward code.
    const defining = definingMigrations();
    const current = newestDefinition().file;
    expect(defining[defining.length - 1]).toBe(current);
    for (const f of defining.slice(0, -1)) {
      expect(f < current, `${f} must be older than ${current}`).toBe(true);
    }

    // No Edge Function may enqueue its own copy of this customer e-mail.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name.endsWith('.ts')) {
          const src = readFileSync(p, 'utf8');
          if (/Máte připravené MioCoiny|Mate pripravene MioCoiny|Váš MioCoin kód|Vas MioCoin kod/.test(src)) {
            offenders.push(p);
          }
        }
      }
    };
    walk(resolve(process.cwd(), 'supabase/functions'));
    expect(offenders, `duplicate customer e-mail template: ${offenders.join(', ')}`).toEqual([]);
  });
});
