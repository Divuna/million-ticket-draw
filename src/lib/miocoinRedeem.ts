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
};

type RedeemRpc = (
  functionName: 'redeem_miocoin_code',
  arguments_: { p_code: string },
) => Promise<{ data: unknown; error: { message: string } | null }>;

/** Invokes the canonical, row-locked database redemption RPC for one code. */
export async function redeemMioCoinCode(code: string): Promise<RedeemResult> {
  const rpc = supabase.rpc.bind(supabase) as unknown as RedeemRpc;
  const { data, error } = await rpc('redeem_miocoin_code', {
    p_code: code.trim(),
  });

  if (error) throw new Error(error.message);
  return data as RedeemResult;
}
