import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ISDOC 6.0.1 export of a partner invoice.
 *
 * Structure follows the official schema at
 * https://isdoc.cz/6.0.1/xsd/isdoc-invoice-6.0.1.xsd — element names, order and
 * cardinality were taken from that XSD, not from prose.
 *
 * ACCOUNTING AUTHORITY: this function never recomputes an invoice. Every money
 * value and every date comes from partner_invoices via build_isdoc_payload. The
 * ISDOC is a representation of an invoice that already exists.
 *
 * The two rules that meet here:
 *   MioCoin quantity — at most 1 decimal place
 *   CZK money        — 2 decimal places
 * so a line reads "4.3 units x 1.00 CZK = 4.30 CZK", never "4.3 CZK".
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-token',
};

/**
 * Supplier identity — the legal entity behind the OneMil brand.
 * Source of truth: COMPANY_CONTEXT.md. OneMil is a brand/project of this company
 * and must never appear as a legal party of its own.
 *
 * Bank details are deliberately absent: COMPANY_CONTEXT.md forbids storing them in
 * the repository, ISDOC's PaymentMeans is optional (minOccurs="0"), and its
 * Details branch would require a full BankAccount group. Inventing an account to
 * satisfy the schema is worse than omitting an optional block, so PaymentMeans is
 * not emitted. The due date is still carried in the document Note.
 */
const SUPPLIER = {
  name: 'iCONIC POINT s.r.o.',
  ico: '17795851',
  dic: 'CZ17795851',
  street: 'Na Folimance',
  buildingNumber: '2155/15',
  city: 'Praha 2',
  postalZone: '120 00',
  countryCode: 'CZ',
  countryName: 'Česká republika',
};

interface IsdocLine {
  external_order_id: string | null;
  coins: number | string;
  activated_at: string;
  unit_price_czk: number | string | null;
}

interface IsdocPayload {
  invoice_id: string;
  invoice_number: string | null;
  variable_symbol: string | null;
  issue_date: string | null;
  due_date: string | null;
  taxable_date: string | null;
  period_from: string | null;
  period_to: string | null;
  coins_total: number | string | null;
  coins_activated: number | string | null;
  price_per_coin: number | string | null;
  amount_net: number | string;
  vat_rate: number | string;
  vat_amount: number | string;
  amount_gross: number | string;
  currency: string;
  lines: IsdocLine[];
}

interface PartnerInfo {
  id: string;
  name: string;
  company_name: string | null;
  ico: string | null;
  dic: string | null;
  billing_street: string | null;
  billing_city: string | null;
  billing_zip: string | null;
  billing_country: string | null;
  contact_email: string | null;
}

function escapeXml(str: string | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Numeric columns arrive from PostgREST as strings; this parses, never re-rounds. */
const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** CZK amount: exactly 2 decimals, as stored on the invoice. */
const money = (v: unknown): string => num(v).toFixed(2);

/** MioCoin quantity: at most 1 decimal, never padded to a money-looking value. */
const quantity = (v: unknown): string => String(Math.round(num(v) * 10) / 10);

/** ISO date (YYYY-MM-DD) from a date or timestamp column. */
function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

/**
 * ISDOC Percent is a percentage rate (21), while partner_invoices.vat_rate is the
 * mathematical fraction (0.21). Values <= 1 are treated as a fraction and scaled;
 * anything larger is already a percentage. The DB value is never modified.
 */
function vatPercent(rate: unknown): string {
  return String(Math.round(vatFraction(rate) * 100 * 100) / 100);
}

/** The VAT rate as a fraction (0.21), whichever convention the column uses. */
function vatFraction(rate: unknown): number {
  const r = num(rate);
  return r > 1 ? r / 100 : r;
}

/**
 * Splits "Na Folimance 2155/15" into StreetName + BuildingNumber, both of which
 * PostalAddressType requires. If no number is present the address still validates
 * because BuildingNumber is emitted empty rather than omitted.
 */
function splitStreet(street: string | null): { name: string; number: string } {
  const s = (street ?? '').trim();
  if (!s) return { name: '', number: '' };
  const m = s.match(/^(.*?)\s+([\d]+[\d/a-zA-Z.-]*)$/);
  if (m) return { name: m[1].trim(), number: m[2].trim() };
  return { name: s, number: '' };
}

function generateIsdocXml(payload: IsdocPayload, partner: PartnerInfo): string {
  const currency = payload.currency || 'CZK';

  // ── Money and quantity, taken verbatim from the invoice ────────────────────
  const amountNet = money(payload.amount_net);
  const vatAmount = money(payload.vat_amount);
  const amountGross = money(payload.amount_gross);
  const percent = vatPercent(payload.vat_rate);

  const coinsTotal = num(payload.coins_total ?? payload.coins_activated);
  const unitPriceRaw = num(payload.price_per_coin);
  // Unit price including tax, for the mandatory UnitPriceTaxInclusive element.
  const unitPriceIncl =
    Math.round(unitPriceRaw * (1 + vatFraction(payload.vat_rate)) * 100) / 100;

  // ── Dates: the invoice's own, never derived from now() ─────────────────────
  const issueDate = isoDate(payload.issue_date);
  const taxPointDate = isoDate(payload.taxable_date) ?? issueDate;
  const dueDate = isoDate(payload.due_date);
  const periodFrom = isoDate(payload.period_from);
  const periodTo = isoDate(payload.period_to);

  const noteParts: string[] = [];
  if (periodFrom && periodTo) noteParts.push(`Fakturační období ${periodFrom} - ${periodTo}`);
  noteParts.push('Odměny MioCoin aktivované zákazníky (platforma OneMil)');
  if (dueDate) noteParts.push(`Datum splatnosti ${dueDate}`);
  const note = noteParts.join('. ') + '.';

  const supplierAddr = SUPPLIER;
  const customerStreet = splitStreet(partner.billing_street);
  const customerCountry = (partner.billing_country || 'CZ').toUpperCase();

  // ── One aggregated invoice line ────────────────────────────────────────────
  //
  // Deliberately ONE line rather than one per activation. ISDOC carries VAT per
  // line, and rounding VAT on 0.6 / 1.2 / 2.5 MC separately would make the line
  // sum disagree with the invoice by whole haléře. A single aggregated line is
  // accounting-clean and reproduces the invoice totals exactly:
  //     InvoicedQuantity           = coins_total          (4.3)
  //     UnitPrice                  = price_per_coin       (1.00)
  //     LineExtensionAmount        = amount_net           (4.30)
  //     LineExtensionTaxAmount     = vat_amount           (0.90)
  //     LineExtensionAmountTaxIncl = amount_gross         (5.20)
  // The per-activation breakdown remains available in partner_invoice_lines and in
  // the invoice PDF's activation control list, so no detail is lost.
  //
  // Element order below is the xs:sequence of InvoiceLineType.
  // VATCalculationMethod 0 = "zdola" (from the net), which is how the invoice is
  // computed: vat_amount = round(amount_net * vat_rate, 2).
  const invoiceLines = `
    <InvoiceLine>
      <ID>1</ID>
      <InvoicedQuantity unitCode="ks">${quantity(coinsTotal)}</InvoicedQuantity>
      <LineExtensionAmount>${amountNet}</LineExtensionAmount>
      <LineExtensionAmountTaxInclusive>${amountGross}</LineExtensionAmountTaxInclusive>
      <LineExtensionTaxAmount>${vatAmount}</LineExtensionTaxAmount>
      <UnitPrice>${money(unitPriceRaw)}</UnitPrice>
      <UnitPriceTaxInclusive>${money(unitPriceIncl)}</UnitPriceTaxInclusive>
      <ClassifiedTaxCategory>
        <Percent>${percent}</Percent>
        <VATCalculationMethod>0</VATCalculationMethod>
        <VATApplicable>true</VATApplicable>
      </ClassifiedTaxCategory>
      <Item>
        <Description>MioCoiny aktivované zákazníky (OneMil)</Description>
      </Item>
    </InvoiceLine>`;

  // Root element order is the xs:sequence of the Invoice element.
  // PaymentMeans is intentionally omitted — see the SUPPLIER comment.
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="http://isdoc.cz/namespace/2013" version="6.0.1">
  <DocumentType>1</DocumentType>
  <ID>${escapeXml(payload.invoice_number ?? payload.invoice_id)}</ID>
  <UUID>${escapeXml(payload.invoice_id)}</UUID>
${payload.variable_symbol ? `  <ReferenceNumber>${escapeXml(payload.variable_symbol)}</ReferenceNumber>\n` : ''}  <IssueDate>${issueDate}</IssueDate>
${taxPointDate ? `  <TaxPointDate>${taxPointDate}</TaxPointDate>\n` : ''}  <VATApplicable>true</VATApplicable>
  <ElectronicPossibilityAgreementReference>Souhlas s elektronickou fakturací</ElectronicPossibilityAgreementReference>
  <Note>${escapeXml(note)}</Note>
  <LocalCurrencyCode>${escapeXml(currency)}</LocalCurrencyCode>
  <CurrRate>1</CurrRate>
  <RefCurrRate>1</RefCurrRate>
  <AccountingSupplierParty>
    <Party>
      <PartyIdentification>
        <ID>${escapeXml(supplierAddr.ico)}</ID>
      </PartyIdentification>
      <PartyName>
        <Name>${escapeXml(supplierAddr.name)}</Name>
      </PartyName>
      <PostalAddress>
        <StreetName>${escapeXml(supplierAddr.street)}</StreetName>
        <BuildingNumber>${escapeXml(supplierAddr.buildingNumber)}</BuildingNumber>
        <CityName>${escapeXml(supplierAddr.city)}</CityName>
        <PostalZone>${escapeXml(supplierAddr.postalZone)}</PostalZone>
        <Country>
          <IdentificationCode>${escapeXml(supplierAddr.countryCode)}</IdentificationCode>
          <Name>${escapeXml(supplierAddr.countryName)}</Name>
        </Country>
      </PostalAddress>
      <PartyTaxScheme>
        <CompanyID>${escapeXml(supplierAddr.dic)}</CompanyID>
        <TaxScheme>VAT</TaxScheme>
      </PartyTaxScheme>
    </Party>
  </AccountingSupplierParty>
  <AccountingCustomerParty>
    <Party>
      <PartyIdentification>
        <ID>${escapeXml(partner.ico || partner.id)}</ID>
      </PartyIdentification>
      <PartyName>
        <Name>${escapeXml(partner.company_name || partner.name)}</Name>
      </PartyName>
      <PostalAddress>
        <StreetName>${escapeXml(customerStreet.name)}</StreetName>
        <BuildingNumber>${escapeXml(customerStreet.number)}</BuildingNumber>
        <CityName>${escapeXml(partner.billing_city || '')}</CityName>
        <PostalZone>${escapeXml(partner.billing_zip || '')}</PostalZone>
        <Country>
          <IdentificationCode>${escapeXml(customerCountry)}</IdentificationCode>
          <Name>${customerCountry === 'SK' ? 'Slovensko' : 'Česká republika'}</Name>
        </Country>
      </PostalAddress>
${partner.dic ? `      <PartyTaxScheme>
        <CompanyID>${escapeXml(partner.dic)}</CompanyID>
        <TaxScheme>VAT</TaxScheme>
      </PartyTaxScheme>\n` : ''}${partner.contact_email ? `      <Contact>
        <ElectronicMail>${escapeXml(partner.contact_email)}</ElectronicMail>
      </Contact>\n` : ''}    </Party>
  </AccountingCustomerParty>
  <InvoiceLines>${invoiceLines}
  </InvoiceLines>
  <TaxTotal>
    <TaxSubTotal>
      <TaxableAmount>${amountNet}</TaxableAmount>
      <TaxAmount>${vatAmount}</TaxAmount>
      <TaxInclusiveAmount>${amountGross}</TaxInclusiveAmount>
      <AlreadyClaimedTaxableAmount>0.00</AlreadyClaimedTaxableAmount>
      <AlreadyClaimedTaxAmount>0.00</AlreadyClaimedTaxAmount>
      <AlreadyClaimedTaxInclusiveAmount>0.00</AlreadyClaimedTaxInclusiveAmount>
      <DifferenceTaxableAmount>${amountNet}</DifferenceTaxableAmount>
      <DifferenceTaxAmount>${vatAmount}</DifferenceTaxAmount>
      <DifferenceTaxInclusiveAmount>${amountGross}</DifferenceTaxInclusiveAmount>
      <TaxCategory>
        <Percent>${percent}</Percent>
        <TaxScheme>VAT</TaxScheme>
      </TaxCategory>
    </TaxSubTotal>
    <TaxAmount>${vatAmount}</TaxAmount>
  </TaxTotal>
  <LegalMonetaryTotal>
    <TaxExclusiveAmount>${amountNet}</TaxExclusiveAmount>
    <TaxInclusiveAmount>${amountGross}</TaxInclusiveAmount>
    <AlreadyClaimedTaxExclusiveAmount>0.00</AlreadyClaimedTaxExclusiveAmount>
    <AlreadyClaimedTaxInclusiveAmount>0.00</AlreadyClaimedTaxInclusiveAmount>
    <DifferenceTaxExclusiveAmount>${amountNet}</DifferenceTaxExclusiveAmount>
    <DifferenceTaxInclusiveAmount>${amountGross}</DifferenceTaxInclusiveAmount>
    <PayableRoundingAmount>0.00</PayableRoundingAmount>
    <PaidDepositsAmount>0.00</PaidDepositsAmount>
    <PayableAmount>${amountGross}</PayableAmount>
  </LegalMonetaryTotal>
</Invoice>`;
}

/**
 * Authorization — same proven model as generate-partner-invoice-pdf:
 *   1. backend/automation — `x-internal-token` matching INTERNAL_FUNCTION_TOKEN,
 *      or a service-role bearer token
 *   2. admin fallback — a logged-in superadmin JWT (no secret in the browser)
 *
 * Before this, the function relied on verify_jwt alone and did no internal check,
 * so ANY logged-in user could export ANY partner's private invoice.
 */
async function authorizeRequest(req: Request): Promise<{ status: number; error: string } | null> {
  const internalToken = Deno.env.get('INTERNAL_FUNCTION_TOKEN');
  const provided = req.headers.get('x-internal-token');
  if (internalToken && provided && provided === internalToken) return null;

  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { status: 401, error: 'missing_authorization' };

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (serviceKey && token === serviceKey) return null;

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) return { status: 401, error: 'invalid_authorization_token' };

  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('role', 'superadmin')
    .maybeSingle();
  if (!roleRow) return { status: 403, error: 'access_denied_superadmin_only' };

  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authFailure = await authorizeRequest(req);
  if (authFailure) {
    return new Response(
      JSON.stringify({ error: authFailure.error }),
      { status: authFailure.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { invoice_id } = await req.json();

    if (!invoice_id) {
      return new Response(
        JSON.stringify({ error: 'Chybí invoice_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Generating ISDOC for invoice: ${invoice_id}`);

    // 1. Read the existing invoice (single source of financial truth).
    const { data: payloadData, error: payloadError } = await supabase
      .rpc('build_isdoc_payload', { p_invoice_id: invoice_id });

    if (payloadError) {
      console.error('Error fetching ISDOC payload:', payloadError.message);
      return new Response(
        JSON.stringify({ error: 'Nepodařilo se získat data faktury', details: payloadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = (typeof payloadData === 'string' ? JSON.parse(payloadData) : payloadData) as IsdocPayload;

    // 2. Customer (partner) identity.
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('partner_invoices')
      .select('partner_id')
      .eq('id', invoice_id)
      .single();

    if (invoiceError || !invoiceData) {
      return new Response(
        JSON.stringify({ error: 'Faktura nenalezena' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: partnerData, error: partnerError } = await supabase
      .from('partners')
      .select('id, name, company_name, ico, dic, billing_street, billing_city, billing_zip, billing_country, contact_email')
      .eq('id', invoiceData.partner_id)
      .single();

    if (partnerError || !partnerData) {
      return new Response(
        JSON.stringify({ error: 'Partner nenalezen' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Build the ISDOC document.
    const xmlContent = generateIsdocXml(payload, partnerData as PartnerInfo);
    console.log('Generated ISDOC XML length:', xmlContent.length);

    // 4. Store privately. Signed URLs are created only on authorized download.
    const filename = `isdoc-${invoice_id}-${Date.now()}.isdoc`;
    const xmlBytes = new TextEncoder().encode(xmlContent);

    const { error: uploadError } = await supabase.storage
      .from('partner-invoices')
      .upload(filename, xmlBytes, {
        contentType: 'application/xml',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError.message);
      return new Response(
        JSON.stringify({ error: 'Nepodařilo se nahrát soubor', details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: exportData, error: exportError } = await supabase
      .from('partner_invoice_exports')
      .insert({
        invoice_id: invoice_id,
        format: 'isdoc',
        file_url: null,
        storage_bucket: 'partner-invoices',
        storage_path: filename,
        metadata: {
          content_type: 'application/xml',
          filename,
          size_bytes: xmlBytes.length,
          generated_by: 'generate-isdoc',
          isdoc_version: '6.0.1',
        },
      })
      .select()
      .single();

    if (exportError) {
      console.error('Error inserting export record:', exportError.message);
      return new Response(
        JSON.stringify({ error: 'Nepodařilo se uložit záznam exportu', details: exportError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        export_id: exportData.id,
        storage_bucket: 'partner-invoices',
        storage_path: filename,
        filename,
        isdoc_version: '6.0.1',
        invoice_number: payload.invoice_number,
        amount_net: amountNetOf(payload),
        vat_amount: money(payload.vat_amount),
        amount_gross: money(payload.amount_gross),
        coins_total: quantity(payload.coins_total ?? payload.coins_activated),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Interní chyba serveru', details: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/** Small helper so the response echoes the same formatting the document uses. */
function amountNetOf(payload: IsdocPayload): string {
  return money(payload.amount_net);
}
