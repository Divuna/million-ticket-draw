/**
 * Spec 147 — kontrakt bezpečnostních guardů `pause_contest` / `resume_contest`
 *
 * Statický contract test (bez DB, bez secretů — běží v každém CI).
 * Zamyká dvě věci, které auditní report A05 označil jako kritické:
 *
 *  1. Obě RPC musí mít UVNITŘ funkce admin/superadmin guard postavený na
 *     kanonické tabulce `public.user_roles` (přes `public.has_role`), nikoli
 *     jen na ochraně v admin UI a nikdy ne na legacy `public.users.role`.
 *  2. `closed` je konečný stav — uzavřenou soutěž nesmí ani jedna z funkcí
 *     převést do jiného stavu (pravidlo z CLAUDE.md „Contest admin – uzamčená
 *     pravidla“).
 *
 * Doplňuje spec 84, který ověřuje pouze GRANTy, ale schválně nekontroluje
 * přítomnost vnitřního guardu — proto by spec 84 sám tuto díru neodhalil.
 *
 * Živé chování proti reálné databázi ověřuje staging-only spec 148.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const MIGRATION_PATH =
  'supabase/migrations/20260902120000_contest_pause_resume_closed_final_guard.sql';

/** Vrátí tělo funkce od `CREATE OR REPLACE FUNCTION <name>` po ukončovací `$$;`. */
function functionBody(sql: string, functionName: string): string {
  const startMarker = `CREATE OR REPLACE FUNCTION public.${functionName}(contest_id uuid)`;
  const start = sql.indexOf(startMarker);
  expect(start, `${functionName} nebyla v migraci nalezena`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf('$$;', start);
  expect(end, `${functionName} nemá ukončení těla`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

/**
 * Odstraní `--` komentáře. Nutné pro negativní tvrzení: komentář, který legacy
 * zdroj role výslovně ZAKAZUJE, nesmí být zaměněn za jeho skutečné čtení.
 */
const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, '');

const GUARDED_FUNCTIONS = ['pause_contest', 'resume_contest'] as const;

test.describe('pause_contest / resume_contest — guard contract', () => {
  test('obě RPC mají vnitřní admin/superadmin guard nad kanonickou user_roles', () => {
    const migration = read(MIGRATION_PATH);

    for (const fn of GUARDED_FUNCTIONS) {
      const body = functionBody(migration, fn);

      // Guard musí být uvnitř funkce, ne jen v UI.
      expect(body, `${fn}: chybí kontrola admin role`).toContain(
        "public.has_role(auth.uid(), 'admin'::public.app_role)"
      );
      expect(body, `${fn}: chybí kontrola superadmin role`).toContain(
        "public.has_role(auth.uid(), 'superadmin'::public.app_role)"
      );
      expect(body, `${fn}: guard nevyhazuje výjimku`).toContain(
        "RAISE EXCEPTION 'Admin access required'"
      );

      // Identita se bere výhradně z JWT, nikdy z parametru volajícího.
      expect(body).toContain('auth.uid()');

      // Legacy role zdroj je zakázaný (drift users.role vs user_roles).
      // Porovnáváme na kódu bez komentářů — zmínka v komentáři není čtení tabulky.
      expect(stripSqlComments(body), `${fn}: nesmí číst legacy public.users.role`).not.toMatch(
        /users\.role|FROM\s+public\.users\b/i
      );

      // Ochrana proti obcházení guardu přes search_path.
      expect(body).toContain('SECURITY DEFINER');
      expect(body).toContain("SET search_path TO 'public'");
    }
  });

  test('closed je konečný stav — ani jedna RPC ho nesmí přepsat', () => {
    const migration = read(MIGRATION_PATH);

    for (const fn of GUARDED_FUNCTIONS) {
      const body = functionBody(migration, fn);

      // Stav se čte pod zámkem řádku, aby souběžné volání nemohlo guard obejít.
      expect(body, `${fn}: chybí FOR UPDATE zámek při čtení stavu`).toContain('FOR UPDATE');
      expect(body, `${fn}: nekontroluje aktuální stav soutěže`).toContain(
        "IF v_status = 'closed' THEN"
      );
      expect(body, `${fn}: nevyhazuje výjimku pro uzavřenou soutěž`).toMatch(
        /RAISE EXCEPTION 'Uzavřenou soutěž nelze (znovu aktivovat|pozastavit)\.'/
      );

      // Kontrola stavu musí předcházet samotnému UPDATE.
      const closedCheckAt = body.indexOf("IF v_status = 'closed' THEN");
      const updateAt = body.indexOf('UPDATE public.contests');
      expect(
        closedCheckAt,
        `${fn}: kontrola closed musí být před UPDATE, ne po něm`
      ).toBeLessThan(updateAt);
    }
  });

  test('EXECUTE granty zůstávají minimální — bez anon a bez PUBLIC', () => {
    const migration = read(MIGRATION_PATH);

    for (const fn of GUARDED_FUNCTIONS) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${fn}(uuid) FROM PUBLIC`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${fn}(uuid) FROM anon`);
      // Admin UI běží pod rolí `authenticated`; oprávnění rozlišuje vnitřní guard.
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${fn}(uuid) TO authenticated`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${fn}(uuid) TO service_role`);
    }
  });

  test('migrace nemění nic mimo tyto dvě funkce', () => {
    // Vykonatelný SQL kód bez komentářů — komentáře popisují i to, co se NEmění.
    const sql = stripSqlComments(read(MIGRATION_PATH));

    // Žádná datová mutace ani zásah do citlivých tabulek/omezení.
    expect(sql).not.toMatch(/UPDATE\s+public\.(winners|wallets|payments|bonus_prizes)\b/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/DROP\s+(TABLE|POLICY|CONSTRAINT|FUNCTION)/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE/i);
    // Constraint povolených stavů zůstává nedotčený.
    expect(sql).not.toContain('contests_status_check');

    // Jediné UPDATE příkazy jsou ty dva zamýšlené přechody stavu.
    const updates = sql.match(/UPDATE\s+public\.contests/g) ?? [];
    expect(updates).toHaveLength(2);

    // Migrace se dotýká výhradně těchto dvou funkcí.
    const definedFunctions = sql.match(/CREATE OR REPLACE FUNCTION public\.(\w+)/g) ?? [];
    expect(definedFunctions.sort()).toEqual([
      'CREATE OR REPLACE FUNCTION public.pause_contest',
      'CREATE OR REPLACE FUNCTION public.resume_contest',
    ]);
  });

  test('admin UI stále volá stejnou bezpečnou RPC cestu', () => {
    const controlPanel = read('src/components/admin/ContestControlPanel.tsx');

    expect(controlPanel).toContain("callRpc('pause_contest', { contest_id: selectedId })");
    expect(controlPanel).toContain("callRpc('resume_contest', { contest_id: selectedId })");

    // UI nesmí obcházet RPC přímým zápisem stavu do tabulky.
    expect(controlPanel).not.toMatch(/from\(['"]contests['"]\)[\s\S]{0,80}\.update\(/);
    // Pozn.: že UI nepoužívá legacy nechráněný close helper, hlídá spec 84 —
    // zde se ten identifikátor záměrně neuvádí, aby neprošel jeho repo-wide scanem.
  });
});
