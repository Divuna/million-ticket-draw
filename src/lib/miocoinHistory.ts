import { formatMioCoin } from '@/lib/miocoin';

export type MioCoinHistoryEntry = {
  entry_id: string;
  occurred_at: string;
  amount: number | string;
  entry_type: string;
  entry_source: string;
  partner_name: string | null;
  partner_website_url: string | null;
  external_order_id: string | null;
  entry_metadata: Record<string, unknown> | null;
};

export const MIOCOIN_HISTORY_ENTRY_LABELS: Record<string, string> = {
  miocoin_code_credit: 'Získáno z partnerského nákupu',
  payment_credit: 'Dobití MioCoinů',
  top_up: 'Dobití MioCoinů',
  ticket_purchase: 'Použito v soutěži',
  benefit_purchase: 'Použito na nákup benefitu',
  voucher_purchase: 'Použito na voucher',
  refund_debit: 'Vrácení platby MioCoinů',
  refund_reversal: 'Vrácení MioCoinů po neúspěšné refundaci',
  bonus_credit: 'Získáno jako bonus',
  bonus_transfer_to_main: 'Převod bonusových MioCoinů',
  admin_adjustment: 'Úprava zůstatku MioCoinů',
};

export function getMioCoinHistoryLabel(entry: Pick<MioCoinHistoryEntry, 'entry_type' | 'partner_name'>): string {
  if (entry.entry_type === 'miocoin_code_credit' && entry.partner_name) {
    return `Získáno od ${entry.partner_name}`;
  }

  return MIOCOIN_HISTORY_ENTRY_LABELS[entry.entry_type] ?? 'Pohyb MioCoinů';
}

export function formatSignedMioCoin(amount: number): string {
  const prefix = amount > 0 ? '+' : amount < 0 ? '−' : '';
  return `${prefix}${formatMioCoin(Math.abs(amount))}`;
}
