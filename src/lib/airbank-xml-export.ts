/**
 * Air Bank CZ batch payment XML generator (pain.001.001.03 – Czech domestic CZK).
 * Generates ISO 20022 CustomerCreditTransferInitiation compatible with Air Bank import.
 */

export interface PaymentRow {
  id: string;
  influencer_partner_id: string;
  period_month: string;
  amount_czk: number;
  partner_name: string;
  payout_account: string; // IBAN or Czech account number
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

function toIBAN(account: string): string {
  // If already IBAN format (starts with CZ), return as-is
  if (/^CZ\d{2}/i.test(account.replace(/\s/g, ""))) {
    return account.replace(/\s/g, "").toUpperCase();
  }
  // Otherwise return as-is (user must provide valid IBAN)
  return account.replace(/\s/g, "");
}

/**
 * Generate pain.001.001.03 XML for Air Bank batch domestic CZK payments.
 */
export function generateAirBankXml(
  rows: PaymentRow[],
  debtorName: string = "OneMil s.r.o.",
  debtorIBAN: string = "CZ0000000000000000000000" // placeholder – admin sets real IBAN
): string {
  const now = new Date();
  const msgId = `ONEMIL-${now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`;
  const creDtTm = now.toISOString().replace(/\.\d+Z$/, "");
  const reqExeDt = now.toISOString().slice(0, 10);
  const nbOfTxs = rows.length;
  const ctrlSum = formatAmount(rows.reduce((sum, r) => sum + r.amount_czk, 0));

  const txns = rows
    .map((row, idx) => {
      const iban = toIBAN(row.payout_account);
      const vs = row.influencer_partner_id.replace(/-/g, "").slice(0, 10);
      const rmtInf = `OneMil – provize ${row.period_month}`;

      return `      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${escapeXml(msgId)}-${idx + 1}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="CZK">${formatAmount(row.amount_czk)}</InstdAmt>
        </Amt>
        <CdtrAgt>
          <FinInstnId>
            <BIC>AIRACZPP</BIC>
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>${escapeXml(row.partner_name)}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${escapeXml(iban)}</IBAN>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${escapeXml(rmtInf)}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${escapeXml(msgId)}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(debtorName)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${escapeXml(msgId)}-PMT</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>DMCT</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${reqExeDt}</ReqdExctnDt>
      <Dbtr>
        <Nm>${escapeXml(debtorName)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${escapeXml(debtorIBAN)}</IBAN>
        </Id>
        <Ccy>CZK</Ccy>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BIC>AIRACZPP</BIC>
        </FinInstnId>
      </DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
${txns}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
}

/** Trigger browser download of an XML string. */
export function downloadXml(xml: string, filename: string) {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
