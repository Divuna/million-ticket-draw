/**
 * Spec 150 — kontrakt atomické změny stavu výhry (nález A06)
 *
 * Statický contract test (bez DB, bez secretů — běží v každém CI).
 *
 * Zamyká čtyři věci, které auditní report A06 označil jako [CHYBA] a které byly
 * proti aktuálnímu kódu potvrzeny jako stále platné:
 *
 *  1. `/admin/winners` už nesmí zapisovat do `winners` přímo — musí jít přes
 *     jedinou atomickou RPC `admin_update_winner_status`.
 *  2. Nesmí zůstat „polykání" chyb (historie / zpráva uživateli selže, ale UI
 *     ohlásí úspěch). Dřív tam byly komentáře „Continue anyway" a
 *     „Message failed but DB update succeeded".
 *  3. Změna stavu musí zapsat centrální audit (`admin_actions`) a spustit
 *     notifikaci — vše ve stejné transakci.
 *  4. `winners` a `bonus_prizes` nesmí být dva rozdílné zdroje pravdy —
 *     obě RPC musí druhou tabulku dorovnat.
 *
 * Pozn.: Supabase klient v tomto projektu NENÍ typovaný přes `Database`
 * (`createClient` bez generiky), takže názvy RPC TypeScript nekontroluje.
 * Tento test je proto jediná statická pojistka, že se volá správná RPC.
 *
 * Živé chování proti reálné DB ověřuje staging-only spec 151.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const MIGRATION_PATH =
  'supabase/migrations/20260903140000_admin_update_winner_status_atomic.sql';
const ADMIN_WINNERS = 'src/pages/AdminWinners.tsx';

const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, '');

/** Tělo funkce od `CREATE OR REPLACE FUNCTION <name>` po ukončovací `$$;`. */
function functionBody(sql: string, functionName: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}(`);
  expect(start, `${functionName} nebyla v migraci nalezena`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf('$$;', start);
  expect(end, `${functionName} nemá ukončení těla`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

test.describe('změna stavu výhry — atomický kontrakt', () => {
  test('AdminWinners nezapisuje do winners přímo a volá atomickou RPC', () => {
    const page = read(ADMIN_WINNERS);

    // Žádný přímý zápis do winners (dřív .from('winners').update({status})).
    expect(
      page,
      'AdminWinners nesmí zapisovat do winners napřímo — jen přes RPC'
    ).not.toMatch(/from\(['"]winners['"]\)[\s\S]{0,120}?\.update\(/);

    // Obě cesty (jednotlivá i hromadná) volají stejnou RPC.
    const rpcCalls = page.match(/rpc\(\s*['"]admin_update_winner_status['"]/g) ?? [];
    expect(
      rpcCalls.length,
      'jednotlivá i hromadná změna stavu musí volat admin_update_winner_status'
    ).toBe(2);

    // Historii ani zprávu už nesmí zapisovat klient samostatně.
    expect(page).not.toMatch(/from\(['"]winner_status_history['"]\)[\s\S]{0,80}?\.insert\(/);
    expect(page).not.toMatch(/from\(['"]messages['"]\)[\s\S]{0,200}?prize_status_change/);
  });

  test('žádné tiché polykání chyb ani falešný úspěch v UI', () => {
    const page = read(ADMIN_WINNERS);

    // Přesné formulace, které v původním kódu maskovaly selhání.
    expect(page).not.toContain('Continue anyway');
    expect(page).not.toContain('Message failed but DB update succeeded');

    // Úspěšný toast smí přijít až po kontrole chyby RPC: v obou cestách
    // musí být `if (rpcError)` s návratem/`continue` PŘED zápisem úspěchu.
    const singlePath = page.slice(
      page.indexOf('const updateWinnerStatus'),
      page.indexOf('const updateBulkWinnerStatus')
    );
    expect(singlePath).toContain('if (rpcError)');
    const errCheckAt = singlePath.indexOf('if (rpcError)');
    const successToastAt = singlePath.indexOf('Stav výhry aktualizován');
    expect(
      errCheckAt,
      'kontrola chyby musí předcházet úspěšnému toastu'
    ).toBeLessThan(successToastAt);

    // Hromadná cesta smí započítat úspěch jen po úspěšné RPC.
    const bulkPath = page.slice(page.indexOf('const updateBulkWinnerStatus'));
    const bulkErrAt = bulkPath.indexOf('if (rpcError)');
    const bulkSuccessAt = bulkPath.indexOf('successCount++');
    expect(bulkErrAt).toBeGreaterThanOrEqual(0);
    expect(
      bulkErrAt,
      'successCount se smí zvýšit až po kontrole chyby'
    ).toBeLessThan(bulkSuccessAt);

    // Lokální stav se aktualizuje jen pro řádky, které skutečně prošly.
    expect(bulkPath).toContain('succeededIds');
  });

  test('RPC dělá stav + historii + notifikaci + audit jako jeden krok', () => {
    const body = stripSqlComments(
      functionBody(read(MIGRATION_PATH), 'admin_update_winner_status')
    );

    // Admin guard nad kanonickou user_roles, nikdy legacy users.role.
    expect(body).toContain("public.has_role(v_admin_id, 'admin'::public.app_role)");
    expect(body).toContain("public.has_role(v_admin_id, 'superadmin'::public.app_role)");
    expect(body).toContain("RAISE EXCEPTION 'Admin access required'");
    expect(body, 'nesmí číst legacy public.users.role').not.toMatch(
      /users\.role|FROM\s+users\b/i
    );

    // Zámek řádku proti souběžné změně stavu.
    expect(body).toContain('FOR UPDATE');

    // Všechny čtyři zápisy jsou v jednom těle → jedna transakce.
    expect(body).toMatch(/UPDATE public\.winners/);
    expect(body).toMatch(/INSERT INTO public\.winner_status_history/);
    expect(body).toMatch(/INSERT INTO public\.messages/);
    expect(body).toMatch(/INSERT INTO public\.admin_actions/);

    // Validace vstupu — neznámý stav se nesmí uložit.
    expect(body).toContain("RAISE EXCEPTION 'Neplatný stav výhry: %'");
    for (const status of ['pending', 'připraveno k odeslání', 'shipped', 'delivered']) {
      expect(body).toContain(`'${status}'`);
    }

    // `delivered` se nikdy nesnižuje zpět.
    expect(body).toContain('CASE WHEN v_delivered THEN true ELSE delivered END');

    // Funkce nesmí chyby polykat — žádný EXCEPTION WHEN OTHERS blok.
    expect(
      body,
      'RPC nesmí polykat chyby, jinak by UI opět dostalo falešný úspěch'
    ).not.toMatch(/EXCEPTION\s+WHEN\s+OTHERS/i);
  });

  test('winners a bonus_prizes se dorovnávají oběma směry', () => {
    const sql = stripSqlComments(read(MIGRATION_PATH));

    // Směr winners → bonus_prizes (uzavření věcné bonusové výhry).
    const winnerFn = functionBody(sql, 'admin_update_winner_status');
    expect(winnerFn).toMatch(/UPDATE public\.bonus_prizes/);
    expect(winnerFn).toContain('v_winner.prize_id IS NOT NULL');

    // Směr bonus_prizes → winners (dřív úplně chyběl: /admin/prize-delivery
    // byl pro zákazníka na /wins neviditelný).
    const prizeFn = functionBody(sql, 'update_bonus_prize_delivery_status');
    expect(
      prizeFn,
      'prize-delivery musí dorovnat winners, jinak zákazník vidí dál „čeká“'
    ).toMatch(/UPDATE public\.winners/);
    expect(prizeFn).toContain("SET status = 'delivered', delivered = true");
    expect(prizeFn).toContain("type = 'bonus'");

    // I tato RPC musí být na kanonické user_roles.
    expect(prizeFn).toContain("public.has_role(v_admin_id, 'admin'::public.app_role)");
    expect(prizeFn).not.toMatch(/users\.role/i);
  });

  test('EXECUTE granty jsou minimální — bez anon a bez PUBLIC', () => {
    const sql = read(MIGRATION_PATH);
    const signatures = [
      'public.admin_update_winner_status(uuid, text, text)',
      'public.update_bonus_prize_delivery_status(uuid, text, text)',
    ];
    for (const sig of signatures) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC`);
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${sig} FROM anon`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${sig} TO authenticated`);
    }
  });

  test('migrace nemění data ani schéma mimo tyto dvě funkce', () => {
    const sql = stripSqlComments(read(MIGRATION_PATH));

    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/DROP\s+(TABLE|POLICY|CONSTRAINT)/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE/i);

    const defined = (sql.match(/CREATE OR REPLACE FUNCTION public\.(\w+)/g) ?? []).sort();
    expect(defined).toEqual([
      'CREATE OR REPLACE FUNCTION public.admin_update_winner_status',
      'CREATE OR REPLACE FUNCTION public.update_bonus_prize_delivery_status',
    ]);
  });
});
