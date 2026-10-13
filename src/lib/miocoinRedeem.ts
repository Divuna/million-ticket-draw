import { supabase } from '@/integrations/supabase/client';

export type RedeemResult = {
  success: boolean;
  coins?: number | string;
  new_balance?: number | string;
  error?: string;
};

export const MIOCOIN_REDEEM_ERROR_MESSAGES: Record<string, string> = {
  not_logged_in: 'Pro uplatnění kódu se musíte přihlásit.',
  invalid_code: 'Neplatný kód. Zkontrolujte zadání a zkuste to znovu.',
  already_used: 'Tento kód již byl uplatněn.',
  expired: 'Platnost tohoto kódu vypršela.',
  cancelled: 'Tento kód byl zrušen.',
  email_mismatch: 'Tento kód je vázán na jiný e-mail.',
  already_claimed: 'Tento bonus už jste využili.',
  limit_reached: 'Všechny bonusy z této akce už byly rozdány.',
  inactive: 'Tento bonusový kód je pozastaven.',
  not_started: 'Tato bonusová akce ještě nezačala.',
  not_eligible: 'Pro tento bonus nesplňujete podmínky.',
  email_not_verified: 'Nejdříve potvrďte svůj e-mail.',
};

type RedeemRpc = (
  functionName: 'redeem_miocoin_code' | 'redeem_promo_mio_campaign',
  arguments_: { p_code: string },
) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

/** Invokes the canonical, row-locked database redemption RPC for one code. */
export async function redeemMioCoinCode(code: string): Promise<RedeemResult> {
  const rpc = supabase.rpc.bind(supabase) as unknown as RedeemRpc;
  const { data, error } = await rpc('redeem_miocoin_code', {
    p_code: code.trim(),
  });

  if (error) throw new Error(error.message);
  const partnerResult = data as RedeemResult;
  // Existing partner codes retain priority and their one-time activation logic.
  if (partnerResult?.error !== 'invalid_code') return partnerResult;

  // Shared promotion codes are a separate, independently audited redemption flow.
  const { data: promoData, error: promoError } = await rpc('redeem_promo_mio_campaign', {
    p_code: code.trim(),
  });
  // Safe during staged rollout: an uninstalled campaign RPC must never break
  // the existing customer error message for an unknown partner code.
  if (promoError?.code === 'PGRST202' || promoError?.code === '42883') return partnerResult;
  if (promoError) throw new Error(promoError.message);
  return (promoData as RedeemResult) ?? partnerResult;
}
