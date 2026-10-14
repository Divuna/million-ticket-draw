/**
 * Spec 164 — kontrakt chráněné cesty pro vystavení partnerské faktury
 * (draft -> issued)
 *
 * Statický contract test (bez DB, bez secretů — běží v každém CI, jako
 * spec 152/156/162).
 *
 * Řešená chyba (read-only admin audit, nález P1 #4): `issueInvoice()`
 * v `src/pages/AdminPartnersPortal.tsx` měnila `partner_invoices.status`
 * přímým klientským `.update({ status: 'issued', issued_at: <čas
 * z prohlížeče> })`. Chyběla serverová validace přechodu, `issued_at`
 * z prohlížeče místo serveru a audit záznam.
 *
 * Tento test zamyká, že:
 *  1. Frontend už NEPOUŽÍVÁ přímý `.from('partner_invoices').update(...)`
 *     pro vystavení faktury — jen volání chráněné RPC.
 *  2/3/4/5. RPC povoluje POUZE `draft -> issued`; `issued`/`paid`/`void`
 *     jsou odmítnuty jako `invalid_transition` (žádná tichá idempotence).
 *  6. Neoprávněný volající (ne-superadmin) je odmítnut jako `forbidden`
 *     — guard je STEJNÝ nebo PŘÍSNĚJŠÍ než dosavadní produkční RLS
 *     (`partner_invoices_admin_update` má `qual = is_superadmin()`),
 *     takže se NESMÍ rozšířit na `is_admin()`.
 *  7. `issued_at` nastavuje výhradně server (`now()`); funkce nemá žádný
 *     parametr, kterým by klient mohl čas dodat.
 *  8. Úspěšný přechod zapisuje auditní záznam do `admin_actions`.
 *
 * Migrace se v tomto PR nikam nenasazuje (`žádnou migraci nenasazuj`);
 * tento test ověřuje jen zdrojový SQL soubor a frontend zdrojový kód.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const MIGRATION_PATH =
  'supabase/migrations/20260907150000_admin_issue_partner_invoice_rpc.sql';
const ADMIN_PARTNERS_PORTAL = 'src/pages/AdminPartnersPortal.tsx';
const FUNCTION_NAME = 'admin_issue_partner_invoice';

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

test.describe('admin_issue_partner_invoice — kontrakt chráněné cesty draft -> issued', () => {
  test('frontend už nepoužívá přímý UPDATE pro draft -> issued', () => {
    const src = read(ADMIN_PARTNERS_PORTAL);

    // issueInvoice() musí volat RPC, ne .from('partner_invoices').update(...).
    const fnStart = src.indexOf('const issueInvoice = async () => {');
    expect(fnStart, 'issueInvoice funkce nenalezena').toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('\n  };', fnStart);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const fnBody = src.slice(fnStart, fnEnd);

    expect(
      fnBody,
      'issueInvoice nesmí přímo zapisovat do partner_invoices'
    ).not.toMatch(/from\(\s*['"]partner_invoices['"]\s*\)\s*\.\s*update/);
    expect(fnBody).toMatch(new RegExp(`rpc\\(\\s*['"]${FUNCTION_NAME}['"]`));
    expect(fnBody).toContain('p_invoice_id: selectedInvoice.id');

    // Žádný přímý zápis statusu z klienta zbytkem souboru pro tuto akci.
    expect(src).not.toMatch(
      /\.update\(\{\s*status:\s*['"]issued['"],\s*issued_at:\s*new Date\(\)/
    );
  });

  test('úspěšná hláška se zobrazí jen po potvrzeném serverovém úspěchu (žádný optimistický update)', () => {
    const src = read(ADMIN_PARTNERS_PORTAL);
    const fnStart = src.indexOf('const issueInvoice = async () => {');
    const fnEnd = src.indexOf('\n  };', fnStart);
    const fnBody = src.slice(fnStart, fnEnd);

    // Lokální stav (setInvoices/setSelectedInvoice na 'issued') se smí nastavit
    // až PO kontrole result.status === 'issued' && result.issued_at, ne dřív.
    const checkAt = fnBody.indexOf("result.status !== 'issued'");
    const setInvoicesAt = fnBody.indexOf('setInvoices(');
    expect(checkAt, 'chybí kontrola result.status').toBeGreaterThanOrEqual(0);
    expect(setInvoicesAt, 'chybí setInvoices po úspěchu').toBeGreaterThan(checkAt);

    expect(fnBody).toContain("toast.success('Faktura byla úspěšně vydána')");
    const toastAt = fnBody.indexOf("toast.success('Faktura byla úspěšně vydána')");
    expect(toastAt).toBeGreaterThan(setInvoicesAt);
  });

  test('povolen je jen draft -> issued; jiný stav je invalid_transition', () => {
    const body = stripSqlComments(functionBody(read(MIGRATION_PATH), FUNCTION_NAME));

    expect(body).toContain("IF v_status <> 'draft' THEN");
    expect(body).toContain("'status', 'invalid_transition'");
    expect(body).toContain("'from', v_status");
    expect(body).toContain("'to', 'issued'");

    // Žádná tichá idempotence pro issued/paid/void — na rozdíl od
    // admin_mark_partner_invoice_paid tahle RPC už-vystavenou fakturu
    // nevrací jako "already_issued" úspěch, ale odmítá.
    expect(body).not.toContain("'already_issued'");
  });

  for (const [label, status] of [
    ['issued -> issued', 'issued'],
    ['paid -> issued', 'paid'],
    ['void -> issued', 'void'],
  ] as const) {
    test(`${label} je odmítnuto (jediná podmínka povolující zápis je status = 'draft')`, () => {
      const body = stripSqlComments(functionBody(read(MIGRATION_PATH), FUNCTION_NAME));

      // Jediná větev, která provede UPDATE, je chráněná `v_status <> 'draft'`
      // guardem výše — takže žádný jiný počáteční stav než 'draft' k UPDATE
      // nedojde. Ověřujeme, že se v kódu nevyskytuje žádná speciální
      // povolující větev pro tento konkrétní stav.
      expect(body).not.toMatch(new RegExp(`v_status\\s*=\\s*'${status}'[\\s\\S]{0,80}status\\s*=\\s*'issued'`));

      const updateAt = body.indexOf('UPDATE public.partner_invoices');
      const guardAt = body.indexOf("IF v_status <> 'draft' THEN");
      expect(guardAt, 'guard musí předcházet UPDATE').toBeGreaterThanOrEqual(0);
      expect(updateAt, 'UPDATE musí existovat').toBeGreaterThan(guardAt);
    });
  }

  test('neoprávněný (ne-superadmin) volající je odmítnut — guard nesmí být širší než is_superadmin', () => {
    const body = stripSqlComments(functionBody(read(MIGRATION_PATH), FUNCTION_NAME));

    expect(body).toContain('IF NOT public.is_superadmin(v_admin_id) THEN');
    expect(body).toContain("'status', 'forbidden'");

    // Nesmí se rozšířit na plain admina — to by rozšířilo oprávnění nad
    // rámec dosavadní produkční RLS (partner_invoices_admin_update =
    // is_superadmin()).
    expect(body).not.toContain('public.is_admin()');
    expect(body).not.toMatch(/has_role\(v_admin_id,\s*'admin'/);
  });

  test('issued_at nastavuje výhradně server (now()), funkce nemá klientský parametr pro čas', () => {
    const sig = stripSqlComments(functionSignature(read(MIGRATION_PATH), FUNCTION_NAME));
    const body = stripSqlComments(functionBody(read(MIGRATION_PATH), FUNCTION_NAME));

    // Jediný parametr je ID faktury.
    expect(sig).toContain('p_invoice_id uuid');
    expect(sig).not.toMatch(/p_issued_at/);
    expect(sig).not.toMatch(/timestamp/i);

    expect(body).toContain('issued_at = now()');
  });

  test('úspěšná změna vytváří auditní záznam v admin_actions', () => {
    const body = stripSqlComments(functionBody(read(MIGRATION_PATH), FUNCTION_NAME));

    expect(body).toMatch(/INSERT INTO public\.admin_actions/);
    expect(body).toContain("'partner_invoice_issued'");
    expect(body).toContain("'partner_invoices'");
    expect(body).toContain('p_invoice_id');

    // Audit se vkládá až PO potvrzeném UPDATE (RETURNING issued_at INTO
    // v_issued_at), ne před ním nebo v selhávající větvi.
    const returningAt = body.indexOf('RETURNING issued_at INTO v_issued_at');
    const auditAt = body.indexOf('INSERT INTO public.admin_actions');
    expect(returningAt).toBeGreaterThanOrEqual(0);
    expect(auditAt).toBeGreaterThan(returningAt);
  });

  test('při selhání (forbidden/not_found/invalid_transition/conflict) se nezapisuje ani faktura, ani audit', () => {
    const body = stripSqlComments(functionBody(read(MIGRATION_PATH), FUNCTION_NAME));

    const forbiddenAt = body.indexOf("'status', 'forbidden'");
    const notFoundAt = body.indexOf("'status', 'not_found'");
    const invalidTransitionAt = body.indexOf("'status', 'invalid_transition'");
    const updateAt = body.indexOf('UPDATE public.partner_invoices');
    const auditAt = body.indexOf('INSERT INTO public.admin_actions');

    // Všechny odmítací větve musí RETURN dřív, než se vůbec dostane k UPDATE.
    for (const rejectAt of [forbiddenAt, notFoundAt, invalidTransitionAt]) {
      expect(rejectAt).toBeGreaterThanOrEqual(0);
      expect(rejectAt).toBeLessThan(updateAt);
    }

    // Souběh (conflict): pokud UPDATE nic nezapsal, funkce vrátí conflict
    // a nezapíše audit.
    const conflictCheckAt = body.indexOf('IF v_issued_at IS NULL THEN');
    const conflictReturnAt = body.indexOf("'status', 'conflict'");
    expect(conflictCheckAt).toBeGreaterThan(updateAt);
    expect(conflictReturnAt).toBeGreaterThan(conflictCheckAt);
    expect(conflictReturnAt).toBeLessThan(auditAt);
  });

  test('zámek řádku (FOR UPDATE) předchází kontrole přechodu', () => {
    const body = stripSqlComments(functionBody(read(MIGRATION_PATH), FUNCTION_NAME));

    expect(body).toContain('FOR UPDATE');
    const lockAt = body.indexOf('FOR UPDATE');
    const transitionGuardAt = body.indexOf("IF v_status <> 'draft' THEN");
    expect(lockAt).toBeLessThan(transitionGuardAt);

    // Druhá pojistka proti souběhu přímo v UPDATE.
    expect(body).toMatch(/WHERE id = p_invoice_id\s+AND status = 'draft'/);
  });

  test('EXECUTE granty jsou minimální — bez anon a bez PUBLIC', () => {
    const sql = read(MIGRATION_PATH);
    const sig = `public.${FUNCTION_NAME}(uuid)`;

    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC`);
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${sig} FROM anon`);
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${sig} TO authenticated`);
  });

  test('migrace nemění částky, DPH, MioCoiny, platby, provize ani automatické vystavování', () => {
    const sql = stripSqlComments(read(MIGRATION_PATH));

    expect(sql).not.toMatch(/amount_ex_vat|amount_gross|amount_net|vat_amount|vat_rate/i);
    expect(sql).not.toMatch(/coins_activated|coins_total/i);
    expect(sql).not.toMatch(/wallet|payment|commission|provize/i);
    expect(sql).not.toMatch(/create_partner_invoices_for_last_week|create_partner_invoices_for_period/i);
    expect(sql).not.toMatch(/DROP\s+(TABLE|POLICY|CONSTRAINT|FUNCTION)/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE/i);
    expect(sql).not.toMatch(/CREATE\s+POLICY/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM/i);

    // Migrace definuje přesně jednu novou funkci.
    const defined = (sql.match(/CREATE OR REPLACE FUNCTION public\.(\w+)/g) ?? []).sort();
    expect(defined).toEqual([`CREATE OR REPLACE FUNCTION public.${FUNCTION_NAME}`]);
  });
});
