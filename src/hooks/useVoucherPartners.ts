import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VoucherPartnerInfo {
  name: string;
  logoUrl: string | null;
}

/**
 * Partner (název a logo) ke každému voucheru – jen zobrazení na kartě.
 * `vouchers` i `public_partners` jsou veřejně čitelné; při chybě vrací prázdnou mapu
 * a karta pak ukáže znak OneMil místo loga.
 */
export function useVoucherPartners(): Record<string, VoucherPartnerInfo> {
  const { data } = useQuery({
    queryKey: ['voucher-partners'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('vouchers')
        .select('id, partner_id' as never)
        .not('partner_id' as never, 'is', null);
      if (error || !rows?.length) return {} as Record<string, VoucherPartnerInfo>;
      const list = rows as unknown as Array<{ id: string; partner_id: string }>;
      const partnerIds = [...new Set(list.map((r) => r.partner_id))];
      const { data: partners } = await supabase
        .from('public_partners' as never)
        .select('id, name, logo_url')
        .in('id', partnerIds);
      const byId = new Map(
        ((partners ?? []) as unknown as Array<{ id: string; name: string; logo_url: string | null }>).map((p) => [p.id, p]),
      );
      const map: Record<string, VoucherPartnerInfo> = {};
      for (const row of list) {
        const p = byId.get(row.partner_id);
        if (p) map[row.id] = { name: p.name, logoUrl: p.logo_url };
      }
      return map;
    },
  });
  return data ?? {};
}
