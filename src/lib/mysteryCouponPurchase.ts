import { supabase } from "@/integrations/supabase/client";

/**
 * Mystery kupon — sdílená nákupní vrstva.
 *
 * Zákazník používá jediné existující tlačítko „Uplatnit X MioCoinů". Cena je
 * vždy contests.ticket_price, tedy stejná jako u klasického nákupu. Před
 * nákupem se o kuponu nesmí prozradit nic — read-only RPC
 * get_guaranteed_benefit_offer proto vrací jen dostupnost a cenu.
 *
 * U soutěží, které v pilotu nejsou, se tenhle modul chová jako by neexistoval
 * (isMysteryContestAvailable vrátí false) a stránka pokračuje nezměněným
 * buy_ticket_atomic.
 */

export interface MysteryCoupon {
  name: string | null;
  short_description: string | null;
  how_to_use: string | null;
  terms: string | null;
  partner_name: string | null;
  image_url: string | null;
  /** Uplatňovací kód — zobrazí se teprve po dokončeném nákupu. */
  code: string | null;
  valid_until: string | null;
}

export interface MysteryPurchaseSuccess {
  success: true;
  ticket_row_id: string | null;
  bonus_prize_id: string | null;
  won_type: "bonus" | "main" | null;
  won_prize: string | null;
  charged_miocoins: number;
  coupon: MysteryCoupon | null;
}

export interface MysteryPurchaseFailure {
  success: false;
  error: string;
}

export type MysteryPurchaseResult = MysteryPurchaseSuccess | MysteryPurchaseFailure;

/**
 * Zjistí, jestli je pro soutěž dostupný mystery kupon. Vrací jen dostupnost —
 * cena se bere z contest.ticket_price, který stránka už má.
 */
export async function isMysteryContestAvailable(contestId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("get_guaranteed_benefit_offer", {
      p_contest_id: contestId,
    });
    if (error) return false;
    return (data as { available?: boolean } | null)?.available === true;
  } catch {
    return false;
  }
}

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Atomický nákup: strhne contests.ticket_price, přidělí náhodný dostupný
 * kupon a k němu tiket zdarma. Při jakékoli chybě se celá transakce vrátí
 * zpět — MioCoiny se nestrhnou a tiket nevznikne.
 */
export async function purchaseMysteryCoupon(
  userId: string,
  contestId: string,
): Promise<MysteryPurchaseResult> {
  try {
    const { data, error } = await supabase.rpc(
      "purchase_guaranteed_benefit_bundle_public",
      {
        p_user_id: userId,
        p_contest_id: contestId,
        p_idempotency_key: newIdempotencyKey(),
      },
    );

    if (error) return { success: false, error: "rpc_error" };

    const result = data as (Partial<MysteryPurchaseSuccess> & { error?: string }) | null;
    if (!result || result.success !== true) {
      return { success: false, error: result?.error ?? "unknown_error" };
    }

    return {
      success: true,
      ticket_row_id: result.ticket_row_id ?? null,
      bonus_prize_id: result.bonus_prize_id ?? null,
      won_type: result.won_type ?? null,
      won_prize: result.won_prize ?? null,
      charged_miocoins: Number(result.charged_miocoins ?? 0),
      coupon: (result.coupon as MysteryCoupon | null) ?? null,
    };
  } catch {
    return { success: false, error: "unknown_error" };
  }
}

/** Chybové kódy RPC → zákaznické české hlášky. */
export function mysteryErrorMessage(code: string | undefined): string {
  switch (code) {
    case "insufficient_miocoins":
      return "Nemáš dost MioCoinů.";
    case "no_benefit_available":
      return "Kupony jsou právě rozebrané. Zkus to prosím znovu za chvíli.";
    case "contest_not_active":
      return "Soutěž není aktivní.";
    case "contest_not_found":
      return "Soutěž nebyla nalezena.";
    case "contest_full":
      return "Soutěž je plná.";
    case "wallet_not_found":
      return "Nepodařilo se načíst tvou peněženku.";
    case "purchase_already_in_progress":
      return "Nákup už probíhá.";
    case "unauthorized":
    case "forbidden":
      return "Pro nákup se prosím znovu přihlas.";
    default:
      return "Nákup se nepodařil.";
  }
}
