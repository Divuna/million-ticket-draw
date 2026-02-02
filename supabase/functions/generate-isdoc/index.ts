import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IsdocPayload {
  invoice_id: string;
  period_from: string;
  period_to: string;
  coins_total: number;
  amount_net: number;
  vat_rate: number;
  vat_amount: number;
  amount_gross: number;
  currency: string;
  lines: Array<{
    external_order_id: string | null;
    coins: number;
    activated_at: string;
  }>;
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
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toISOString().split('T')[0];
}

function generateIsdocXml(payload: IsdocPayload, partner: PartnerInfo, invoiceNumber: string): string {
  const issueDate = new Date().toISOString().split('T')[0];
  const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // Build invoice lines XML
  const linesXml = payload.lines.map((line, idx) => `
    <InvoiceLine>
      <ID>${idx + 1}</ID>
      <InvoicedQuantity unitCode="EA">1</InvoicedQuantity>
      <LineExtensionAmount currencyID="${payload.currency}">${line.coins}</LineExtensionAmount>
      <Item>
        <Description>MioCoiny - ${escapeXml(line.external_order_id || 'Aktivace')}</Description>
        <Name>MioCoiny aktivace</Name>
      </Item>
      <Note>Aktivováno: ${formatDate(line.activated_at)}</Note>
    </InvoiceLine>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="http://isdoc.cz/namespace/2013" version="6.0.1">
  <DocumentType>1</DocumentType>
  <ID>${escapeXml(invoiceNumber)}</ID>
  <UUID>${escapeXml(payload.invoice_id)}</UUID>
  <IssueDate>${issueDate}</IssueDate>
  <TaxPointDate>${issueDate}</TaxPointDate>
  <VATApplicable>true</VATApplicable>
  <ElectronicPossibilityAgreementReference>
    <ID>Electronic invoice</ID>
  </ElectronicPossibilityAgreementReference>
  <Note>Faktura za období ${formatDate(payload.period_from)} - ${formatDate(payload.period_to)}</Note>
  <LocalCurrencyCode>${payload.currency}</LocalCurrencyCode>
  <ForeignCurrencyCode>${payload.currency}</ForeignCurrencyCode>
  <CurrRate>1</CurrRate>
  <RefCurrRate>1</RefCurrRate>
  <AccountingSupplierParty>
    <Party>
      <PartyIdentification>
        <ID>OneMil s.r.o.</ID>
      </PartyIdentification>
      <PartyName>
        <Name>OneMil s.r.o.</Name>
      </PartyName>
      <PostalAddress>
        <StreetName>Na příkopě 1</StreetName>
        <CityName>Praha</CityName>
        <PostalZone>11000</PostalZone>
        <Country>
          <IdentificationCode>CZ</IdentificationCode>
          <Name>Česká republika</Name>
        </Country>
      </PostalAddress>
    </Party>
  </AccountingSupplierParty>
  <AccountingCustomerParty>
    <Party>
      <PartyIdentification>
        <UserID>${escapeXml(partner.ico || partner.id)}</UserID>
        <ID>${escapeXml(partner.ico || '')}</ID>
      </PartyIdentification>
      <PartyName>
        <Name>${escapeXml(partner.company_name || partner.name)}</Name>
      </PartyName>
      <PostalAddress>
        <StreetName>${escapeXml(partner.billing_street || '')}</StreetName>
        <CityName>${escapeXml(partner.billing_city || '')}</CityName>
        <PostalZone>${escapeXml(partner.billing_zip || '')}</PostalZone>
        <Country>
          <IdentificationCode>${escapeXml(partner.billing_country || 'CZ')}</IdentificationCode>
          <Name>${partner.billing_country === 'SK' ? 'Slovensko' : 'Česká republika'}</Name>
        </Country>
      </PostalAddress>
      <PartyTaxScheme>
        <CompanyID>${escapeXml(partner.dic || '')}</CompanyID>
        <TaxScheme>VAT</TaxScheme>
      </PartyTaxScheme>
      <Contact>
        <ElectronicMail>${escapeXml(partner.contact_email || '')}</ElectronicMail>
      </Contact>
    </Party>
  </AccountingCustomerParty>
  <InvoiceLines>${linesXml}
  </InvoiceLines>
  <TaxTotal>
    <TaxSubTotal>
      <TaxableAmount currencyID="${payload.currency}">${payload.amount_net}</TaxableAmount>
      <TaxAmount currencyID="${payload.currency}">${payload.vat_amount}</TaxAmount>
      <TaxInclusiveAmount currencyID="${payload.currency}">${payload.amount_gross}</TaxInclusiveAmount>
      <AlreadyClaimedTaxableAmount currencyID="${payload.currency}">0</AlreadyClaimedTaxableAmount>
      <AlreadyClaimedTaxAmount currencyID="${payload.currency}">0</AlreadyClaimedTaxAmount>
      <AlreadyClaimedTaxInclusiveAmount currencyID="${payload.currency}">0</AlreadyClaimedTaxInclusiveAmount>
      <DifferenceTaxableAmount currencyID="${payload.currency}">${payload.amount_net}</DifferenceTaxableAmount>
      <DifferenceTaxAmount currencyID="${payload.currency}">${payload.vat_amount}</DifferenceTaxAmount>
      <DifferenceTaxInclusiveAmount currencyID="${payload.currency}">${payload.amount_gross}</DifferenceTaxInclusiveAmount>
      <TaxCategory>
        <Percent>${payload.vat_rate}</Percent>
      </TaxCategory>
    </TaxSubTotal>
    <TaxAmount currencyID="${payload.currency}">${payload.vat_amount}</TaxAmount>
  </TaxTotal>
  <LegalMonetaryTotal>
    <TaxExclusiveAmount currencyID="${payload.currency}">${payload.amount_net}</TaxExclusiveAmount>
    <TaxInclusiveAmount currencyID="${payload.currency}">${payload.amount_gross}</TaxInclusiveAmount>
    <AlreadyClaimedTaxExclusiveAmount currencyID="${payload.currency}">0</AlreadyClaimedTaxExclusiveAmount>
    <AlreadyClaimedTaxInclusiveAmount currencyID="${payload.currency}">0</AlreadyClaimedTaxInclusiveAmount>
    <DifferenceTaxExclusiveAmount currencyID="${payload.currency}">${payload.amount_net}</DifferenceTaxExclusiveAmount>
    <DifferenceTaxInclusiveAmount currencyID="${payload.currency}">${payload.amount_gross}</DifferenceTaxInclusiveAmount>
    <PayableRoundingAmount currencyID="${payload.currency}">0</PayableRoundingAmount>
    <PaidDepositsAmount currencyID="${payload.currency}">0</PaidDepositsAmount>
    <PayableAmount currencyID="${payload.currency}">${payload.amount_gross}</PayableAmount>
  </LegalMonetaryTotal>
  <PaymentMeans>
    <Payment>
      <PaidAmount currencyID="${payload.currency}">${payload.amount_gross}</PaidAmount>
      <PaymentMeansCode>42</PaymentMeansCode>
      <Details>
        <PaymentDueDate>${dueDate}</PaymentDueDate>
      </Details>
    </Payment>
  </PaymentMeans>
</Invoice>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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

    // 1. Call build_isdoc_payload SQL function
    const { data: payloadData, error: payloadError } = await supabase
      .rpc('build_isdoc_payload', { p_invoice_id: invoice_id });

    if (payloadError) {
      console.error('Error fetching ISDOC payload:', payloadError);
      return new Response(
        JSON.stringify({ error: 'Nepodařilo se získat data faktury', details: payloadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = payloadData as IsdocPayload;
    console.log('ISDOC payload:', JSON.stringify(payload));

    // 2. Get partner info for the invoice
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('partner_invoices')
      .select('partner_id')
      .eq('id', invoice_id)
      .single();

    if (invoiceError || !invoiceData) {
      console.error('Error fetching invoice:', invoiceError);
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
      console.error('Error fetching partner:', partnerError);
      return new Response(
        JSON.stringify({ error: 'Partner nenalezen' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Generate invoice number
    const invoiceNumber = `INV-${new Date().getFullYear()}-${invoice_id.substring(0, 8).toUpperCase()}`;

    // 4. Generate ISDOC XML
    const xmlContent = generateIsdocXml(payload, partnerData as PartnerInfo, invoiceNumber);
    console.log('Generated ISDOC XML length:', xmlContent.length);

    // 5. Upload to Supabase Storage
    const filename = `isdoc-${invoice_id}-${Date.now()}.isdoc`;
    const xmlBytes = new TextEncoder().encode(xmlContent);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('partner-invoices')
      .upload(filename, xmlBytes, {
        contentType: 'application/xml',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Nepodařilo se nahrát soubor', details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Get public URL
    const { data: urlData } = supabase.storage
      .from('partner-invoices')
      .getPublicUrl(filename);

    const fileUrl = urlData.publicUrl;
    console.log('File uploaded:', fileUrl);

    // 7. Insert into partner_invoice_exports
    const { data: exportData, error: exportError } = await supabase
      .from('partner_invoice_exports')
      .insert({
        invoice_id: invoice_id,
        format: 'isdoc',
        file_url: fileUrl
      })
      .select()
      .single();

    if (exportError) {
      console.error('Error inserting export record:', exportError);
      return new Response(
        JSON.stringify({ error: 'Nepodařilo se uložit záznam exportu', details: exportError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Export record created:', exportData.id);

    return new Response(
      JSON.stringify({
        success: true,
        file_url: fileUrl,
        export_id: exportData.id,
        filename
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Interní chyba serveru', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
