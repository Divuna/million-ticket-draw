import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' CZK';
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

    console.log(`Generating PDF for invoice: ${invoice_id}`);

    // 1. Fetch invoice with partner info
    const { data: invoice, error: invoiceError } = await supabase
      .from('partner_invoices')
      .select('*, partner:partners(name, company_name, ico, dic, billing_street, billing_city, billing_zip, billing_country, contact_email)')
      .eq('id', invoice_id)
      .single();

    if (invoiceError || !invoice) {
      console.error('Error fetching invoice:', invoiceError);
      return new Response(
        JSON.stringify({ error: 'Faktura nenalezena' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Fetch invoice lines
    const { data: lines, error: linesError } = await supabase
      .from('partner_invoice_lines')
      .select('*')
      .eq('invoice_id', invoice_id)
      .order('activated_at', { ascending: true });

    if (linesError) {
      console.error('Error fetching lines:', linesError);
      return new Response(
        JSON.stringify({ error: 'Nepodařilo se načíst položky faktury' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const partner = invoice.partner;
    const partnerName = partner?.company_name || partner?.name || 'Neznámý partner';
    const invoiceNumber = `INV-${new Date().getFullYear()}-${invoice_id.substring(0, 8).toUpperCase()}`;

    // 3. Generate PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([595, 842]); // A4
    const { height } = page.getSize();
    let y = height - 50;
    const leftMargin = 50;
    const rightCol = 350;

    // Header
    page.drawText('FAKTURA', {
      x: leftMargin, y, size: 24, font: fontBold, color: rgb(0.1, 0.1, 0.1),
    });
    y -= 20;
    page.drawText(invoiceNumber, {
      x: leftMargin, y, size: 12, font, color: rgb(0.4, 0.4, 0.4),
    });
    y -= 35;

    // Supplier / Customer columns
    page.drawText('Dodavatel:', { x: leftMargin, y, size: 10, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
    page.drawText('Odberatel:', { x: rightCol, y, size: 10, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
    y -= 15;

    page.drawText('OneMil s.r.o.', { x: leftMargin, y, size: 10, font });
    page.drawText(partnerName, { x: rightCol, y, size: 10, font });
    y -= 13;

    if (partner?.ico) {
      page.drawText(`ICO: ${partner.ico}`, { x: rightCol, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 12;
    }
    if (partner?.dic) {
      page.drawText(`DIC: ${partner.dic}`, { x: rightCol, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 12;
    }
    if (partner?.billing_street) {
      page.drawText(partner.billing_street, { x: rightCol, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 12;
    }
    if (partner?.billing_city || partner?.billing_zip) {
      page.drawText(`${partner.billing_zip || ''} ${partner.billing_city || ''}`.trim(), { x: rightCol, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 12;
    }

    y -= 15;

    // Period & dates
    const periodFrom = invoice.period_start || invoice.period_from;
    const periodTo = invoice.period_end || invoice.period_to;

    page.drawText(`Obdobi: ${formatDate(periodFrom)} - ${formatDate(periodTo)}`, {
      x: leftMargin, y, size: 10, font,
    });
    y -= 14;
    page.drawText(`Datum vystaveni: ${formatDate(new Date().toISOString())}`, {
      x: leftMargin, y, size: 10, font, color: rgb(0.4, 0.4, 0.4),
    });
    y -= 25;

    // Summary box
    page.drawRectangle({
      x: leftMargin, y: y - 60, width: 495, height: 65,
      color: rgb(0.95, 0.95, 0.97),
    });
    y -= 5;

    const summaryItems = [
      { label: 'Celkem coinu:', value: String(invoice.coins_total ?? invoice.coins_activated ?? 0) },
      { label: 'Castka netto:', value: formatCurrency(Number(invoice.amount_net ?? invoice.amount_ex_vat ?? 0)) },
      { label: `DPH (${invoice.vat_rate}%):`, value: formatCurrency(Number(invoice.vat_amount)) },
      { label: 'Castka brutto:', value: formatCurrency(Number(invoice.amount_gross ?? invoice.amount_inc_vat ?? 0)) },
    ];

    let sx = leftMargin + 10;
    for (const item of summaryItems) {
      page.drawText(item.label, { x: sx, y: y - 15, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      page.drawText(item.value, { x: sx, y: y - 30, size: 12, font: fontBold });
      sx += 125;
    }
    y -= 75;

    // Lines table
    if (lines && lines.length > 0) {
      page.drawText('Polozky faktury', { x: leftMargin, y, size: 12, font: fontBold });
      y -= 20;

      // Table header
      page.drawRectangle({
        x: leftMargin, y: y - 2, width: 495, height: 16,
        color: rgb(0.9, 0.9, 0.92),
      });
      page.drawText('#', { x: leftMargin + 5, y: y + 2, size: 8, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      page.drawText('Datum aktivace', { x: leftMargin + 30, y: y + 2, size: 8, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      page.drawText('Ext. objednavka', { x: leftMargin + 180, y: y + 2, size: 8, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      page.drawText('Coiny', { x: leftMargin + 400, y: y + 2, size: 8, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      y -= 18;

      for (let i = 0; i < lines.length; i++) {
        if (y < 60) {
          // Add new page if running out of space
          const newPage = pdfDoc.addPage([595, 842]);
          y = 842 - 50;
          // Continue on new page (simplified - just reset y)
          page.drawText('...pokracovani na dalsi strane', { x: leftMargin, y: y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
          break;
        }

        const line = lines[i];
        const bgColor = i % 2 === 0 ? rgb(1, 1, 1) : rgb(0.97, 0.97, 0.98);
        page.drawRectangle({
          x: leftMargin, y: y - 2, width: 495, height: 14,
          color: bgColor,
        });

        page.drawText(String(i + 1), { x: leftMargin + 5, y: y + 1, size: 8, font });
        page.drawText(formatDate(line.activated_at), { x: leftMargin + 30, y: y + 1, size: 8, font });
        page.drawText(line.external_order_id || '-', { x: leftMargin + 180, y: y + 1, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
        page.drawText(String(line.coins), { x: leftMargin + 400, y: y + 1, size: 8, font: fontBold });
        y -= 15;
      }
    }

    // Footer
    y = 40;
    page.drawText(`Vygenerovano: ${new Date().toLocaleString('cs-CZ')}`, {
      x: leftMargin, y, size: 7, font, color: rgb(0.6, 0.6, 0.6),
    });

    // 4. Serialize PDF
    const pdfBytes = await pdfDoc.save();
    console.log(`PDF generated, size: ${pdfBytes.length} bytes`);

    // 5. Upload to storage
    const filename = `invoice-${invoice_id}-${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('partner-invoices')
      .upload(filename, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Nepodařilo se nahrát PDF', details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Get public URL
    const { data: urlData } = supabase.storage
      .from('partner-invoices')
      .getPublicUrl(filename);

    const fileUrl = urlData.publicUrl;
    console.log('PDF uploaded:', fileUrl);

    // 7. Record export
    const { error: exportError } = await supabase
      .from('partner_invoice_exports')
      .insert({
        invoice_id,
        format: 'pdf',
        file_url: fileUrl,
      });

    if (exportError) {
      console.error('Error recording export:', exportError);
      // Non-fatal, continue
    }

    return new Response(
      JSON.stringify({ success: true, file_url: fileUrl }),
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
