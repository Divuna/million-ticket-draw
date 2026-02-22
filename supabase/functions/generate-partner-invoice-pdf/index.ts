import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import QRCode from "npm:qrcode@1.5.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Supplier constants ──────────────────────────────────────────────
const SUPPLIER = {
  name: 'ICONIC POINT s.r.o.',
  ico: '17795851',
  dic: 'CZ17795851',
  street: 'Na Folimance 2155/15',
  city: '120 00 Praha 2',
  register: 'Městský soud v Praze, oddíl C, vložka 376856',
};
const CONSTANT_SYMBOL = '0308';
const BANK_ACCOUNT = '3151752019 / 3030';
const BANK_IBAN = 'CZ7630300000003151752019';
const BANK_BIC = 'AIRACZPP';

// ── Helpers ─────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}

/** Return the first Monday strictly after the given date */
function firstMondayAfter(dateStr: string): Date {
  const d = new Date(dateStr);
  // Move to next day first (strictly after)
  d.setDate(d.getDate() + 1);
  // Advance until Monday (day === 1)
  while (d.getDay() !== 1) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/** Add N days to a Date and return a new Date */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' CZK';
}

function buildSpayd(invoice: any): string {
  const vs = (invoice.variable_symbol || '').replace(/\D/g, '');
  const amount = Number(invoice.amount_gross ?? invoice.amount_inc_vat ?? 0).toFixed(2);
  const msg = `${invoice.invoice_number || ''} OneMil`.trim();
  const parts = [
    'SPD*1.0',
    `ACC:${BANK_IBAN}+${BANK_BIC}`,
    `AM:${amount}`,
    'CC:CZK',
    `X-VS:${vs}`,
    `X-KS:${CONSTANT_SYMBOL}`,
    `MSG:${msg}`,
  ];
  return parts.join('*');
}

/** Add a new page and return it with reset y position */
function addPage(pdfDoc: any): { page: any; y: number } {
  const page = pdfDoc.addPage([595, 842]);
  return { page, y: 842 - 50 };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Internal authorization guard
  const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
  if (req.headers.get("x-internal-token") !== internalToken) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
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

    // ── 1. Fetch invoice with partner info ──────────────────────────
    const { data: invoice, error: invoiceError } = await supabase
      .from('partner_invoices')
      .select('*, partner:partners(id, name, company_name, ico, dic, billing_street, billing_city, billing_zip, billing_country, contact_email)')
      .eq('id', invoice_id)
      .single();

    if (invoiceError || !invoice) {
      console.error('Error fetching invoice:', invoiceError);
      return new Response(
        JSON.stringify({ error: 'Faktura nenalezena' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 2. Fetch invoice lines ──────────────────────────────────────
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

    // ── 3. Fetch activation details for the control list ────────────
    const periodStart = invoice.period_start;
    const periodEnd = invoice.period_end;
    const partnerId = invoice.partner?.id;

    let activations: any[] = [];
    if (partnerId && periodStart && periodEnd) {
      const { data: actData, error: actError } = await supabase
        .from('partner_coin_activations')
        .select('activated_at, coins, code, external_order_id, user_id')
        .eq('partner_id', partnerId)
        .gte('activated_at', periodStart)
        .lte('activated_at', periodEnd)
        .order('activated_at', { ascending: true });

      if (actError) {
        console.error('Error fetching activations:', actError);
      } else {
        activations = actData || [];
      }

      // Fetch user emails from auth.users
      if (activations.length > 0) {
        const userIds = [...new Set(activations.map((a: any) => a.user_id))];
        const emailMap = new Map<string, string>();

        const userResults = await Promise.all(
          userIds.map((uid: string) => supabase.auth.admin.getUserById(uid))
        );
        for (const result of userResults) {
          if (result.data?.user) {
            emailMap.set(result.data.user.id, result.data.user.email || '-');
          }
        }

        activations = activations.map((a: any) => ({
          ...a,
          user_email: emailMap.get(a.user_id) || '-',
        }));
      }
    }

    const partner = invoice.partner;
    const partnerName = partner?.company_name || partner?.name || 'Neznámý partner';

    // ── 4. Generate QR code PNG ─────────────────────────────────────
    const spaydString = buildSpayd(invoice);
    console.log('SPAYD:', spaydString);
    let qrPngBytes: Uint8Array | null = null;
    try {
      const qrBuffer = await QRCode.toBuffer(spaydString, {
        type: 'png',
        width: 150,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      qrPngBytes = new Uint8Array(qrBuffer);
    } catch (qrErr) {
      console.error('QR generation failed:', qrErr);
    }

    // ── 5. Build PDF ────────────────────────────────────────────────
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    // Fetch and embed DejaVuSans TTF for full Czech Unicode support
    const [regularBytes, boldBytes] = await Promise.all([
      fetch('https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf').then(r => r.arrayBuffer()),
      fetch('https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf').then(r => r.arrayBuffer()),
    ]);
    const font = await pdfDoc.embedFont(regularBytes, { subset: true });
    const fontBold = await pdfDoc.embedFont(boldBytes, { subset: true });

    let currentPage = pdfDoc.addPage([595, 842]);
    let y = 842 - 50;
    const leftMargin = 50;
    const rightCol = 320;
    const pageWidth = 595;
    const rightMargin = pageWidth - 50;

    // Helper to ensure space, adding new page if needed
    const ensureSpace = (needed: number) => {
      if (y < needed + 50) {
        currentPage = pdfDoc.addPage([595, 842])[0] ?? pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
        // addPage returns the page itself
        const pages = pdfDoc.getPages();
        currentPage = pages[pages.length - 1];
        y = 842 - 50;
      }
    };

    // ── Header ──────────────────────────────────────────────────────
    currentPage.drawText('FAKTURA', {
      x: leftMargin, y, size: 24, font: fontBold, color: rgb(0.1, 0.1, 0.1),
    });
    y -= 22;

    // Display invoice number with OMA- prefix if not already present
    const rawInvoiceNumber = invoice.invoice_number || `INV-${invoice_id.substring(0, 8).toUpperCase()}`;
    const displayInvoiceNumber = rawInvoiceNumber.startsWith('OMA-') ? rawInvoiceNumber : `OMA-${rawInvoiceNumber.replace(/^OMA-/, '')}`;
    currentPage.drawText(`Číslo faktury: ${displayInvoiceNumber}`, {
      x: leftMargin, y, size: 10, font, color: rgb(0.3, 0.3, 0.3),
    });
    y -= 14;

    // Display variable symbol as numeric part only (YYYYNNNN)
    const rawVs = invoice.variable_symbol || rawInvoiceNumber;
    const numericVs = rawVs.replace(/\D/g, '');
    if (numericVs) {
      currentPage.drawText(`Variabilní symbol: ${numericVs}`, {
        x: leftMargin, y, size: 10, font, color: rgb(0.3, 0.3, 0.3),
      });
      y -= 14;
    }

    currentPage.drawText(`Konstantní symbol: ${CONSTANT_SYMBOL}`, {
      x: leftMargin, y, size: 10, font, color: rgb(0.3, 0.3, 0.3),
    });
    y -= 30;

    // ── Supplier / Customer columns ─────────────────────────────────
    currentPage.drawText('Dodavatel:', { x: leftMargin, y, size: 10, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
    currentPage.drawText('Odběratel:', { x: rightCol, y, size: 10, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
    y -= 15;

    // Supplier info (hardcoded)
    currentPage.drawText(SUPPLIER.name, { x: leftMargin, y, size: 10, font });
    currentPage.drawText(partnerName, { x: rightCol, y, size: 10, font });
    y -= 13;

    currentPage.drawText(`IČO: ${SUPPLIER.ico}`, { x: leftMargin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    if (partner?.ico) {
      currentPage.drawText(`IČO: ${partner.ico}`, { x: rightCol, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    }
    y -= 12;

    currentPage.drawText(`DIČ: ${SUPPLIER.dic}`, { x: leftMargin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    if (partner?.dic) {
      currentPage.drawText(`DIČ: ${partner.dic}`, { x: rightCol, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    }
    y -= 12;

    currentPage.drawText(SUPPLIER.street, { x: leftMargin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    if (partner?.billing_street) {
      currentPage.drawText(partner.billing_street, { x: rightCol, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    }
    y -= 12;

    currentPage.drawText(SUPPLIER.city, { x: leftMargin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    if (partner?.billing_city || partner?.billing_zip) {
      currentPage.drawText(`${partner.billing_zip || ''} ${partner.billing_city || ''}`.trim(), { x: rightCol, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    }
    y -= 12;

    currentPage.drawText(SUPPLIER.register, { x: leftMargin, y, size: 7, font, color: rgb(0.5, 0.5, 0.5) });
    y -= 18;

    // ── Period & dates ──────────────────────────────────────────────
    const periodFrom = invoice.period_start || invoice.period_from;
    const periodTo = invoice.period_end || invoice.period_to;

    // Compute issue date = first Monday after period_to
    const issueDate = firstMondayAfter(periodTo);
    // Due date = issue date + 7 days
    const dueDate = addDays(issueDate, 7);

    currentPage.drawText(`Období: ${formatDate(periodFrom)} – ${formatDate(periodTo)}`, {
      x: leftMargin, y, size: 10, font,
    });
    y -= 14;
    currentPage.drawText(`Datum vystavení: ${formatDate(issueDate.toISOString())}`, {
      x: leftMargin, y, size: 10, font, color: rgb(0.4, 0.4, 0.4),
    });
    y -= 14;
    currentPage.drawText(`Datum splatnosti: ${formatDate(dueDate.toISOString())}`, {
      x: leftMargin, y, size: 10, font, color: rgb(0.4, 0.4, 0.4),
    });
    y -= 25;

    // ── Summary box ─────────────────────────────────────────────────
    currentPage.drawRectangle({
      x: leftMargin, y: y - 60, width: 495, height: 65,
      color: rgb(0.95, 0.95, 0.97),
    });
    y -= 5;

    const amountNet = Number(invoice.amount_net ?? invoice.amount_ex_vat ?? 0);
    const vatAmount = Number(invoice.vat_amount ?? 0);
    const amountGross = Number(invoice.amount_gross ?? invoice.amount_inc_vat ?? 0);

    const summaryItems = [
      { label: 'Celkem coinů:', value: String(invoice.coins_total ?? invoice.coins_activated ?? 0) },
      { label: 'Cena bez DPH:', value: formatCurrency(amountNet) },
      { label: 'DPH 21 %:', value: formatCurrency(vatAmount) },
      { label: 'Cena s DPH:', value: formatCurrency(amountGross) },
    ];

    let sx = leftMargin + 10;
    for (const item of summaryItems) {
      currentPage.drawText(item.label, { x: sx, y: y - 15, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      currentPage.drawText(item.value, { x: sx, y: y - 30, size: 12, font: fontBold });
      sx += 125;
    }
    y -= 75;

    // ── Payment info section ────────────────────────────────────────
    currentPage.drawText('Platební údaje:', { x: leftMargin, y, size: 10, font: fontBold });
    y -= 15;
    currentPage.drawText(`Číslo účtu: ${BANK_ACCOUNT}`, { x: leftMargin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 12;
    currentPage.drawText(`IBAN: ${BANK_IBAN}`, { x: leftMargin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 12;
    currentPage.drawText(`BIC: ${BANK_BIC}`, { x: leftMargin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 12;
    currentPage.drawText(`Variabilní symbol: ${numericVs || '-'}`, { x: leftMargin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 12;
    currentPage.drawText(`Konstantní symbol: ${CONSTANT_SYMBOL}`, { x: leftMargin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 20;

    // ── Invoice lines table ─────────────────────────────────────────
    if (lines && lines.length > 0) {
      currentPage.drawText('Položky faktury', { x: leftMargin, y, size: 12, font: fontBold });
      y -= 20;

      // Table header
      currentPage.drawRectangle({
        x: leftMargin, y: y - 2, width: 495, height: 16,
        color: rgb(0.9, 0.9, 0.92),
      });
      currentPage.drawText('#', { x: leftMargin + 5, y: y + 2, size: 8, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      currentPage.drawText('Datum aktivace', { x: leftMargin + 30, y: y + 2, size: 8, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      currentPage.drawText('Ext. objednávka', { x: leftMargin + 180, y: y + 2, size: 8, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      currentPage.drawText('Coiny', { x: leftMargin + 400, y: y + 2, size: 8, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      y -= 18;

      for (let i = 0; i < lines.length; i++) {
        if (y < 80) {
          currentPage = pdfDoc.addPage([595, 842]);
          y = 842 - 50;
        }

        const line = lines[i];
        const bgColor = i % 2 === 0 ? rgb(1, 1, 1) : rgb(0.97, 0.97, 0.98);
        currentPage.drawRectangle({
          x: leftMargin, y: y - 2, width: 495, height: 14,
          color: bgColor,
        });

        currentPage.drawText(String(i + 1), { x: leftMargin + 5, y: y + 1, size: 8, font });
        currentPage.drawText(formatDate(line.activated_at), { x: leftMargin + 30, y: y + 1, size: 8, font });
        currentPage.drawText(line.external_order_id || '-', { x: leftMargin + 180, y: y + 1, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
        currentPage.drawText(String(line.coins), { x: leftMargin + 400, y: y + 1, size: 8, font: fontBold });
        y -= 15;
      }

      y -= 10;
    }

    // ── Activation control list (always rendered) ─────────────────
    if (y < 120) {
      currentPage = pdfDoc.addPage([595, 842]);
      y = 842 - 50;
    }

    currentPage.drawText('Kontrolní přehled aktivací MioCoinů', {
      x: leftMargin, y, size: 12, font: fontBold,
    });
    y -= 20;

    if (activations.length === 0) {
      currentPage.drawText('Žádné aktivace v tomto období.', {
        x: leftMargin, y, size: 9, font, color: rgb(0.5, 0.5, 0.5),
      });
      y -= 20;
    } else {
      // Table header
      currentPage.drawRectangle({
        x: leftMargin, y: y - 2, width: 495, height: 16,
        color: rgb(0.9, 0.9, 0.92),
      });
      currentPage.drawText('#', { x: leftMargin + 5, y: y + 2, size: 7, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      currentPage.drawText('E-mail', { x: leftMargin + 25, y: y + 2, size: 7, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      currentPage.drawText('Datum aktivace', { x: leftMargin + 200, y: y + 2, size: 7, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      currentPage.drawText('Kód', { x: leftMargin + 320, y: y + 2, size: 7, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      currentPage.drawText('MioCoiny', { x: leftMargin + 430, y: y + 2, size: 7, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
      y -= 18;

      let totalCoins = 0;
      for (let i = 0; i < activations.length; i++) {
        if (y < 60) {
          currentPage = pdfDoc.addPage([595, 842]);
          y = 842 - 50;
        }

        const act = activations[i];
        totalCoins += act.coins;
        const bgColor = i % 2 === 0 ? rgb(1, 1, 1) : rgb(0.97, 0.97, 0.98);
        currentPage.drawRectangle({
          x: leftMargin, y: y - 2, width: 495, height: 14,
          color: bgColor,
        });

        // Truncate email if too long
        let email = act.user_email || '-';
        if (email.length > 30) email = email.substring(0, 28) + '…';

        currentPage.drawText(String(i + 1), { x: leftMargin + 5, y: y + 1, size: 7, font });
        currentPage.drawText(email, { x: leftMargin + 25, y: y + 1, size: 7, font });
        currentPage.drawText(formatDate(act.activated_at), { x: leftMargin + 200, y: y + 1, size: 7, font });
        currentPage.drawText(act.code || '-', { x: leftMargin + 320, y: y + 1, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
        currentPage.drawText(String(act.coins), { x: leftMargin + 430, y: y + 1, size: 7, font: fontBold });
        y -= 14;
      }

      // Sum row
      if (y < 40) {
        currentPage = pdfDoc.addPage([595, 842]);
        y = 842 - 50;
      }
      currentPage.drawRectangle({
        x: leftMargin, y: y - 2, width: 495, height: 16,
        color: rgb(0.92, 0.92, 0.95),
      });
      currentPage.drawText('Celkem:', { x: leftMargin + 320, y: y + 2, size: 8, font: fontBold });
      currentPage.drawText(String(totalCoins), { x: leftMargin + 430, y: y + 2, size: 8, font: fontBold });
      y -= 25;
    }

    // ── QR payment code ─────────────────────────────────────────────
    if (qrPngBytes) {
      // Place QR in bottom-right of the last page
      const qrImage = await pdfDoc.embedPng(qrPngBytes);
      const qrSize = 100;
      const qrX = rightMargin - qrSize;
      const qrY = 45;

      const lastPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
      lastPage.drawText('QR kód pro rychlou platbu', {
        x: qrX - 10, y: qrY + qrSize + 12, size: 8, font, color: rgb(0.4, 0.4, 0.4),
      });
      lastPage.drawImage(qrImage, {
        x: qrX, y: qrY, width: qrSize, height: qrSize,
      });
    }

    // ── Footer ──────────────────────────────────────────────────────
    const lastPageFooter = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
    lastPageFooter.drawText('Faktura slouží jako daňový doklad.', {
      x: leftMargin, y: 42, size: 8, font: fontBold, color: rgb(0.3, 0.3, 0.3),
    });
    lastPageFooter.drawText(`Vygenerováno: ${new Date().toLocaleString('cs-CZ')}`, {
      x: leftMargin, y: 30, size: 7, font, color: rgb(0.6, 0.6, 0.6),
    });

    // ── 6. Serialize PDF ────────────────────────────────────────────
    const pdfBytes = await pdfDoc.save();
    console.log(`PDF generated, size: ${pdfBytes.length} bytes`);

    // ── 7. Upload to storage ────────────────────────────────────────
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

    // ── 8. Get public URL ───────────────────────────────────────────
    const { data: urlData } = supabase.storage
      .from('partner-invoices')
      .getPublicUrl(filename);

    const fileUrl = urlData.publicUrl;
    console.log('PDF uploaded:', fileUrl);

    // ── 9. Record export ────────────────────────────────────────────
    const { error: exportError } = await supabase
      .from('partner_invoice_exports')
      .insert({
        invoice_id,
        format: 'pdf',
        file_url: fileUrl,
      });

    if (exportError) {
      console.error('Error recording export:', exportError);
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
