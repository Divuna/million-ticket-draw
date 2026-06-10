/**
 * Druhy vzorovy soubor — overeni "K oprave" s realnym uctem prijemce.
 *
 * Pouzit POUZE pro rucni importni test v Air Bank internetovem bankovnictvi.
 * Platbu NEODESILAT — jde pouze o format/validacni test.
 *
 * Prijemce: 225259937/0600 (MONETA Money Bank) — realny ucet poskytnuty Pavlem.
 *
 * Spusteni:
 *   node docs/affiliate-payouts/sample-bank-export/generate-sample2-real-recipient.cjs
 */

const path = require('path');
const fs   = require('fs');

// --- Pomocne funkce (identicky s generate-sample.cjs) ---

function padLeft(value, length, char = '0') {
  return value.slice(-length).padStart(length, char);
}

function parseCzechAccount(raw) {
  const cleaned = raw.replace(/\s/g, '');
  const match = cleaned.match(/^(?:(\d{1,6})-)?(\d{1,10})$/);
  if (!match) throw new Error(`Invalid account: ${raw}`);
  return { prefix: match[1] ?? '0', number: match[2] };
}

function formatAccount(account) {
  const parsed = parseCzechAccount(account);
  const number = padLeft(parsed.number, 10);
  if (parsed.prefix && parsed.prefix !== '0') {
    return `${padLeft(parsed.prefix, 6)}-${number}`;
  }
  return number;
}

function amountToHalere(value, maxLen) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid amount: ${value}`);
  const halere = String(Math.round(n * 100));
  if (halere.length > maxLen) throw new Error(`Amount too large for ${maxLen} digits: ${value}`);
  return halere.padStart(maxLen, '0');
}

function dateDDMMYY(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(date.getUTCFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

function stripDiacritics(value) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeMessage(value) {
  return stripDiacritics(value ?? '')
    .replace(/[^\x20-\x7E]/g, '')
    .slice(0, 35);
}

function buildAboKpc(prepared) {
  const payerAccount = formatAccount(prepared.payer_account);
  const dueDate      = dateDDMMYY(prepared.due_date);
  const totalHalere  = amountToHalere(prepared.total_amount_czk, 14);
  const lines = [];

  lines.push('UHL1');
  lines.push(`1 1501 000001 ${prepared.payer_bank_code}`);
  lines.push(`2 ${payerAccount} ${totalHalere} ${dueDate}`);

  for (const item of prepared.items) {
    const recipientAccount = formatAccount(item.recipient_account);
    const amountHalere     = amountToHalere(item.amount_czk, 12);
    const vs               = item.variable_symbol;
    const bankAndKs        = `${item.recipient_bank_code}${item.constant_symbol ?? '0000'}`;
    const ss               = item.specific_symbol ?? '0';
    const message          = normalizeMessage(item.payment_message);
    lines.push(`${recipientAccount} ${amountHalere} ${vs} ${bankAndKs} ${ss} ${message}`);
  }

  lines.push('3 +');
  lines.push('5 +');

  return lines.join('\r\n') + '\r\n';
}

// --- Testovaci data ---
// Platce:   3151752019 / 3030 (Iconic Point s.r.o., Air Bank)
// Prijemce: 225259937  / 0600 (MONETA Money Bank) — realny ucet, Pavel
// Castka:   1,00 Kc (symbolicky minimum)
// Splatnost: 2026-06-25

const prepared = {
  payer_account:    '3151752019',
  payer_bank_code:  '3030',
  due_date:         '2026-06-25',
  total_amount_czk: 1.00,
  batch_number:     'DAV20260002',
  items: [
    {
      recipient_account:   '225259937',
      recipient_bank_code: '0600',
      amount_czk:          1.00,
      variable_symbol:     '2026060010',
      constant_symbol:     '0000',
      specific_symbol:     null,
      payment_message:     'Test import Air Bank',
    },
  ],
};

const content = buildAboKpc(prepared);
const bytes   = Buffer.from(content, 'ascii');

// Overeni: vsechny bajty <= 0x7F
const nonAscii = [...bytes].filter(b => b > 0x7F);
if (nonAscii.length > 0) {
  console.error('CHYBA: soubor obsahuje non-ASCII bajty:', nonAscii);
  process.exit(1);
}

// Overeni: pouze CRLF
if (/[^\r]\n/.test(content)) {
  console.error('CHYBA: soubor obsahuje LF bez predchoziho CR');
  process.exit(1);
}

const outName = 'sample2-real-recipient-20260625.kpc';
const outPath = path.join(__dirname, outName);
fs.writeFileSync(outPath, bytes);

console.log(`Vygenerovano: ${outPath}`);
console.log(`Velikost:     ${bytes.byteLength} bajtu`);
console.log('');
console.log('=== Obsah souboru ===');
console.log(content.replace(/\r\n/g, '<CRLF>\n'));
console.log('=====================');
console.log('');
console.log('Overeni OK: vsechny bajty ASCII (<= 0x7F), konce radku CRLF.');
console.log('');
console.log('DALSI KROK:');
console.log('  Prihlaste se do Air Bank internetoveho bankovnictvi.');
console.log('  Importujte tento soubor jako "Hromadny prikaz k uhrade".');
console.log('  Zkontrolujte, zda se u platby NEZOBRAZUJE "K oprave".');
console.log('  Platbu NEODESILAT — jde pouze o format/validacni test.');
