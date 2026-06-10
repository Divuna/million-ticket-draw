/**
 * Lokalni generator vzoroveho Air Bank ABO .kpc souboru.
 *
 * Slouzi POUZE pro rucni importni test v Air Bank internetovem bankovnictvi.
 * Nesmi byt pouzit v produkci ani pro ostrou platbu.
 *
 * Spusteni:
 *   node docs/affiliate-payouts/sample-bank-export/generate-sample.cjs
 *
 * Vystup: sample-onemil-YYYYMMDD.kpc (vedle tohoto souboru)
 */

const path = require('path');
const fs = require('fs');

// --- Pomocne funkce (zrcadli buildAboKpc z generate-affiliate-bank-export/index.ts) ---

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
  const dueDate = dateDDMMYY(prepared.due_date);
  const totalHalere = amountToHalere(prepared.total_amount_czk, 14);
  const lines = [];

  lines.push('UHL1');
  lines.push(`1 1501 000001 ${prepared.payer_bank_code}`);
  lines.push(`2 ${payerAccount} ${totalHalere} ${dueDate}`);

  for (const item of prepared.items) {
    const recipientAccount = formatAccount(item.recipient_account);
    const amountHalere = amountToHalere(item.amount_czk, 12);
    const vs = item.variable_symbol;
    const bankAndKs = `${item.recipient_bank_code}${item.constant_symbol ?? '0000'}`;
    const ss = item.specific_symbol ?? '0';
    const message = normalizeMessage(item.payment_message);
    lines.push(`${recipientAccount} ${amountHalere} ${vs} ${bankAndKs} ${ss} ${message}`);
  }

  lines.push('3 +');
  lines.push('5 +');

  return lines.join('\r\n') + '\r\n';
}

// --- Testovaci data ---
// Ucet platce: 1000000001 / 3030 (Air Bank)
// Prijemce 1:  12545857 / 0800 (Ceska sporitelna) — 123,45 Kc
// Prijemce 2:  987654321 / 0300 (CSOB)            — 456,00 Kc
// Splatnost:   2026-06-25

const prepared = {
  payer_account:     '1000000001',
  payer_bank_code:   '3030',
  due_date:          '2026-06-25',
  total_amount_czk:  579.45,   // 123.45 + 456.00
  batch_number:      'DAV20260001',
  items: [
    {
      recipient_account:  '12545857',
      recipient_bank_code:'0800',
      amount_czk:         123.45,
      variable_symbol:    '2026060001',
      constant_symbol:    '0000',
      specific_symbol:    null,
      payment_message:    'Provize obchodnik Novak',
    },
    {
      recipient_account:  '987654321',
      recipient_bank_code:'0300',
      amount_czk:         456.00,
      variable_symbol:    '2026060002',
      constant_symbol:    '0000',
      specific_symbol:    null,
      payment_message:    'Provize obchodnik Kratka',
    },
  ],
};

const content = buildAboKpc(prepared);
const bytes = Buffer.from(content, 'ascii');

// Overeni: vsechny bajty <= 0x7F
const nonAscii = [...bytes].filter(b => b > 0x7F);
if (nonAscii.length > 0) {
  console.error('CHYBA: soubor obsahuje non-ASCII bajty:', nonAscii);
  process.exit(1);
}

// Overeni: pouze CRLF konce radku (zadny osamelý LF)
if (/[^\r]\n/.test(content)) {
  console.error('CHYBA: soubor obsahuje LF bez predchoziho CR');
  process.exit(1);
}

const outName = `sample-onemil-20260625.kpc`;
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
console.log('DALSI KROK: ');
console.log('  Prihlaste se do Air Bank internetoveho bankovnictvi (testovaci nebo ostry ucet).');
console.log('  Importujte tento soubor jako "Hromadny prikaz k uhrade" (ABO / .kpc format).');
console.log('  Zkontrolujte, ze banka soubor akceptuje a spravne zobrazuje platby.');
console.log('  BEZ tohoto overeni nesmite aplikovat Fazi D na staging!');
