/**
 * ABO (.kpc) domestic CZK payment file generator for Air Bank CZ.
 * Structure: UHL1 → accounting file header → group header → items → group end → file end
 * Encoding: Windows-1250 (we output ASCII-safe subset).
 * Amounts in haléře (CZK * 100).
 */

export interface AboPaymentRow {
  id: string;
  influencer_partner_id: string;
  period_month: string;
  amount_czk: number;
  partner_name: string;
  /** Czech account in format "prefix-number/bankcode" or "number/bankcode" */
  payout_account: string;
}

/** Parse Czech account "123456-1234567890/0300" → { prefix, number, bankCode } */
function parseCzechAccount(raw: string): { prefix: string; number: string; bankCode: string } {
  const cleaned = raw.replace(/\s/g, "");

  // Handle IBAN – extract from positions if CZ IBAN
  if (/^CZ\d{22}$/i.test(cleaned)) {
    // CZ IBAN: CZ + 2 check + 4 bank + 6 prefix + 10 account
    const bankCode = cleaned.slice(4, 8);
    const prefix = cleaned.slice(8, 14).replace(/^0+/, "");
    const number = cleaned.slice(14, 24).replace(/^0+/, "") || "0";
    return { prefix, number, bankCode };
  }

  // Standard format: [prefix-]number/bankcode
  const match = cleaned.match(/^(?:(\d+)-)?(\d+)\/(\d{4})$/);
  if (!match) {
    throw new Error(`Neplatný formát účtu: ${raw}`);
  }
  return {
    prefix: match[1] || "",
    number: match[2],
    bankCode: match[3],
  };
}

/** Pad/truncate string to exact length, right-padded with spaces */
function padRight(str: string, len: number): string {
  return str.slice(0, len).padEnd(len, " ");
}

/** Pad number string to exact length, left-padded with zeros */
function padLeft(str: string, len: number, char = "0"): string {
  return str.slice(0, len).padStart(len, char);
}

/** Format account as PPPPPP-UUUUUUUUUU (6 prefix + dash + 10 number = 17 chars) */
function formatAccount(prefix: string, number: string): string {
  return padLeft(prefix || "0", 6, "0") + "-" + padLeft(number, 10, "0");
}

/** Strip diacritics for safe ABO output */
function stripDiacritics(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Convert amount CZK to haléře string, zero-padded to 15 chars */
function toHalere(czk: number, len = 15): string {
  const halere = Math.round(czk * 100);
  return padLeft(String(halere), len, "0");
}

/** Current date as DDMMYY */
function dateDDMMYY(d: Date = new Date()): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(2);
  return dd + mm + yy;
}

const CR_LF = "\r\n";

/**
 * Generate ABO (.kpc) file content for Air Bank CZ domestic CZK batch payments.
 * @param rows Payment rows to include
 * @param debtorAccount Debtor Czech account "prefix-number/bankcode" or IBAN
 * @param debtorName Organization name (max 20 chars)
 */
export function generateAboFile(
  rows: AboPaymentRow[],
  debtorAccount: string = "000000-0000000000/3030",
  debtorName: string = "OneMil s.r.o."
): string {
  if (rows.length === 0) throw new Error("Žádné položky k exportu");

  const debtor = parseCzechAccount(debtorAccount);
  const debtorFormatted = formatAccount(debtor.prefix, debtor.number);
  const now = new Date();
  const dateStr = dateDDMMYY(now);
  const orgName = padRight(stripDiacritics(debtorName), 20);
  const totalHalere = rows.reduce((sum, r) => sum + Math.round(r.amount_czk * 100), 0);

  const lines: string[] = [];

  // 1. UHL1 – file header
  // bytes 1-4: "UHL1", 5-10: DDMMYY, 11-30: org name (20), 31-40: comittent number (10 zeros), 41-43: "001", 44-46: "999"
  lines.push(
    "UHL1" +
    dateStr +
    orgName +
    "0000000000" +
    "001" +
    "999" +
    CR_LF
  );

  // 2. Accounting file header
  // "1 1501 SSS000 BBBB"
  // 1501 = payment orders, SSS=001, PPB=000, bank code = 3030 (Air Bank)
  lines.push(
    "1" +
    " " +
    "1501" +
    " " +
    "001" +
    "000" +
    " " +
    debtor.bankCode +
    CR_LF
  );

  // 3. Group header
  // "2 PPPPPP-UUUUUUUUUU TTTTTTTTTTTTTTT DDMMYY"
  lines.push(
    "2" +
    " " +
    debtorFormatted +
    " " +
    toHalere(rows.reduce((s, r) => s + r.amount_czk, 0), 15) +
    " " +
    dateStr +
    CR_LF
  );

  // 4. Items
  for (const row of rows) {
    const beneficiary = parseCzechAccount(row.payout_account);
    const beneficiaryFormatted = formatAccount(beneficiary.prefix, beneficiary.number);
    const vs = row.influencer_partner_id.replace(/-/g, "").slice(0, 10);
    const message = stripDiacritics(`OneMil - provize ${row.period_month}`);

    // Item line:
    // debtorAccount(17) SP beneficiaryAccount(17) SP amount(15) SP vs(10) SP bankCode(4)+ks(4) SP ss(10) SP AV:message
    lines.push(
      debtorFormatted +
      " " +
      beneficiaryFormatted +
      " " +
      toHalere(row.amount_czk, 15) +
      " " +
      padLeft(vs, 10, "0") +
      " " +
      beneficiary.bankCode +
      "0308" +  // KS: 0308 = bezhotovostní platba
      " " +
      padRight("", 10) +  // specific symbol (empty)
      " " +
      "AV:" + padRight(message, 35) +
      CR_LF
    );
  }

  // 5. Group end
  lines.push("3 +" + CR_LF);

  // 6. File end
  lines.push("5 +" + CR_LF);

  return lines.join("");
}

/** Trigger browser download of an ABO file. */
export function downloadAboFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
