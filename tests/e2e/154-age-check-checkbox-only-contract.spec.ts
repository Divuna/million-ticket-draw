/**
 * Spec 154 — kontrakt „věk se ověřuje jen checkboxem 18+"
 *
 * Statický contract test (bez DB, bez secretů — běží v každém CI).
 *
 * Doplňuje browser testy ze spec 49 (ty ověřují samotné registrační pole).
 * Tento spec zamyká to, co po úklidu NESMÍ vrátit zpět: odvozování věku
 * z `profiles.date_of_birth` a jeho použití jako podmínky účtu, soutěže,
 * výhry nebo administrativního procesu.
 *
 * Sloupec `profiles.date_of_birth` ani historická data se nemažou — datum
 * narození smí zůstat jako nepovinný historický údaj (profil je čte a
 * zobrazuje), nesmí ale nic blokovat ani nikoho klasifikovat.
 */
import { expect, test } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const exists = (p: string) => existsSync(resolve(process.cwd(), p));

const MIGRATION = 'supabase/migrations/20260903180000_guardian_notice_drop_age_dependency.sql';
const REGISTER = 'src/pages/Register.tsx';

const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, '');

/** Odstraní JS/TS komentáře, aby vysvětlující poznámky nespouštěly assertion. */
const stripTsComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `${name} nebyla v migraci nalezena`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf('$$;', start);
  expect(end, `${name} nemá ukončení těla`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

/** Soubory, které smí `date_of_birth` číst čistě pro zobrazení historie. */
const DISPLAY_ONLY_ALLOWLIST = ['src/pages/Profile.tsx'];

test.describe('věk = jen checkbox 18+ — kontrakt', () => {
  test('registrace vyžaduje potvrzení 18+ pro e-mail i sociální přihlášení', () => {
    const src = read(REGISTER);

    // Jediný povinný věkový vstup je checkbox.
    expect(src).toContain('id="ageConfirm"');
    expect(src).toContain('Pro registraci musíte potvrdit, že vám bylo 18 let.');

    // Dvě nezávislé kontroly: e-mailový submit i OAuth větev.
    const guards = src.match(/if \(!ageConfirmed\)/g) ?? [];
    expect(
      guards.length,
      'checkbox musí blokovat e-mailovou i sociální registraci'
    ).toBeGreaterThanOrEqual(2);

    // Registrace nesmí sbírat ani ukládat datum narození.
    expect(src).not.toMatch(/date_of_birth|dateOfBirth/);
  });

  test('žádná zákaznická cesta neodvozuje věk z data narození', () => {
    for (const file of [
      'src/pages/Wins.tsx',
      'src/components/WinDetailModal.tsx',
      'src/App.tsx',
    ]) {
      const src = read(file);
      expect(src, `${file} nesmí číst date_of_birth`).not.toMatch(/date_of_birth/);
      expect(src, `${file} nesmí počítat věk uživatele`).not.toMatch(/userAge/);
    }
  });

  test('výhra ani její převzetí nezávisí na věku, jen na atributu ceny', () => {
    const modal = read('src/components/WinDetailModal.tsx');
    // Upozornění na zákonného zástupce se řídí vlastností ceny.
    expect(modal).toContain("win.bonus_prize?.guardian_required === true");
    expect(modal).not.toMatch(/<\s*18|userAge/);

    const delivery = read('src/components/AdminPrizeDelivery.tsx');
    expect(delivery, 'prize delivery nesmí počítat věk výherce').not.toMatch(
      /winner_age|computeAge|date_of_birth/
    );
  });

  test('administrace nepovažuje chybějící datum narození za nedokončenou registraci', () => {
    // Stránka existovala jen kvůli filtru `date_of_birth IS NULL`.
    expect(
      exists('src/pages/AdminOnboardingIncomplete.tsx'),
      'stránka nedokončeného onboardingu už nemá důvod existovat'
    ).toBe(false);

    for (const file of ['src/App.tsx', 'src/components/admin/adminNavConfig.ts']) {
      expect(read(file), `${file} nesmí odkazovat na zrušenou routu`).not.toContain(
        'onboarding-incomplete'
      );
    }

    const stats = read('src/pages/AdminStatistics.tsx');
    expect(stats, 'statistiky nesmí počítat uživatele bez data narození').not.toMatch(
      /date_of_birth/
    );
    expect(stats).not.toContain('incompleteOnboarding');
    expect(stats).not.toContain('Nedokončený onboarding');
  });

  test('mrtvé guardy a hooky jsou pryč, e-mailový guard zůstal', () => {
    expect(exists('src/hooks/useDateOfBirthCheck.ts'), 'no-op hook je zbytečný').toBe(false);
    expect(exists('src/components/DateOfBirthGuard.tsx')).toBe(false);

    // Guard měl i druhý účel (potvrzení e-mailu) — ten musí zůstat.
    const guard = read('src/components/EmailConfirmationGuard.tsx');
    expect(guard).toContain('export const EmailConfirmationGuard');
    expect(guard).toContain('user.email_confirmed_at');
    // Komentáře smí datum narození zmiňovat (vysvětlují, proč se nekontroluje);
    // rozhoduje jen skutečný kód.
    expect(stripTsComments(guard), 'guard nesmí nikoho blokovat kvůli datu narození').not.toMatch(
      /date_of_birth|hasDateOfBirth/
    );

    const app = read('src/App.tsx');
    expect(app).toContain('<EmailConfirmationGuard>');
    expect(app).not.toContain('DateOfBirthProvider');
  });

  test('datum narození smí zůstat jen jako zobrazovaný historický údaj', () => {
    // Sloupec ani data se nemažou; profil ho dál čte pro zobrazení.
    const profile = stripTsComments(read(DISPLAY_ONLY_ALLOWLIST[0]));
    expect(profile).toContain('date_of_birth');
    // Smí ho jen zobrazit — žádný výpočet věku ani porovnání s hranicí 18.
    expect(profile, 'profil nesmí počítat věk').not.toMatch(
      /computeAge|getFullYear\(\)\s*-|[<>]=?\s*18\b/
    );

    // Migrace nesmí sloupec ani data odstranit.
    const sql = stripSqlComments(read(MIGRATION));
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/UPDATE\s+\w/i);
    expect(sql).not.toMatch(/DROP\s+TRIGGER/i);
  });

  test('DB funkce už neodvozují věk z data narození', () => {
    const sql = stripSqlComments(read(MIGRATION));

    const trg = functionBody(sql, 'trigger_guardian_message_on_winner');
    // Dřív: `IF v_user_dob IS NULL THEN v_user_age := 0` → každý bez data
    // narození byl vyhodnocen jako nezletilý.
    expect(trg).not.toMatch(/date_of_birth|v_user_dob|v_user_age|EXTRACT|< 18/);
    expect(trg).toContain('guardian_required');
    // Chybějící příznak nikdy neznamená „vyžaduje zástupce".
    expect(trg).toContain('COALESCE(v_guardian_required, false)');
    // Výhru nesmí zablokovat.
    expect(trg).toContain('RETURN NEW');
    expect(trg).not.toMatch(/RAISE\s+EXCEPTION/i);

    const notif = functionBody(sql, 'create_guardian_notification_if_needed');
    // Dřív: `RETURN ... 'Date of birth not set'` → notifikace nevznikla nikdy.
    expect(notif).not.toMatch(/date_of_birth|v_date_of_birth|v_age|EXTRACT|>= 18/);
    expect(notif).not.toContain('Date of birth not set');
    expect(notif).toContain("guardian_required IS NOT TRUE");
    // Deduplikace přes marker musí zůstat, aby seděla i na starší řádky.
    expect(notif).toContain('[prize_id:');
  });

  test('migrace nezasahuje do oprávnění ani jiných bezpečnostních kontrol', () => {
    const raw = read(MIGRATION);
    const sql = stripSqlComments(raw);

    // Guardian RPC zůstává service_role-only přesně jako po 20260718190001.
    const sig = 'public.create_guardian_notification_if_needed(uuid, uuid, uuid)';
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(raw).toContain(`REVOKE ALL ON FUNCTION ${sig} FROM ${role}`);
    }
    expect(raw).toContain(`GRANT EXECUTE ON FUNCTION ${sig} TO service_role`);
    expect(raw, 'nesmí se rozšířit práva pro anon').not.toMatch(
      /GRANT[^\n;]*TO[^\n;]*\banon\b/i
    );

    // Obě funkce zůstávají SECURITY DEFINER se zafixovaným search_path.
    expect((sql.match(/SECURITY DEFINER/g) ?? []).length).toBe(2);
    expect((sql.match(/SET search_path/g) ?? []).length).toBe(2);

    // Migrace nesahá na RLS ani na role.
    expect(sql).not.toMatch(/CREATE\s+POLICY|DROP\s+POLICY|user_roles|has_role/i);

    // A definuje právě tyto dvě funkce, nic jiného.
    const defined = (sql.match(/CREATE OR REPLACE FUNCTION public\.(\w+)/g) ?? []).sort();
    expect(defined).toEqual([
      'CREATE OR REPLACE FUNCTION public.create_guardian_notification_if_needed',
      'CREATE OR REPLACE FUNCTION public.trigger_guardian_message_on_winner',
    ]);
  });
});
