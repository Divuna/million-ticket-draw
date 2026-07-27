import { useCallback, useEffect, useState } from "react";
import Confetti from "react-confetti";
import { useWindowSize } from "react-use";
import { supabase } from "@/integrations/supabase/client";
import { MIOCOIN_IMAGE_URL } from "@/components/MioCoin";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import type { MysteryCoupon } from "@/lib/mysteryCouponPurchase";

/**
 * Jeden výsledek mystery nákupu.
 *
 * Dřív se po nákupu otevřelo odhalení kuponu a po jeho zavření ještě
 * TicketResultModal — zákazník tak zavíral dvě okna za sebou a výhra z tiketu
 * se ztrácela za kuponem. Tady je obojí v jednom: nahoře výhra z tiketu jako
 * hlavní sdělení, pod ní kupon jako druhý, garantovaný bonus.
 *
 * Dialog nic nevytváří ani neukládá. Tiket i kupon už v databázi jsou —
 * `purchase_guaranteed_benefit_bundle_atomic` je zapsal v jedné transakci
 * ještě předtím, než se sem cokoli dostalo. „Pokračovat" jen zavírá.
 */

export interface MysteryTicketOutcome {
  ticket_number: number;
  won_type: "bonus" | "main" | null;
  won_prize: string | null;
}

interface BonusPrizeRow {
  title: string | null;
  description: string | null;
  detailed_description: string | null;
  image_url: string | null;
  amount: number | null;
}

interface ContestPrizeRow {
  main_prize: string | null;
  main_image: string | null;
  description: string | null;
}

interface Props {
  open: boolean;
  contestId: string | null;
  ticket: MysteryTicketOutcome | null;
  coupon: MysteryCoupon | null;
  onClose: () => void;
}

/** Storage cesta → veřejná URL. Absolutní URL se nechává být. */
function resolveImage(path: string | null | undefined, bucket = "contest-images"): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export function MysteryPurchaseResultDialog({
  open,
  contestId,
  ticket,
  coupon,
  onClose,
}: Props) {
  const { width, height } = useWindowSize();
  const [bonusPrize, setBonusPrize] = useState<BonusPrizeRow | null>(null);
  const [contestPrize, setContestPrize] = useState<ContestPrizeRow | null>(null);
  const [copied, setCopied] = useState(false);

  const wonType = ticket?.won_type ?? null;
  const isWin = wonType === "bonus" || wonType === "main";

  // Detaily výhry se dotahují ze stejných zdrojů jako v TicketResultModal:
  // bonusová z `bonus_prizes` podle pozice tiketu, hlavní ze soutěže.
  useEffect(() => {
    if (!open || !contestId || !ticket) {
      setBonusPrize(null);
      setContestPrize(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        if (wonType === "bonus") {
          const { data } = await supabase
            .from("bonus_prizes")
            .select("title, description, detailed_description, image_url, amount")
            .eq("contest_id", contestId)
            .eq("ticket_position", ticket.ticket_number)
            .maybeSingle();
          if (!cancelled) setBonusPrize((data as BonusPrizeRow | null) ?? null);
        } else if (wonType === "main") {
          const { data } = await supabase
            .from("contests")
            .select("main_prize, main_image, description")
            .eq("id", contestId)
            .maybeSingle();
          if (!cancelled) setContestPrize((data as ContestPrizeRow | null) ?? null);
        }
      } catch {
        // Chybějící detail výhru nezruší — název z RPC zůstává.
        if (!cancelled) {
          setBonusPrize(null);
          setContestPrize(null);
        }
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [open, contestId, ticket, wonType]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const handleCopy = useCallback(async () => {
    if (!coupon?.code) return;
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      toast.success("Kód zkopírován");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Kód se nepodařilo zkopírovat. Opiš ho prosím ručně.");
    }
  }, [coupon?.code]);

  // MioCoinová výhra má na `bonus_prizes` vyplněnou částku; věcná ji nemá.
  const miocoinAmount =
    wonType === "bonus" && bonusPrize?.amount != null && Number(bonusPrize.amount) > 0
      ? Number(bonusPrize.amount)
      : null;
  const isMioCoinWin = miocoinAmount !== null;

  const prizeTitle =
    isMioCoinWin
      ? `${miocoinAmount.toLocaleString("cs-CZ")} MioCoinů`
      : wonType === "main"
        ? (contestPrize?.main_prize ?? ticket?.won_prize ?? "Hlavní výhra")
        : (bonusPrize?.title ?? bonusPrize?.description ?? ticket?.won_prize ?? "Bonusová výhra");

  const prizeImage = isMioCoinWin
    ? MIOCOIN_IMAGE_URL
    : wonType === "main"
      ? resolveImage(contestPrize?.main_image)
      : resolveImage(bonusPrize?.image_url);

  const prizeDescription = isMioCoinWin
    ? "Připsané rovnou do tvé peněženky."
    : wonType === "main"
      ? (contestPrize?.description ?? null)
      : (bonusPrize?.detailed_description ?? bonusPrize?.description ?? null);

  const couponImage = resolveImage(coupon?.image_url, "voucher-images");

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        data-testid="mystery-result-dialog"
        className="bg-[hsl(220_25%_8%)] border-[2px] border-[rgba(255,138,0,0.35)] text-white max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto overflow-x-hidden"
      >
        {isWin && (
          <Confetti
            width={width}
            height={height}
            recycle={false}
            numberOfPieces={wonType === "main" ? 520 : 220}
            gravity={wonType === "main" ? 0.18 : 0.32}
            className="pointer-events-none fixed inset-0 z-[60]"
          />
        )}

        <DialogHeader>
          <DialogTitle className="text-center">
            {isWin ? (
              <span className="block">
                <span className="block text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-[#FF8A00] to-[#FFB547] bg-clip-text text-transparent">
                  🎉 GRATULUJEME!
                </span>
                <span className="block text-lg md:text-xl font-extrabold text-white mt-1">
                  VYHRÁL JSI!
                </span>
              </span>
            ) : (
              <span className="block text-xl md:text-2xl font-extrabold text-white">
                Tiket č. {ticket?.ticket_number?.toLocaleString("cs-CZ")}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 min-w-0">
          {/* ── Hlavní sdělení: výhra z tiketu ─────────────────────────── */}
          {isWin && (
            <section data-testid="mystery-result-prize" className="flex flex-col items-center gap-3 text-center">
              {prizeImage && (
                <img
                  src={prizeImage}
                  alt={prizeTitle}
                  data-testid="mystery-result-prize-image"
                  className={
                    isMioCoinWin
                      ? "h-24 w-24 object-contain drop-shadow-[0_0_18px_rgba(255,138,0,0.45)]"
                      : "h-36 w-full max-w-xs rounded-2xl object-cover border border-[rgba(255,138,0,0.3)]"
                  }
                />
              )}
              <p
                data-testid={isMioCoinWin ? "mystery-result-miocoin-amount" : "mystery-result-prize-title"}
                className="text-xl md:text-2xl font-extrabold text-white break-words"
              >
                {prizeTitle}
              </p>
              {prizeDescription && (
                <p className="text-sm text-gray-300 break-words">{prizeDescription}</p>
              )}
            </section>
          )}

          {/* ── Druhý, garantovaný bonus: kupon ────────────────────────── */}
          <section
            data-testid="mystery-coupon-reveal"
            className="rounded-2xl border border-[rgba(255,138,0,0.3)] bg-[rgba(255,138,0,0.06)] p-4 flex flex-col gap-3 min-w-0"
          >
            <p className="text-xs uppercase tracking-wide text-[#FF8A00] font-bold text-center">
              A navíc získáváš kupon
            </p>

            <div className="flex items-start gap-3 min-w-0">
              {couponImage && (
                <img
                  src={couponImage}
                  alt={coupon?.name ?? "Kupon"}
                  data-testid="mystery-coupon-image"
                  className="h-16 w-16 rounded-xl object-cover flex-shrink-0 border border-[rgba(255,138,0,0.25)]"
                />
              )}
              <div className="min-w-0 flex-1">
                <p data-testid="mystery-coupon-name" className="font-bold text-white break-words">
                  {coupon?.name}
                </p>
                {coupon?.partner_name && (
                  <p data-testid="mystery-coupon-partner" className="text-sm text-gray-300 break-words">
                    od {coupon.partner_name}
                  </p>
                )}
              </div>
            </div>

            {coupon?.short_description && (
              <p className="text-sm text-gray-300 break-words">{coupon.short_description}</p>
            )}

            {coupon?.code && (
              <div className="rounded-xl border border-[rgba(255,138,0,0.35)] bg-[hsl(220_25%_6%)] px-3 py-2 flex flex-col gap-2">
                <p className="text-xs uppercase tracking-wide text-[#FF8A00] font-semibold">Tvůj kód</p>
                <p
                  data-testid="mystery-coupon-code"
                  className="text-lg font-extrabold tracking-widest break-all"
                >
                  {coupon.code}
                </p>
                <Button
                  data-testid="mystery-coupon-copy"
                  onClick={handleCopy}
                  variant="outline"
                  className="h-9 rounded-full border-[rgba(255,138,0,0.45)] text-white hover:bg-[rgba(255,138,0,0.12)]"
                >
                  {copied ? (
                    <><Check className="h-4 w-4 mr-2" />Zkopírováno</>
                  ) : (
                    <><Copy className="h-4 w-4 mr-2" />Kopírovat kód</>
                  )}
                </Button>
              </div>
            )}
          </section>

          <p data-testid="mystery-result-storage-note" className="text-xs text-gray-400 text-center break-words">
            Kupon najdeš ve <span className="text-gray-200">Voucherech</span>, tiket máš uložený ve svém účtu.
          </p>

          <Button
            data-testid="mystery-result-continue"
            onClick={onClose}
            variant="premium"
            className="h-11 font-semibold rounded-full w-full"
          >
            Pokračovat
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
