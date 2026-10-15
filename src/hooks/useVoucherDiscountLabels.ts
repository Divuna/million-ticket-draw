import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Slevové nálepky voucherů (`vouchers.discount_label`, např. „−20 %“) – jen zobrazení.
 * Jeden sdílený dotaz pro všechny karty; tabulka `vouchers` je veřejně čitelný katalog.
 * Při chybě (např. sloupec ještě neexistuje) vrací prázdnou mapu – karta pak nálepku nemá.
 */
export function useVoucherDiscountLabels(): Record<string, string> {
  const { data } = useQuery({
    queryKey: ['voucher-discount-labels'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vouchers')
        .select('id, discount_label' as never)
        .not('discount_label' as never, 'is', null);
      if (error) return {} as Record<string, string>;
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as unknown as Array<{ id: string; discount_label: string | null }>) {
        const label = row.discount_label?.trim();
        if (label) map[row.id] = label;
      }
      return map;
    },
  });
  return data ?? {};
}
