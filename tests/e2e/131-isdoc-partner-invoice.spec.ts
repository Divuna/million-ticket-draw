import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Spec 131 — the ISDOC partner invoice export.
 *
 * The fixture is NOT hand-written. It is the byte-for-byte file that the
 * deployed staging generate-isdoc wrote to Storage for invoice OMA-20260001
 * (17. 08. 2026), downloaded again from the bucket. That invoice was produced by
 * the real billing path: three rewards of 0.6 + 1.2 + 2.5 MC issued by
 * compute_partner_reward, redeemed by a customer, then invoiced by
 * create_partner_invoices_for_period at 1.00 Kc/MC and 21 % VAT.
 *
 * It was validated against the official ISDOC 6.0.1 XSD
 * (https://isdoc.cz/6.0.1/xsd/isdoc-invoice-6.0.1.xsd) with xmllint: VALID.
 * That validation is not repeated here because it needs a 140 kB schema and a
 * native/wasm validator; what IS locked here is everything a schema cannot see —
 * the accounting invariants, the quantity/money separation, the supplier
 * identity, and the absence of bank details.
 *
 * Schematron was not run: the official .sch is not published. Every conventional
 * location (isdoc.cz/6.0.1/isdoc-invoice-6.0.1.sch and the /xsd/ and /sch/
 * variants, http and https) returns HTTP 404, while the .xsd at the same host
 * returns 200. So the business rules Schematron would normally assert are
 * asserted directly below instead.
 *
 * No network, no DB, no emails.
 */

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

const isdoc = read('tests/e2e/fixtures/isdoc/staging-OMA-20260001.isdoc');
const fn = read('supabase/functions/generate-isdoc/index.ts');
const payloadSql = read(
  'supabase/migrations/20260817170000_build_isdoc_payload_real_invoice_fields.sql',
);

/** Text of the first <tag>…</tag>, ignoring attributes. */
function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`));
  return m ? m[1] : null;
}

/** Text of every <tag>…</tag>. */
function tags(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`, 'g'))].map(
    (m) => m[1],
  );
}

const money = (name: string): number => {
  const raw = tag(isdoc, name);
  expect(raw, `<${name}> is present`).not.toBeNull();
  return Number(raw);
};

const invoiceLine = isdoc.slice(
  isdoc.indexOf('<InvoiceLine>'),
  isdoc.indexOf('</InvoiceLine>'),
);

// ───────────────────────────────────────────────────────────────────────────────
// 1. The document describes the invoice that exists, not a re-derived one
// ───────────────────────────────────────────────────────────────────────────────

test('131a ISDOC carries the real invoice number, symbol and dates', () => {
  // partner_invoices row OMA-20260001: issue 2026-08-17, due 2026-08-31, VS 20260001.
  expect(tag(isdoc, 'ID')).toBe('OMA-20260001');
  expect(tag(isdoc, 'ReferenceNumber')).toBe('20260001');
  expect(tag(isdoc, 'IssueDate')).toBe('2026-08-17');
  expect(tag(isdoc, 'TaxPointDate')).toBe('2026-08-17');

  // The due date is 14 days after issue here by coincidence of the invoicing
  // rules — what matters is that it is the STORED due_date, carried in the Note
  // because PaymentMeans is omitted (see 131h).
  expect(isdoc).toContain('Datum splatnosti 2026-08-31');

  // Never a synthesised number.
  expect(isdoc).not.toMatch(/INV-\d{4}-/);
});

test('131b generate-isdoc invents no invoice number and no dates', () => {
  // The bug this replaces: ID was `INV-${year}-${uuid.slice(0,8)}`, IssueDate and
  // TaxPointDate were today, and the due date was today + 14 days — all while
  // partner_invoices already stored the real values.
  expect(fn).not.toMatch(/INV-\$\{/);
  expect(fn).not.toMatch(/new Date\(\)\s*\.\s*toISOString/);
  expect(fn).not.toMatch(/86400000|24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);

  // Dates come from the payload only.
  expect(fn).toContain('isoDate(payload.issue_date)');
  expect(fn).toContain('isoDate(payload.due_date)');
  expect(fn).toContain('isoDate(payload.taxable_date)');
});

test('131c build_isdoc_payload exposes the real invoice fields and recomputes no money', () => {
  for (const key of [
    "'invoice_number',  inv.invoice_number",
    "'variable_symbol', inv.variable_symbol",
    "'issue_date',      inv.issue_date",
    "'due_date',        inv.due_date",
    "'taxable_date',    inv.taxable_date",
    "'price_per_coin',  ppc",
  ]) {
    expect(payloadSql).toContain(key);
  }

  // Money is read straight off the invoice: no arithmetic on the money keys.
  expect(payloadSql).toContain("'amount_net',      inv.amount_net");
  expect(payloadSql).toContain("'vat_amount',      inv.vat_amount");
  expect(payloadSql).toContain("'amount_gross',    inv.amount_gross");
  // Those three keys carry a bare column reference — no round(), no arithmetic.
  for (const key of ['amount_net', 'vat_amount', 'amount_gross']) {
    const line = payloadSql
      .split('\n')
      .find((l) => l.includes(`'${key}',`));
    expect(line, `payload builds '${key}'`).toBeTruthy();
    expect(line!.trim()).toMatch(new RegExp(`^'${key}',\\s+inv\\.${key},$`));
  }

  // Read-only projection.
  expect(payloadSql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\s+INTO\b/i);
  expect(payloadSql).not.toMatch(/\bUPDATE\s+public\./i);
});

// ───────────────────────────────────────────────────────────────────────────────
// 2. Accounting invariants — what Schematron would check
// ───────────────────────────────────────────────────────────────────────────────

test('131d the invoice adds up: line = tax subtotal = total = payable', () => {
  const net = money('LineExtensionAmount');
  const vat = money('LineExtensionTaxAmount');
  const gross = money('LineExtensionAmountTaxInclusive');

  // net + VAT = gross, exactly, in hundredths — no half-haler drift.
  expect(Math.round(net * 100) + Math.round(vat * 100)).toBe(Math.round(gross * 100));

  expect(money('TaxableAmount')).toBe(net);
  expect(money('TaxAmount')).toBe(vat);
  expect(money('TaxInclusiveAmount')).toBe(gross);
  expect(money('TaxExclusiveAmount')).toBe(net);
  expect(money('PayableAmount')).toBe(gross);

  // Nothing prepaid and nothing rounded away.
  expect(money('PaidDepositsAmount')).toBe(0);
  expect(money('PayableRoundingAmount')).toBe(0);

  // And it is the invoice that was actually stored.
  expect(net).toBe(4.3);
  expect(vat).toBe(0.9);
  expect(gross).toBe(5.2);
});

test('131e VAT is a percentage rate and matches the amounts', () => {
  const percents = tags(isdoc, 'Percent');
  expect(percents.length).toBeGreaterThan(0);
  for (const p of percents) {
    // 21, never the 0.21 fraction the DB stores.
    expect(Number(p)).toBe(21);
  }

  const net = money('LineExtensionAmount');
  const vat = money('LineExtensionTaxAmount');
  expect(Math.round(vat * 100)).toBe(Math.round(net * 0.21 * 100));

  // VATCalculationMethod 0 = computed from the net, which is how
  // create_partner_invoices_for_period derives vat_amount.
  expect(tag(invoiceLine, 'VATCalculationMethod')).toBe('0');
  expect(fn).toContain('function vatFraction');
  expect(fn).toContain('r > 1 ? r / 100 : r');
});

test('131f every money value has exactly two decimals', () => {
  const moneyElements = [
    'LineExtensionAmount',
    'LineExtensionAmountTaxInclusive',
    'LineExtensionTaxAmount',
    'UnitPrice',
    'UnitPriceTaxInclusive',
    'TaxableAmount',
    'TaxAmount',
    'TaxInclusiveAmount',
    'TaxExclusiveAmount',
    'PayableAmount',
    'PaidDepositsAmount',
    'PayableRoundingAmount',
  ];
  for (const name of moneyElements) {
    for (const value of tags(isdoc, name)) {
      expect(value, `<${name}> is written with 2 decimals`).toMatch(/^-?\d+\.\d{2}$/);
    }
  }
  expect(fn).toContain('num(v).toFixed(2)');
});

// ───────────────────────────────────────────────────────────────────────────────
// 3. MioCoin quantity is a quantity, not an amount
// ───────────────────────────────────────────────────────────────────────────────

test('131g the MioCoin count is the quantity and the price is per coin', () => {
  // The original bug: InvoicedQuantity was hardcoded 1 and the coin count was put
  // into LineExtensionAmount, so 4.3 MioCoins read as "4.30 Kc of one thing".
  expect(invoiceLine).toMatch(/<InvoicedQuantity unitCode="ks">4\.3<\/InvoicedQuantity>/);
  expect(invoiceLine).not.toMatch(/<InvoicedQuantity[^>]*>1<\/InvoicedQuantity>/);

  const qty = Number(tag(invoiceLine, 'InvoicedQuantity'));
  const unit = money('UnitPrice');
  const net = money('LineExtensionAmount');

  // 4.3 units x 1.00 Kc = 4.30 Kc.
  expect(Math.round(qty * unit * 100)).toBe(Math.round(net * 100));
  expect(unit).toBe(1);

  // The quantity keeps the one-decimal MioCoin rule and is NOT money-formatted.
  expect(tag(invoiceLine, 'InvoicedQuantity')).toMatch(/^\d+(\.\d)?$/);

  // UnitPriceTaxInclusive is the unit price grossed up, not the line total.
  expect(money('UnitPriceTaxInclusive')).toBe(1.21);

  expect(fn).toContain('const quantity = (v: unknown): string =>');
  expect(fn).toContain('Math.round(num(v) * 10) / 10');
});

// ───────────────────────────────────────────────────────────────────────────────
// 4. Identity and secrets
// ───────────────────────────────────────────────────────────────────────────────

test('131h the supplier is the real legal entity and no bank details are present', () => {
  // COMPANY_CONTEXT.md: OneMil is a brand of iCONIC POINT s.r.o. "OneMil s.r.o."
  // does not exist and must never appear as a legal party.
  expect(isdoc).toContain('iCONIC POINT s.r.o.');
  expect(isdoc).toContain('<ID>17795851</ID>');
  expect(isdoc).toContain('<CompanyID>CZ17795851</CompanyID>');
  expect(isdoc).toContain('<StreetName>Na Folimance</StreetName>');
  expect(isdoc).toContain('<BuildingNumber>2155/15</BuildingNumber>');
  expect(isdoc).toContain('<PostalZone>120 00</PostalZone>');
  expect(isdoc).not.toContain('OneMil s.r.o.');
  expect(isdoc).not.toContain('Na prikope');

  // COMPANY_CONTEXT.md forbids bank details in the repository, so PaymentMeans is
  // deliberately omitted rather than filled with an invented account. Guard both
  // the fixture and the source.
  expect(isdoc).not.toContain('<PaymentMeans');
  expect(isdoc).not.toContain('BankAccount');
  expect(isdoc).not.toMatch(/\bIBAN\b/i);
  expect(isdoc).not.toMatch(/\b\d{6,10}\/\d{4}\b/); // czech account/bank-code pair
  expect(fn).not.toMatch(/\bIBAN\b/i);
  expect(fn).not.toMatch(/<PaymentMeans/);
});

test('131i the customer is the invoiced partner, from partner data', () => {
  expect(isdoc).toContain('ISDOC Decimal Test s.r.o.');
  expect(isdoc).toContain('<ID>12345678</ID>');
  expect(isdoc).toContain('<CompanyID>CZ12345678</CompanyID>');

  // The street is split into name + number, both of which PostalAddressType needs.
  expect(isdoc).toContain('<StreetName>Testovaci</StreetName>');
  expect(isdoc).toContain('<BuildingNumber>1024/7</BuildingNumber>');
  expect(fn).toContain('function splitStreet');
});

// ───────────────────────────────────────────────────────────────────────────────
// 5. Schema shape that a reordering edit would silently break
// ───────────────────────────────────────────────────────────────────────────────

test('131j InvoiceLine children follow the ISDOC 6.0.1 sequence', () => {
  // InvoiceLineType is an xs:sequence, so order is part of validity. A future edit
  // that moves UnitPrice above LineExtensionAmount produces a file that looks fine
  // and fails validation at the accountant.
  const expected = [
    'ID',
    'InvoicedQuantity',
    'LineExtensionAmount',
    'LineExtensionAmountTaxInclusive',
    'LineExtensionTaxAmount',
    'UnitPrice',
    'UnitPriceTaxInclusive',
    'ClassifiedTaxCategory',
    'Item',
  ];
  const actual = [...invoiceLine.matchAll(/<([A-Z][A-Za-z]*)(?:\s[^>]*)?>/g)]
    .map((m) => m[1])
    .filter((name) => expected.includes(name));
  expect(actual).toEqual(expected);
});

test('131k the document declares ISDOC 6.0.1 and uses no currencyID attributes', () => {
  expect(isdoc).toContain('xmlns="http://isdoc.cz/namespace/2013"');
  expect(isdoc).toContain('version="6.0.1"');
  expect(isdoc).toContain('<DocumentType>1</DocumentType>');

  // ISDOC 6.0.1 amounts are plain xs:decimal; a currencyID attribute is rejected.
  // The currency is declared once, in LocalCurrencyCode.
  expect(isdoc).not.toContain('currencyID');
  expect(tag(isdoc, 'LocalCurrencyCode')).toBe('CZK');
});

// ───────────────────────────────────────────────────────────────────────────────
// 6. Authorization
// ───────────────────────────────────────────────────────────────────────────────

test('131l generate-isdoc authorizes every request internally', () => {
  // Before this change the function had NO internal check and relied on verify_jwt
  // alone, so any logged-in user could export any partner's invoice. Verified live
  // on staging after the fix: no auth -> 401, wrong internal token -> 401, anon key
  // -> 401, real non-superadmin user -> 403, superadmin -> 200.
  expect(fn).toContain('async function authorizeRequest');
  expect(fn).toContain('const authFailure = await authorizeRequest(req);');

  // The check runs before the body is read, so an unauthorized caller cannot even
  // probe invoice ids.
  expect(fn.indexOf('const authFailure')).toBeLessThan(fn.indexOf('await req.json()'));

  expect(fn).toContain('INTERNAL_FUNCTION_TOKEN');
  expect(fn).toContain("'access_denied_superadmin_only'");
  expect(fn).toContain(".eq('role', 'superadmin')");
});

test('131m the export is stored privately, never as a public URL', () => {
  expect(fn).toContain("from('partner-invoices')");
  expect(fn).toContain('file_url: null');
  expect(fn).not.toContain('getPublicUrl');
});
