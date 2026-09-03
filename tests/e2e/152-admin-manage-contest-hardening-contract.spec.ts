/**
 * Spec 152 — kontrakt zpevněné `admin_manage_contest`
 *
 * Statický contract test (bez DB, bez secretů — běží v každém CI).
 *
 * Zamyká to, co kontrola `admin_manage_contest` proti origin/main potvrdila
 * jako reálné chyby:
 *
 *  1. Guard musí být nad kanonickou `user_roles` přes `has_role()`, nikdy nad
 *     legacy `public.users.role` (produkce má doložený drift).
 *  2. Defaulty `p_status` / `p_ticket_count` / `p_ticket_price` musí být NULL.
 *     Nenulové defaulty (`'draft'`, `1000000`, `1`) byly hlavní příčina:
 *     PostgREST posílá jen klíče přítomné v těle, takže vynechaný parametr
 *     nabral DEFAULT a `COALESCE()` ho zapsal jako skutečnou změnu.
 *  3. Velikost soutěže = pozice hlavní výhry → po prvním vydaném tiketu je
 *     `ticket_count` neměnný, a to i mimo RPC (trigger na `contests`).
 *  4. `closed` je konečný stav i v této RPC (jinak obchází 20260902120000).
 *  5. Zámek řádku `FOR UPDATE` před vyhodnocením velikosti a statusu.
 *  6. Minimální EXECUTE granty (bez `anon`, bez `PUBLIC`).
 *  7. Volající z UI nesmí spoléhat na defaulty — musí posílat explicitní NULL.
 *
 * Pozn.: Supabase klient v projektu NENÍ typovaný přes `Database`
 * (`createClient` bez generiky), takže názvy RPC ani vynechané parametry
 * TypeScript nekontroluje. Tento test je proto jediná statická pojistka.
 *
 * Živé chování proti reálné DB ověřuje staging-only spec 153.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const MIGRATION_PATH =
  'supabase/migrations/20260903160000_admin_manage_contest_hardening.sql';
const CONTEST_DETAIL_ADMIN = 'src/components/ContestDetailAdmin.tsx';
const ADMIN_CONTEST_MGMT = 'src/components/AdminContestManagement.tsx';

const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, '');

/** Tělo funkce od `CREATE OR REPLACE FUNCTION <name>` po ukončovací `$$;`. */
function functionBody(sql: string, functionName: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}(`);
  expect(start, `${functionName} nebyla v migraci nalezena`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf('$$;', start);
  expect(end, `${functionName} nemá ukončení těla`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

/** Hlavička funkce (seznam parametrů) — od `CREATE ...(` po `RETURNS`. */
function functionSignature(sql: string, functionName: string): string {
  const body = functionBody(sql, functionName);
  const end = body.indexOf('RETURNS');
  expect(end, `${functionName} nemá RETURNS`).toBeGreaterThan(0);
  return body.slice(0, end);
}

test.describe('admin_manage_contest — kontrakt zpevnění', () => {
  test('guard běží nad kanonickou user_roles, ne nad legacy users.role', () => {
    const body = stripSqlComments(functionBody(read(MIGRATION_PATH), 'admin_manage_contest'));

    expect(body).toContain("public.has_role(v_admin_id, 'admin'::public.app_role)");
    expect(body).toContain("public.has_role(v_admin_id, 'superadmin'::public.app_role)");
    expect(body).toContain("RAISE EXCEPTION 'Pouze administrátoři mohou spravovat soutěže'");

    // Přesně ten legacy dotaz, který tu byl dřív:
    //   IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_admin_id AND role IN (...))
    expect(
      body,
      'nesmí číst legacy public.users.role — produkce má doložený drift'
    ).not.toMatch(/FROM\s+users\b/i);
    expect(body).not.toMatch(/\brole\s+IN\s*\(\s*'admin'/i);
  });

  test('vynechaný parametr znamená „neměnit" — žádné nebezpečné defaulty', () => {
    const sig = stripSqlComments(functionSignature(read(MIGRATION_PATH), 'admin_manage_contest'));

    // Toto byla hlavní příčina: uložení poznámky přepsalo velikost i status.
    expect(sig, 'p_status nesmí defaultovat na draft').not.toMatch(
      /p_status\s+text\s+DEFAULT\s+'draft'/i
    );
    expect(sig, 'p_ticket_count nesmí defaultovat na 1000000').not.toMatch(
      /p_ticket_count\s+integer\s+DEFAULT\s+1000000/i
    );
    expect(sig, 'p_ticket_price nesmí defaultovat na 1').not.toMatch(
      /p_ticket_price\s+numeric\s+DEFAULT\s+1\b/i
    );

    for (const param of ['p_status text', 'p_ticket_count integer', 'p_ticket_price numeric']) {
      expect(sig).toContain(`${param} DEFAULT NULL`);
    }

    // Signatura musí zůstat kompatibilní se stávajícími volajícími.
    for (const param of [
      'p_contest_id uuid',
      'p_title text',
      'p_description text',
      'p_main_prize text',
      'p_main_image text',
      'p_operation text',
      'p_fast_game boolean',
    ]) {
      expect(sig).toContain(param);
    }
    expect(sig, 'operace musí dál defaultovat na create').toContain(
      "p_operation text DEFAULT 'create'"
    );

    // CREATE větev musí původní defaulty zachovat, jinak by se změnilo
    // chování zakládání soutěže.
    const body = stripSqlComments(functionBody(read(MIGRATION_PATH), 'admin_manage_contest'));
    expect(body).toContain("COALESCE(p_status, 'draft')");
    expect(body).toContain('COALESCE(p_ticket_count, 1000000)');
    expect(body).toContain('COALESCE(p_ticket_price, 1)');
  });

  test('ticket_count je po prvním vydaném tiketu neměnný', () => {
    const body = stripSqlComments(functionBody(read(MIGRATION_PATH), 'admin_manage_contest'));

    // Blokuje se jen skutečná změna hodnoty — shodná hodnota musí projít,
    // jinak by formulář, který ticket_count posílá vždy, přestal ukládat.
    expect(body).toContain('p_ticket_count IS DISTINCT FROM v_old_record.ticket_count');
    expect(body).toMatch(/EXISTS \(SELECT 1 FROM public\.tickets WHERE contest_id = p_contest_id\)/);
    expect(body).toContain('Počet tiketů nelze změnit');
    expect(body).toContain('next_ticket_number');
  });

  test('closed je konečný stav i v této RPC', () => {
    const body = stripSqlComments(functionBody(read(MIGRATION_PATH), 'admin_manage_contest'));

    expect(body).toContain("v_old_record.status = 'closed'");
    expect(body).toContain('Uzavřenou soutěž nelze vrátit do stavu');
  });

  test('zámek řádku a žádné polykání chyb', () => {
    const body = stripSqlComments(functionBody(read(MIGRATION_PATH), 'admin_manage_contest'));

    // Velikost i status se vyhodnocují proti zamčenému řádku.
    expect(body).toContain('FOR UPDATE');
    const lockAt = body.indexOf('FOR UPDATE');
    const sizeGuardAt = body.indexOf('Počet tiketů nelze změnit');
    expect(lockAt, 'zámek musí předcházet kontrole velikosti').toBeLessThan(sizeGuardAt);

    // Původní blok EXCEPTION WHEN OTHERS zahazoval SQLSTATE i kontext a
    // slepil všechny chyby do jedné obecné hlášky.
    expect(body).not.toMatch(/EXCEPTION\s+WHEN\s+OTHERS/i);
    expect(body).not.toContain('Chyba při správě soutěže');

    // Audit zůstává zachovaný.
    expect(body).toMatch(/INSERT INTO admin_actions/);
    expect(body).toContain("CONCAT('contest_', p_operation)");
    expect(body).toContain('notify_sofinity_event');
  });

  test('trigger uzamyká velikost i mimo RPC', () => {
    const sql = stripSqlComments(read(MIGRATION_PATH));
    const trg = functionBody(sql, 'contests_guard_ticket_count');

    // Politika contests_admin_update dovoluje adminovi přímý UPDATE tabulky,
    // takže guard jen uvnitř RPC by nestačil.
    expect(sql).toContain('CREATE TRIGGER trg_contests_guard_ticket_count');
    expect(
      sql,
      'BEFORE UPDATE OF ticket_count — jinak by trigger běžel i pro buy_ticket_atomic'
    ).toMatch(/BEFORE UPDATE OF ticket_count ON public\.contests/);

    expect(trg).toContain('NEW.ticket_count IS NOT DISTINCT FROM OLD.ticket_count');
    expect(trg).toMatch(/EXISTS \(SELECT 1 FROM public\.tickets WHERE contest_id = OLD\.id\)/);
    expect(trg).toContain('Počet tiketů nelze změnit');
  });

  test('EXECUTE granty jsou minimální — bez anon a bez PUBLIC', () => {
    const sql = read(MIGRATION_PATH);
    const sig =
      'public.admin_manage_contest(uuid, text, text, text, text, text, integer, numeric, text, boolean)';

    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC`);
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${sig} FROM anon`);
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${sig} TO authenticated`);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.contests_guard_ticket_count() FROM anon');
  });

  test('UI volající posílají explicitní NULL místo spoléhání na defaulty', () => {
    // Vynechaný parametr = DEFAULT funkce, ne NULL. Dokud na produkci není
    // migrace, je tohle jediná ochrana; potom je to obrana do hloubky.
    for (const [file, label] of [
      [CONTEST_DETAIL_ADMIN, 'ContestDetailAdmin'],
      [ADMIN_CONTEST_MGMT, 'AdminContestManagement'],
    ] as const) {
      const src = read(file);
      const calls = src.split(/rpc\(\s*['"]admin_manage_contest['"]/).slice(1);
      expect(calls.length, `${label} musí volat admin_manage_contest`).toBeGreaterThan(0);

      for (const [i, tail] of calls.entries()) {
        const args = tail.slice(0, tail.indexOf('}'));
        // CREATE (p_contest_id: null) posílá celý formulář; update musí být explicitní.
        if (!args.includes('p_operation: "update"') && !args.includes("p_operation: 'update'")) {
          continue;
        }
        for (const param of ['p_ticket_count', 'p_ticket_price', 'p_status']) {
          expect(
            args,
            `${label} volání #${i + 1} musí posílat ${param} explicitně`
          ).toContain(param);
        }
      }
    }
  });

  test('UI blokuje změnu počtu tiketů u soutěže s vydanými tikety', () => {
    const src = read(ADMIN_CONTEST_MGMT);

    expect(src).toContain('ticketCountLocked');
    expect(src).toMatch(/disabled=\{ticketCountLocked\}/);
    expect(src).toContain('Počet tiketů už nelze změnit');
  });

  test('migrace nemění data, schéma ani RLS', () => {
    const sql = stripSqlComments(read(MIGRATION_PATH));

    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/\bUPDATE\s+public\.contests\s+SET/i);
    expect(sql).not.toMatch(/DROP\s+(TABLE|POLICY|CONSTRAINT)/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE/i);
    expect(sql).not.toMatch(/CREATE\s+POLICY/i);

    const defined = (sql.match(/CREATE OR REPLACE FUNCTION public\.(\w+)/g) ?? []).sort();
    expect(defined).toEqual([
      'CREATE OR REPLACE FUNCTION public.admin_manage_contest',
      'CREATE OR REPLACE FUNCTION public.contests_guard_ticket_count',
    ]);
  });
});
