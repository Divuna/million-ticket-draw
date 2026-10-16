import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function listSrcFiles(dir = 'src'): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listSrcFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path.replace(/\\/g, '/')] : [];
  });
}

const migrationPath =
  'supabase/migrations/20260903084000_fix_miocoin_bonus_double_credit.sql';

function functionBody(sql: string): string {
  const startMarker =
    'CREATE OR REPLACE FUNCTION public.claim_miocoin_bonus(p_bonus_id uuid, p_user_id uuid)';
  const start = sql.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf('$$;', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

test.describe('MioCoin bonus claim — no double credit contract', () => {
  test('claim is self-scoped and still requires the authenticated owner', () => {
    const migration = read(migrationPath);
    const body = functionBody(migration);

    expect(body).toContain('auth.uid() IS NULL');
    expect(body).toContain('p_user_id IS DISTINCT FROM auth.uid()');
    expect(body).toContain("RAISE EXCEPTION 'Unauthorized'");
  });

  test('claim atomically moves the prize amount from bonus balance to main balance', () => {
    const migration = read(migrationPath);
    const body = functionBody(migration);

    expect(body).toContain('FOR UPDATE OF bp, w');
    expect(body).toContain('FROM public.wallets');
    expect(body).toContain('FOR UPDATE');
    expect(body).toContain('v_bonus_balance < v_amount');
    expect(body).toContain('balance_coins       = balance_coins + v_amount');
    expect(body).toContain('bonus_balance_coins = bonus_balance_coins - v_amount');
  });

  test('claim never adds to main balance without also debiting bonus balance', () => {
    const body = functionBody(read(migrationPath));
    const addIndex = body.indexOf('balance_coins       = balance_coins + v_amount');
    const debitIndex = body.indexOf('bonus_balance_coins = bonus_balance_coins - v_amount');

    expect(addIndex).toBeGreaterThanOrEqual(0);
    expect(debitIndex).toBeGreaterThanOrEqual(0);
    expect(Math.abs(addIndex - debitIndex)).toBeLessThan(200);
  });

  test('claim remains single-use and records the movement in the wallet ledger', () => {
    const body = functionBody(read(migrationPath));

    expect(body).toContain("w.delivered = false");
    expect(body).toContain("bp.status   IN ('won', 'pending')");
    expect(body).toContain('INSERT INTO public.wallet_transactions');
    expect(body).toContain("'bonus_claim'");
    expect(body).toContain("'movement', 'bonus_to_main'");
    expect(body).toContain("SET status = 'delivered'");
    expect(body).toContain('SET delivered = true');
  });

  test('RPC grants stay restricted to authenticated users and service role', () => {
    const migration = read(migrationPath);

    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.claim_miocoin_bonus(uuid, uuid) FROM PUBLIC',
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.claim_miocoin_bonus(uuid, uuid) FROM anon',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.claim_miocoin_bonus(uuid, uuid) TO authenticated',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.claim_miocoin_bonus(uuid, uuid) TO service_role',
    );
  });

  test('frontend never calls the legacy one-argument claim', () => {
    // TicketResultModal (jediný dřívější volající) byl 16. 10. 2026 odstraněn – po redesignu se
    // nikde neotevíral. Kdyby se volání vrátilo, musí jít jen přes 2-arg self-scoped signaturu.
    for (const file of listSrcFiles()) {
      const source = read(file);
      if (!source.includes("rpc('claim_miocoin_bonus'")) continue;
      expect(source, file).toContain('p_user_id: user.id');
      // Starý 1-arg parametr hlídá globální sken ve spec 85.
    }
  });
});
