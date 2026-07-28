import { useCallback, useEffect, useState } from "react";
import Confetti from "react-confetti";
import { useWindowSize } from "react-use";
import { supabase } from "@/integrations/supabase/client";
import { MIOCOIN_IMAGE_URL } from "@/components/MioCoin";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Check, Gift } from "lucide-react";
import { toast } from "sonner";
import type { MysteryCoupon } from "@/lib/mysteryCouponPurchase";

/**
 * Jeden výsledek mystery nákupu.
 *
 * Dřív se po nákupu otevřelo odhalení kuponu a po jeho zavření ještě
 * TicketResultModal — zákazník zavíral dvě okna a výhra z tiketu se ztrácela
 * za kuponem. Tady je obojí v jednom výsledku podle důležitosti:
 * nahoře výhra z tiketu jako hlavní sdělení, pod ní kupon jako druhý,
 * garantovaný bonus.
 *
 * Dialog nic nevytváří ani neukládá. Tiket i kupon už v databázi jsou —
 * `purchase_guaranteed_benefit_bundle_atomic` je zapsal v jedné transakci
 * ještě předtím, než se sem cokoli dostalo. „Pokračovat" jen zavírá.
 */

export interface MysteryTicketOutcome {
  ticket_row_id: string | null;
  bonus_prize_id: string | null;
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
  // bonusová z bezpečného veřejného pohledu podle neprůhledného ID, hlavní ze soutěže.
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
          if (!ticket.bonus_prize_id) {
            if (!cancelled) setBonusPrize(null);
            return;
          }
          const { data } = await supabase
            .from("public_bonus_prizes")
            .select("title, description, detailed_description, image_url, amount")
            .eq("contest_id", contestId)
            .eq("id", ticket.bonus_prize_id)
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

  const prizeLabel = isMioCoinWin
    ? "Získané MioCoiny"
    : wonType === "main"
      ? "Hlavní výhra ze soutěže"
      : "Bonusová výhra ze soutěže";

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
        className="bg-[hsl(220_25%_7%)] border-[2px] border-[rgba(255,138,0,0.35)] text-white max-w-2xl w-[calc(100vw-1.5rem)] max-h-[92vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6"
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

        <DialogHeader className="sr-only">
          <DialogTitle>
            {isWin ? `Vyhrál jsi: ${prizeTitle}` : "Tentokrát bez výhry"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 min-w-0">
          {/* ── Hlavní sdělení: výhra z tiketu ─────────────────────────── */}
          <section
            data-testid="mystery-result-prize"
            className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 md:gap-6 items-center min-w-0"
          >
            <div className="text-center md:text-left min-w-0 order-2 md:order-1">
              {isWin ? (
                <>
                  <p className="text-xl sm:text-2xl font-extrabold tracking-wide bg-gradient-to-r from-[#FF8A00] to-[#FFB547] bg-clip-text text-transparent">
                    🎉 GRATULUJEME!
                  </p>
                  <p className="text-3xl sm:text-5xl font-black text-white leading-none mt-1">
                    VYHRÁL JSI!
                  </p>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-gray-400 font-semibold mt-4">
                    {prizeLabel}
                  </p>
                </>
              ) : (
                // Nevýherní tiket není chyba ani prázdná obrazovka: zákazník
                // se dozví, co se stalo, a rovnou i to, co si odnáší.
                <div data-testid="mystery-result-noprize">
                  <p className="text-2xl sm:text-4xl font-black text-white leading-tight tracking-tight">
                    TENTOKRÁT BEZ VÝHRY
                  </p>
                  <p className="text-lg sm:text-xl font-bold text-[#FFB547] mt-2 break-words">
                    Ale odcházíš s garantovaným kuponem.
                  </p>
                  <p className="text-sm text-gray-300 mt-3 break-words">
                    Kupon najdeš ve Voucherech a tvůj tiket zůstává bezpečně uložený v účtu.
                  </p>
                </div>
              )}

              {isWin && (
                <>
                  <p
                    data-testid={isMioCoinWin ? "mystery-result-miocoin-amount" : "mystery-result-prize-title"}
                    className="text-2xl sm:text-3xl font-extrabold text-[#FFB547] mt-2 break-words"
                  >
                    {prizeTitle}
                  </p>
                  {prizeDescription && (
                    <p className="text-sm text-gray-300 mt-2 break-words">{prizeDescription}</p>
                  )}
                </>
              )}
            </div>

            {isWin && prizeImage && (
              <img
                src={prizeImage}
                alt={prizeTitle}
                data-testid="mystery-result-prize-image"
                className={
                  isMioCoinWin
                    ? "order-1 md:order-2 h-28 w-28 mx-auto object-contain drop-shadow-[0_0_24px_rgba(255,138,0,0.5)]"
                    : "order-1 md:order-2 h-40 w-40 sm:h-48 sm:w-48 mx-auto object-contain drop-shadow-[0_0_30px_rgba(255,138,0,0.28)]"
                }
              />
            )}

            {/* Nevýherní stav dostane jemný dárkový medailon, ať pravá strana
                nezůstane prázdná. Ikona je stávající lucide Gift — nic nového. */}
            {!isWin && (
              <span
                data-testid="mystery-result-noprize-icon"
                aria-hidden="true"
                className="order-1 md:order-2 h-24 w-24 sm:h-28 sm:w-28 mx-auto rounded-full bg-[rgba(255,138,0,0.08)] border border-[rgba(255,138,0,0.28)] flex items-center justify-center"
              >
                <Gift className="h-10 w-10 sm:h-12 sm:w-12 text-[#FF8A00]" />
              </span>
            )}
          </section>

          {/* ── Druhý, garantovaný bonus: kupon ────────────────────────── */}
          <div className="flex items-center justify-center gap-2 text-[#FF8A00]">
            <Gift className="h-4 w-4 shrink-0" />
            <p className="text-[11px] sm:text-xs uppercase tracking-[0.18em] font-bold">
              A navíc získáváš kupon
            </p>
          </div>

          {/*
            Kupon má vypadat jako utržený papírový ticket. Výřezy a perforace
            jsou kolečka v barvě pozadí dialogu, posazená na hranu bloku —
            proto `overflow-visible`, jinak by se ořízla. Na desktopu dělí
            ticket svisle, na mobilu vodorovně, a výřezy se přesunou spolu
            s dělicí čárou.
          */}
          <section
            data-testid="mystery-coupon-reveal"
            className="relative rounded-2xl bg-[#FCF3E4] text-[hsl(220_25%_12%)] grid grid-cols-1 sm:grid-cols-[1fr_auto] min-w-0"
          >
            {/* Velké polokruhové výřezy uprostřed levé a pravé hrany. */}
            <span
              data-testid="mystery-coupon-notch-left"
              aria-hidden="true"
              className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 h-7 w-7 sm:h-9 sm:w-9 rounded-full bg-[hsl(220_25%_7%)]"
            />
            <span
              data-testid="mystery-coupon-notch-right"
              aria-hidden="true"
              className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 h-7 w-7 sm:h-9 sm:w-9 rounded-full bg-[hsl(220_25%_7%)]"
            />

            {/*
              Drobná pravidelná perforace po celé délce obou bočních hran.
              Půlkolečka v barvě pozadí dialogu — na tmavém podkladu jsou
              vidět jako skutečné vykousnutí papíru.
            */}
            <span
              data-testid="mystery-coupon-edge-left"
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-3 left-0 w-[7px] -translate-x-1/2"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 50% 50%, hsl(220 25% 7%) 3.2px, transparent 3.6px)",
                backgroundSize: "7px 15px",
                backgroundRepeat: "repeat-y",
              }}
            />
            <span
              data-testid="mystery-coupon-edge-right"
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-3 right-0 w-[7px] translate-x-1/2"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 50% 50%, hsl(220 25% 7%) 3.2px, transparent 3.6px)",
                backgroundSize: "7px 15px",
                backgroundRepeat: "repeat-y",
              }}
            />

            <div className="flex items-center gap-4 p-4 sm:pl-6 min-w-0">
              {couponImage && (
                <img
                  src={couponImage}
                  alt={coupon?.name ?? "Kupon"}
                  data-testid="mystery-coupon-image"
                  className="h-16 w-16 sm:h-20 sm:w-20 rounded-full object-contain bg-white flex-shrink-0 border border-black/10 p-2"
                />
              )}
              <div className="min-w-0 flex-1">
                <p data-testid="mystery-coupon-name" className="text-lg sm:text-xl font-extrabold break-words leading-tight">
                  {coupon?.name}
                </p>
                {coupon?.partner_name && (
                  <p data-testid="mystery-coupon-partner" className="text-sm font-semibold text-black/70 break-words">
                    {coupon.partner_name}
                  </p>
                )}
                {coupon?.short_description && (
                  <p className="text-xs text-black/60 mt-1 break-words">{coupon.short_description}</p>
                )}
              </div>
            </div>

            {coupon?.code && (
              <div
                data-testid="mystery-coupon-perforation"
                className="relative flex flex-col items-center justify-center gap-1 p-4 sm:pr-6 text-center border-t-[3px] border-dashed border-black/35 sm:border-t-0 sm:border-l-[3px] sm:min-w-[13rem] min-w-0"
              >
                {/*
                  Kruhové zakončení perforace. Na desktopu je čára svislá, takže
                  výřezy patří na její horní a dolní konec; na mobilu je čára
                  vodorovná a výřezy jdou na levý a pravý konec.
                */}
                <span
                  data-testid="mystery-coupon-perf-cap-start"
                  aria-hidden="true"
                  className="absolute -top-3.5 -left-3.5 h-7 w-7 rounded-full bg-[hsl(220_25%_7%)]"
                />
                <span
                  data-testid="mystery-coupon-perf-cap-mobile-end"
                  aria-hidden="true"
                  className="absolute -top-3.5 -right-3.5 h-7 w-7 rounded-full bg-[hsl(220_25%_7%)] sm:hidden"
                />
                <span
                  data-testid="mystery-coupon-perf-cap-desktop-end"
                  aria-hidden="true"
                  className="hidden sm:block absolute -bottom-3.5 -left-3.5 h-7 w-7 rounded-full bg-[hsl(220_25%_7%)]"
                />

                <p className="text-[10px] uppercase tracking-[0.18em] text-[#C26A00] font-bold">
                  Tvůj kód
                </p>
                <p
                  data-testid="mystery-coupon-code"
                  className="text-lg sm:text-xl font-extrabold break-all leading-tight max-w-full"
                >
                  {coupon.code}
                </p>
                <button
                  type="button"
                  data-testid="mystery-coupon-copy"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C26A00] hover:text-[#FF8A00] transition-colors mt-1"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Zkopírováno" : "Kopírovat kód"}
                </button>
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
            className="h-12 font-bold rounded-full w-full text-base"
          >
            Pokračovat
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
