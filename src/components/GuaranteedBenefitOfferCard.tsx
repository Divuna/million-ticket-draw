import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

/**
 * Garantovaný nákupní benefit — customer offer on the contest detail page.
 *
 * The customer pays MioCoins for the benefit; the contest ticket is added free
 * as a bonus. Nothing here touches the classic ticket purchase: that flow keeps
 * using buy_ticket_atomic untouched, this one uses only
 * purchase_guaranteed_benefit_bundle_atomic.
 *
 * The card renders nothing at all unless the read-only RPC
 * get_guaranteed_benefit_offer reports an actually purchasable offer. That RPC
 * applies the same gates as the purchase (feature flag, pilot allowlist, active
 * contest, approved benefit with a free code, price set), so with the flag off
 * the customer sees no new UI and the normal purchase is unchanged.
 */

export interface GuaranteedBenefitTicketResult {
  ticket_number: number;
  ticket_price: number;
  next_bonus_position?: number | null;
  distance_to_next_bonus?: number | null;
  won_prize?: string | null;
  remaining_tickets?: number;
  won_type?: "bonus" | "main" | null;
  bonus_prize_id?: string | null;
}

interface BenefitOffer {
  available: boolean;
  benefit_name?: string | null;
  benefit_short_description?: string | null;
  partner_name?: string | null;
  price_miocoins?: number | null;
  image_url?: string | null;
  voucher_id?: string | null;
}

interface Props {
  contestId: string;
  userId: string | null;
  contestStatus: string;
  /** Called after the purchase so the page can refresh the wallet balance. */
  onBalanceShouldRefresh: () => void;
  /** Called once the customer closes the benefit reveal, to open TicketResultModal. */
  onShowTicketResult: (result: GuaranteedBenefitTicketResult) => void;
}

/** Maps the RPC's structured error codes onto customer-facing Czech messages. */
function messageForError(code: string | undefined): string {
  switch (code) {
    case "insufficient_miocoins":
      return "Nemáš dost MioCoinů na tento benefit.";
    case "no_benefit_available":
      return "Benefit už bohužel není dostupný.";
    case "benefit_price_not_set":
      return "Benefit zatím nemá nastavenou cenu.";
    case "contest_not_active":
      return "Soutěž není aktivní.";
    case "contest_not_found":
      return "Soutěž nebyla nalezena.";
    case "feature_disabled":
    case "contest_not_in_pilot":
      return "Benefit tu teď není v nabídce.";
    case "wallet_not_found":
      return "Nepodařilo se načíst tvou peněženku.";
    case "purchase_already_in_progress":
      return "Nákup už probíhá.";
    case "unauthorized":
    case "forbidden":
      return "Pro nákup se prosím znovu přihlas.";
    default:
      return "Nákup benefitu se nepodařil.";
  }
}

export function GuaranteedBenefitOfferCard({
  contestId,
  userId,
  contestStatus,
  onBalanceShouldRefresh,
  onShowTicketResult,
}: Props) {
  const [offer, setOffer] = useState<BenefitOffer | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchasedBenefit, setPurchasedBenefit] = useState<BenefitOffer | null>(null);
  // Guards a second click that lands before React re-renders the disabled button.
  const inFlightRef = useRef(false);
  const pendingResultRef = useRef<GuaranteedBenefitTicketResult | null>(null);

  const loadOffer = useCallback(async () => {
    if (!userId || contestStatus !== "active") {
      setOffer(null);
      return;
    }
    try {
      const { data, error } = await supabase.rpc("get_guaranteed_benefit_offer", {
        p_contest_id: contestId,
      });
      if (error) {
        setOffer(null);
        return;
      }
      const result = data as BenefitOffer | null;
      setOffer(result?.available === true ? result : null);
    } catch {
      setOffer(null);
    }
  }, [contestId, userId, contestStatus]);

  useEffect(() => {
    void loadOffer();
  }, [loadOffer]);

  const handlePurchase = useCallback(async () => {
    if (inFlightRef.current || !userId || !offer) return;
    inFlightRef.current = true;
    setPurchasing(true);

    // A fresh idempotency key per real purchase attempt. A failed attempt rolls
    // back completely, so a retry deliberately starts a new key.
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      const { data, error } = await supabase.rpc(
        "purchase_guaranteed_benefit_bundle_atomic",
        {
          p_user_id: userId,
          p_contest_id: contestId,
          p_idempotency_key: idempotencyKey,
        },
      );

      if (error) {
        toast.error(messageForError(undefined));
        return;
      }

      const result = data as
        | ({ success?: boolean; error?: string } & GuaranteedBenefitTicketResult)
        | null;

      if (!result || result.success !== true) {
        toast.error(messageForError(result?.error));
        // Availability may have changed under us; re-read the offer.
        void loadOffer();
        return;
      }

      onBalanceShouldRefresh();

      pendingResultRef.current = {
        ticket_number: result.ticket_number,
        ticket_price: 0, // the ticket is a free bonus in this flow
        next_bonus_position: result.next_bonus_position ?? null,
        distance_to_next_bonus: result.distance_to_next_bonus ?? null,
        won_prize: result.won_prize ?? null,
        remaining_tickets: result.remaining_tickets,
        won_type: result.won_type ?? null,
        bonus_prize_id: result.bonus_prize_id ?? null,
      };
      // Show the acquired benefit first; TicketResultModal follows on close.
      setPurchasedBenefit(offer);
      void loadOffer();
    } catch {
      toast.error(messageForError(undefined));
    } finally {
      inFlightRef.current = false;
      setPurchasing(false);
    }
  }, [contestId, userId, offer, loadOffer, onBalanceShouldRefresh]);

  const closeBenefitReveal = useCallback(() => {
    setPurchasedBenefit(null);
    const result = pendingResultRef.current;
    pendingResultRef.current = null;
    if (result) onShowTicketResult(result);
  }, [onShowTicketResult]);

  // The reveal has to outlive the offer. After a purchase the re-read can
  // legitimately report available:false — the customer took the last code, the
  // order ran out, the free ticket closed the contest (main prize!), or the
  // flag was switched off. Hiding the offer must never unmount the
  // confirmation, otherwise the customer loses both the benefit reveal and the
  // TicketResultModal that opens when it is closed.
  const activeOffer = offer?.available ? offer : null;
  const revealOpen = purchasedBenefit !== null;
  if (!activeOffer && !revealOpen) return null;

  const price = Number(activeOffer?.price_miocoins ?? 0);

  return (
    <>
      {activeOffer && (
        <section
          data-testid="guaranteed-benefit-offer"
          className="voucher-card-glow bg-[hsl(220_25%_8%)]/80 backdrop-blur rounded-[20px] p-5 border-[2px] border-[rgba(255,138,0,0.35)] flex flex-col gap-4 animate-fade-in"
        >
          <div className="flex items-start gap-4">
            {activeOffer.image_url && (
              <img
                src={activeOffer.image_url}
                alt={activeOffer.benefit_name ?? "Garantovaný nákupní benefit"}
                className="h-20 w-20 rounded-2xl object-cover flex-shrink-0 border border-[rgba(255,138,0,0.25)]"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wide text-[#FF8A00] font-semibold">
                Garantovaný nákupní benefit
              </p>
              <h3 className="text-xl md:text-2xl font-extrabold text-white leading-tight mt-1 break-words">
                {activeOffer.benefit_name}
              </h3>
              {activeOffer.partner_name && (
                <p className="text-sm text-gray-300 mt-0.5">od {activeOffer.partner_name}</p>
              )}
              {activeOffer.benefit_short_description && (
                <p className="text-sm text-gray-400 mt-2">{activeOffer.benefit_short_description}</p>
              )}
            </div>
          </div>

          <p className="text-sm text-gray-200">
            Kupuješ <span className="font-semibold text-white">garantovaný nákupní benefit</span> za{" "}
            <span className="font-semibold text-white">
              {price.toLocaleString("cs-CZ")} MioCoinů
            </span>
            . Tiket do soutěže dostaneš{" "}
            <span className="font-semibold text-[#FF8A00]">zdarma jako bonus</span>.
          </p>

          <Button
            data-testid="guaranteed-benefit-buy"
            onClick={handlePurchase}
            disabled={purchasing}
            variant="premium"
            className="h-11 font-semibold px-5 rounded-full whitespace-nowrap mt-auto"
          >
            {purchasing ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                Kupuji…
              </span>
            ) : (
              `Získat benefit za ${price.toLocaleString("cs-CZ")} MioCoinů + tiket zdarma`
            )}
          </Button>
        </section>
      )}

      <Dialog open={revealOpen} onOpenChange={(open) => { if (!open) closeBenefitReveal(); }}>
        <DialogContent
          data-testid="guaranteed-benefit-reveal"
          className="bg-[hsl(220_25%_8%)] border-[2px] border-[rgba(255,138,0,0.35)] text-white"
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-extrabold">
              Benefit je tvůj
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {purchasedBenefit?.image_url && (
              <img
                src={purchasedBenefit.image_url}
                alt={purchasedBenefit.benefit_name ?? "Garantovaný nákupní benefit"}
                className="h-28 w-full rounded-2xl object-cover border border-[rgba(255,138,0,0.25)]"
              />
            )}
            <p className="text-lg font-bold">{purchasedBenefit?.benefit_name}</p>
            {purchasedBenefit?.partner_name && (
              <p className="text-sm text-gray-300">od {purchasedBenefit.partner_name}</p>
            )}
            <p className="text-sm text-gray-300">
              Najdeš ho ve svých voucherech. Tiket do soutěže máš zdarma jako bonus.
            </p>
            <Button
              onClick={closeBenefitReveal}
              variant="premium"
              className="h-11 font-semibold rounded-full mt-1"
            >
              Zobrazit tiket
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
