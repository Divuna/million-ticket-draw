import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Kontraktní zámek nad opravou tří potvrzených blokátorů provizního systému.
 *
 * Statický test (čte migrace a UI ze souborů) — neběží proti DB, nepotřebuje
 * secrets, takže hlídá regresi kdekoli včetně lokálního běhu.
 *
 * Blokátor #1: zákaznická větev musí filtrovat skutečný stav úspěšné Stripe
 *              platby (`completed`), který zapisuje stripe-webhook.
 * Blokátor #2: musí existovat guardovaná cesta `issued -> paid`.
 * Blokátor #3: B2B větev se musí řídit `paid_at`, ne obdobím faktury.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

/**
 * Spustitelné SQL bez `--` komentářů. Negativní tvrzení („nesmí obsahovat…")
 * musí platit o kódu, ne o dokumentaci — rollback poznámky staré varianty
 * záměrně citují, a bez tohoto očištění by test padal na vlastním komentáři.
 */
const readSqlCode = (p: string) =>
  read(p)
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

const COMMISSION_MIGRATION =
  'supabase/migrations/20260823120100_affiliate_commissions_real_payment_state_and_late_invoices.sql';
const MARK_PAID_MIGRATION =
  'supabase/migrations/20260823120000_admin_mark_partner_invoice_paid.sql';

test.describe('Affiliate commission blockers — contract (spec 142)', () => {
  test('#1 zákaznická větev počítá z `completed`, nikdy z `paid`', () => {
    const sql = readSqlCode(COMMISSION_MIGRATION);

    expect(sql, 'musí filtrovat reálný stav úspěšné Stripe platby').toContain(
      "pay.status = 'completed'",
    );
    expect(sql, 'nesmí se vrátit k neexistujícímu stavu `paid`').not.toContain(
      "pay.status = 'paid'",
    );
  });

  test('#1 stripe-webhook stále zapisuje `completed` (zdroj pravdy pro filtr výše)', () => {
    const webhook = read('supabase/functions/stripe-webhook/index.ts');
    expect(webhook).toContain("status: 'completed'");
  });

  test('#1 refundace se nezapočítávají a interní metody zůstávají vyloučené', () => {
    const sql = read(COMMISSION_MIGRATION);
    // 'refunded' je samostatný stav -> filtr na 'completed' ho vylučuje.
    expect(sql).not.toContain("pay.status IN ('completed','refunded')");
    expect(sql).toContain("NOT IN ('bonus','partner','api')");
  });

  test('#2 existuje guardovaná, idempotentní cesta issued -> paid', () => {
    const sql = read(MARK_PAID_MIGRATION);

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_mark_partner_invoice_paid');
    expect(sql, 'guard oprávnění').toContain('public.is_admin()');
    expect(sql, 'zámek řádku proti souběhu').toContain('FOR UPDATE');
    expect(sql, 'serverový čas úhrady').toContain('paid_at = now()');
    expect(sql, 'idempotence').toContain('already_paid');
    expect(sql, 'povolen pouze přechod z issued').toContain("v_status <> 'issued'");
    expect(sql, 'anon nesmí mít EXECUTE').toContain(
      'REVOKE ALL ON FUNCTION public.admin_mark_partner_invoice_paid(uuid) FROM anon',
    );
  });

  test('#2 administrace faktur nabízí akci „Označit jako zaplaceno" přes RPC', () => {
    const ui = read('src/pages/AdminInvoices.tsx');

    expect(ui).toContain('Označit jako zaplaceno');
    expect(ui).toContain('admin_mark_partner_invoice_paid');
    // Stav se nikdy nenastavuje přímým zápisem z klienta.
    expect(ui).not.toMatch(/from\(['"]partner_invoices['"]\)[\s\S]{0,120}\.update\(/);
  });

  test('#3 B2B větev se řídí paid_at, ne obdobím faktury', () => {
    const sql = readSqlCode(COMMISSION_MIGRATION);

    expect(sql, 'okamžik úhrady jako řídicí veličina').toContain('pi.paid_at IS NOT NULL');
    expect(sql, 'kumulativní okno pokryje i opožděnou úhradu').toContain(
      "date_trunc('month', pi.paid_at)::date <= v_month",
    );
    expect(sql, 'nesmí se vrátit k oknu podle období faktury').not.toContain(
      "date_trunc('month', pi.period_start)::date = v_month",
    );
  });

  test('#3 idempotence stojí na existující unikátní ochraně, ne na druhém enginu', () => {
    const sql = read(COMMISSION_MIGRATION);

    expect(sql).toContain('ON CONFLICT (source_invoice_id)');
    expect(sql).toContain('DO NOTHING');
    // Přepočet nikdy nesmí sáhnout na už schválené/vyplacené provize.
    expect(sql).toContain("WHERE period_month = v_month AND status = 'calculated'");
  });

  test('sazby, DPH ani způsob výpočtu se nemění', () => {
    const sql = read(COMMISSION_MIGRATION);

    expect(sql).toContain('a.commission_rate_customer / 100.0');
    expect(sql).toContain('a.commission_rate_company / 100.0');
    expect(sql).toContain('CASE WHEN s.is_vat_payer THEN 21 ELSE 0 END');
    expect(sql).toContain('CASE WHEN a.is_vat_payer THEN 21 ELSE 0 END');
    // Žádná migrace v tomto rozsahu nesmí přepisovat sazby v datech.
    expect(sql).not.toMatch(/UPDATE\s+public\.affiliate_accounts/i);
  });
});
