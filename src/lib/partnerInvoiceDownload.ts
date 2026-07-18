import { supabase } from '@/integrations/supabase/client';

export async function getPartnerInvoiceExportUrl(exportId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('get-partner-invoice-export-url', {
    body: { export_id: exportId },
  });

  if (error) {
    throw new Error(error.message || 'Nepodařilo se vytvořit odkaz pro stažení');
  }
  if (!data?.signed_url) {
    throw new Error(data?.error || 'Odkaz pro stažení není k dispozici');
  }

  return data.signed_url as string;
}

export async function openPartnerInvoiceExport(exportId: string): Promise<void> {
  const signedUrl = await getPartnerInvoiceExportUrl(exportId);
  window.open(signedUrl, '_blank', 'noopener,noreferrer');
}
