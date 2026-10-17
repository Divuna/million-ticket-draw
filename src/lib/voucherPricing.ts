import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Cena voucheru pro zákazníka v MIO.
 * Zdroj pravdy je DB: `get_voucher_price_mio()` podle přepínače `settings.voucher_paid_enabled`
 * (vypnuto = 0 = zdarma, zapnuto = 5 MIO). Tutéž cenu strhává `buy_voucher_atomic`.
 * Než je migrace `20261017120000_vouchers_free_for_customers` aplikovaná, RPC neexistuje
 * a web bezpečně ukazuje dosavadních 5 MIO.
 */
export const LEGACY_VOUCHER_PRICE_MIO = 5;

export function useVoucherPrice(): number {
  const { data } = useQuery({
    queryKey: ['voucher-price-mio'],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as never as {
        rpc: (fn: string) => Promise<{ data: unknown; error: unknown }>;
      }).rpc('get_voucher_price_mio');
      if (error || data == null) return LEGACY_VOUCHER_PRICE_MIO;
      const price = Number(data);
      return Number.isFinite(price) ? price : LEGACY_VOUCHER_PRICE_MIO;
    },
  });
  return data ?? LEGACY_VOUCHER_PRICE_MIO;
}

/** Text tlačítka u voucheru, který si zákazník ještě nevzal. */
export const voucherCtaLabel = (price: number) => (price > 0 ? `Koupit za ${price} MIO` : 'Získat slevu');

/** Hláška po úspěšném získání voucheru. */
export const voucherAcquiredMessage = (price: number) =>
  price > 0 ? `Voucher úspěšně zakoupen za ${price} MIO!` : 'Sleva je tvoje!';
