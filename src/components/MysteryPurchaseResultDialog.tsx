import { useCallback, useEffect, useState } from "react";
import Confetti from "react-confetti";
import { useWindowSize } from "react-use";
import { supabase } from "@/integrations/supabase/client";
import { MIOCOIN_IMAGE_URL } from "@/components/MioCoin";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Check, Gift, Calendar } from "lucide-react";
import { toast } from "sonner";
import type { MysteryCoupon } from "@/lib/mysteryCouponPurchase";

/**
 * Jeden výsledek mystery nákupu.
 *
 * Dřív se po nákupu otevřelo odhalení kuponu a po jeho zavření ještě
 * TicketResultModal — zákazník zavíral dvě okna a výhra z tiketu se ztrácela
 * za kuponem. Tady je obojí v jednom a v pořadí, které odpovídá hodnotě:
 * nahoře výhra z tiketu jako hlavní sdělení, pod ní kupon jako druhý,
 * garantovaný bonus.
 *
 * Dialog nic nevytváří ani neukládá. Tiket i kupon už v databázi jsou —
 * `purchase_guaranteed_benefit_bundle_atomic` je zapsal v jedné transakci
 * ještě předtím, než se sem cokoli dostalo. „Pokračovat" jen zavírá.
 */

export interface MysteryTicketOutcome {
  ticket_number: number;
  won_type: "bonus" | "main" | null;
  won_prize: string | null;
  /** Kolik tahů zbývá k dalšímu výhernímu tiketu. Null = údaj není známý. */
  distance_to_next_bonus?: number | null;
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

/** 1 tah · 2–4 tahy · jinak tahů. */
function tahPlural(n: number): string {
  if (n === 1) return "tah";
  if (n >= 2 && n <= 4) return "tahy";
  return "tahů";
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

  // Panel se ukáže jen když je vzdálenost opravdu známá a kladná.
  const distance = ticket?.distance_to_next_bonus ?? null;
  const showNextWin = typeof distance === "number" && Number.isFinite(distance) && distance > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        data-testid="mystery-result-dialog"
        className="bg-[#FFF9F0] border border-[#F3D6AE] text-[#111827] shadow-[0_28px_80px_rgba(81,49,10,0.22)] max-w-2xl w-[calc(100vw-1.5rem)] max-h-[92vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6 [&>button]:text-[#6B7280] [&>button]:hover:text-[#111827]"
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
                  <p className="text-3xl sm:text-5xl font-black text-[#111827] leading-none mt-1">
                    VYHRÁL JSI!
                  </p>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#6B7280] font-semibold mt-4">
                    {prizeLabel}
                  </p>
                </>
              ) : (
                // Nevýherní tiket není chyba ani prázdná obrazovka: zákazník
                // se dozví, co se stalo, a rovnou i to, co si odnáší.
                <div data-testid="mystery-result-noprize">
                  <p className="text-2xl sm:text-4xl font-black text-[#111827] leading-tight tracking-tight">
                    TENTOKRÁT BEZ VÝHRY
                  </p>
                  <p className="text-lg sm:text-xl font-bold text-[#F97316] mt-2 break-words">
                    Ale odcházíš s garantovaným kuponem.
                  </p>
                  <p className="text-sm text-[#4B5563] mt-3 break-words">
                    Kupon najdeš ve Voucherech a tvůj tiket zůstává bezpečně uložený v účtu.
                  </p>
                </div>
              )}

              {isWin && (
                <>
                  <p
                    data-testid={isMioCoinWin ? "mystery-result-miocoin-amount" : "mystery-result-prize-title"}
                    className="text-2xl sm:text-3xl font-extrabold text-[#F97316] mt-2 break-words"
                  >
                    {prizeTitle}
                  </p>
                  {prizeDescription && (
                    <p className="text-sm text-[#4B5563] mt-2 break-words">{prizeDescription}</p>
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
                    ? "order-1 md:order-2 h-28 w-28 mx-auto object-contain drop-shadow-[0_12px_22px_rgba(249,115,22,0.28)]"
                    : "order-1 md:order-2 h-40 w-40 sm:h-48 sm:w-48 mx-auto object-contain drop-shadow-[0_16px_26px_rgba(91,57,16,0.2)]"
                }
              />
            )}

            {/* Nevýherní stav dostane jemný dárkový medailon, ať pravá strana
                nezůstane prázdná. Ikona je stávající lucide Gift — nic nového. */}
            {!isWin && (
              <span
                data-testid="mystery-result-noprize-icon"
                aria-hidden="true"
                className="order-1 md:order-2 h-24 w-24 sm:h-28 sm:w-28 mx-auto rounded-full bg-gradient-to-br from-[#FFF2DE] to-[#FFE3BC] border border-[#F4C88C] shadow-[0_14px_32px_rgba(249,115,22,0.14)] flex items-center justify-center"
              >
                <Gift className="h-10 w-10 sm:h-12 sm:w-12 text-[#FF8A00]" />
              </span>
            )}
          </section>

          {/* ── Dominantní informace: kdy padne další výherní tiket ───── */}
          {showNextWin && (
            <section
              data-testid="mystery-result-next-win"
              className="relative overflow-hidden rounded-[1.4rem] border-2 border-[#FF8A00] bg-gradient-to-br from-[#FFF4E3] via-white to-[#FFF0D8] p-4 sm:p-5 shadow-[0_16px_34px_rgba(249,115,22,0.16)] min-w-0"
            >
              <span
                aria-hidden="true"
                className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[#FFB547]/20 blur-2xl"
              />
              <div className="relative flex items-center gap-4 sm:gap-5 min-w-0">
                <span className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-[#FF8A00] flex items-center justify-center flex-shrink-0 shadow-[0_8px_18px_rgba(249,115,22,0.28)]">
                  <Calendar className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-xs font-extrabold uppercase tracking-[0.18em] text-[#C45F00]">
                    Další výherní tiket čeká
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 leading-none text-[#111827]">
                    <span className="text-lg sm:text-xl font-black uppercase">už za{" "}</span>
                    <span
                      data-testid="mystery-result-next-win-distance"
                      className="text-4xl sm:text-5xl font-black text-[#F97316] tabular-nums"
                    >
                      {distance.toLocaleString("cs-CZ")}
                    </span>
                    <span className="text-xl sm:text-2xl font-black uppercase">
                      {" "}{tahPlural(distance)}
                    </span>
                  </p>
                  <p className="text-xs sm:text-sm text-[#4B5563] mt-2 break-words">
                    Může obsahovat MioCoiny, bonusovou cenu nebo hlavní výhru.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* ── Druhý, garantovaný bonus: kupon ────────────────────────── */}
          <div className="flex items-center justify-center gap-2 text-[#D76500]">
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
            className="relative rounded-2xl bg-white text-[#111827] border border-[#F0D7B8] shadow-[0_12px_30px_rgba(91,57,16,0.1)] grid grid-cols-1 sm:grid-cols-[1fr_auto] min-w-0"
          >
            {/* Velké polokruhové výřezy uprostřed levé a pravé hrany. */}
            <span
              data-testid="mystery-coupon-notch-left"
              aria-hidden="true"
              className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 h-7 w-7 sm:h-9 sm:w-9 rounded-full bg-[#FFF9F0]"
            />
            <span
              data-testid="mystery-coupon-notch-right"
              aria-hidden="true"
              className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 h-7 w-7 sm:h-9 sm:w-9 rounded-full bg-[#FFF9F0]"
            />

            {/*
              Drobná pravidelná perforace po celé délce obou bočních hran.
              Půlkolečka v barvě pozadí dialogu vytvoří skutečné vykousnutí
              papírového kuponu i ve světlém OneMil provedení.
            */}
            <span
              data-testid="mystery-coupon-edge-left"
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-3 left-0 w-[7px] -translate-x-1/2"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 50% 50%, #FFF9F0 3.2px, transparent 3.6px)",
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
                  "radial-gradient(circle at 50% 50%, #FFF9F0 3.2px, transparent 3.6px)",
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
                  className="h-16 w-16 sm:h-20 sm:w-20 rounded-full object-contain bg-[#FAFAF9] flex-shrink-0 border border-[#E5E7EB] p-2"
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
                  className="absolute -top-3.5 -left-3.5 h-7 w-7 rounded-full bg-[#FFF9F0]"
                />
                <span
                  data-testid="mystery-coupon-perf-cap-mobile-end"
                  aria-hidden="true"
                  className="absolute -top-3.5 -right-3.5 h-7 w-7 rounded-full bg-[#FFF9F0] sm:hidden"
                />
                <span
                  data-testid="mystery-coupon-perf-cap-desktop-end"
                  aria-hidden="true"
                  className="hidden sm:block absolute -bottom-3.5 -left-3.5 h-7 w-7 rounded-full bg-[#FFF9F0]"
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

          <p data-testid="mystery-result-storage-note" className="text-xs text-[#6B7280] text-center break-words">
            Kupon najdeš ve <span className="font-semibold text-[#374151]">Voucherech</span>, tiket máš uložený ve svém účtu.
          </p>

          <Button
            data-testid="mystery-result-continue"
            onClick={onClose}
            className="h-12 font-bold rounded-full w-full text-base bg-gradient-to-r from-[#F97316] to-[#FF8A00] text-white shadow-[0_10px_24px_rgba(249,115,22,0.24)] hover:from-[#EA650C] hover:to-[#F57C00]"
          >
            Pokračovat
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
