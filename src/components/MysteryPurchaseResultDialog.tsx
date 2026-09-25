import { useCallback, useEffect, useState } from "react";
import Confetti from "react-confetti";
import { useWindowSize } from "react-use";
import { supabase } from "@/integrations/supabase/client";
import { MIOCOIN_IMAGE_URL } from "@/components/MioCoin";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Check, Gift, Calendar, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { MysteryCoupon } from "@/lib/mysteryCouponPurchase";
import auroraIdle from "@/assets/aurora-idle.jpg";
import auroraWinVideo from "@/assets/aurora-win.mp4";
import auroraWinPoster from "@/assets/aurora-win-poster.jpg";
import logoOnemil from "@/assets/logo-onemil.png";
import voucherTicket from "@/assets/mystery-voucher-ticket.jpg";

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
    ? "Získaná MIO"
    : wonType === "main"
      ? "Hlavní výhra ze soutěže"
      : "Bonusová výhra ze soutěže";

  const prizeTitle =
    isMioCoinWin
      ? `${miocoinAmount.toLocaleString("cs-CZ")} MIO`
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
  const completedPreviewSteps = showNextWin ? Math.min(Math.trunc(distance), 4) : 0;
  const showNextWinStepper = showNextWin && distance <= 4;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        data-testid="mystery-result-dialog"
        className="bg-[#FFF9F0] border border-[#F4D6AD] text-[#111827] shadow-[0_28px_80px_rgba(81,49,10,0.24)] max-w-[632px] w-[calc(100vw-1.5rem)] max-h-[92vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6 sm:rounded-[10px] [&>button]:right-4 [&>button]:top-4 [&>button]:text-[#94A3B8] [&>button]:hover:text-[#111827]"
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

        {/* ── Reveal hero — same Aurora Ignition footage as TicketResultModal;
             pure visual backdrop, no text (headline below already carries it
             and has its own tested data-testid markup, kept untouched). ── */}
        <div className="relative -mx-4 -mt-4 h-40 w-[calc(100%+2rem)] animate-in fade-in zoom-in-95 duration-500 overflow-hidden rounded-t-[10px] bg-[#FFF9F0] sm:-mx-6 sm:-mt-6 sm:h-48 sm:w-[calc(100%+3rem)]">
          <img
            src={logoOnemil}
            alt="OneMil"
            className="absolute left-4 top-4 z-10 h-6 w-auto object-contain drop-shadow-[0_1px_4px_rgba(255,255,255,0.9)] sm:h-7"
          />
          {isWin ? (
            <video
              key={`aurora-mystery-${contestId}-${ticket?.ticket_number}`}
              src={auroraWinVideo}
              poster={auroraWinPoster}
              autoPlay
              muted
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <img
              src={auroraIdle}
              alt=""
              className="absolute inset-0 h-full w-full animate-[pulse_3.4s_ease-in-out_infinite] object-cover"
            />
          )}
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#FFF9F0] to-transparent" />
        </div>

        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_10%,rgba(255,181,71,0.18),transparent_23%),radial-gradient(circle_at_10%_88%,rgba(255,138,0,0.11),transparent_26%)]"
        />

        <div className="relative flex flex-col gap-4 min-w-0">
          {/* ── Hlavní sdělení: výhra z tiketu ─────────────────────────── */}
          <section
            data-testid="mystery-result-prize"
            className="grid grid-cols-[minmax(0,1fr)_7rem] sm:grid-cols-[minmax(0,1fr)_10rem] gap-2 sm:gap-4 items-center min-w-0 animate-in fade-in slide-in-from-bottom-3 duration-700 [animation-delay:150ms] fill-mode-both"
          >
            <div className="text-left min-w-0">
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
                  <p className="font-heading text-[clamp(1.15rem,4.3vw,2.1rem)] font-black text-[#111827] leading-[1.08] tracking-tight min-[480px]:whitespace-nowrap">
                    TENTOKRÁT <span className="text-[#F97316]">BEZ VÝHRY</span>
                  </p>
                  <p className="font-heading text-base sm:text-lg font-black text-[#111827] mt-1 break-words">
                    Ale jsi stále ve hře!
                  </p>
                  <p className="text-[11px] sm:text-xs text-[#6B7280] mt-2 max-w-[24rem] break-words">
                    Voucher najdeš ve Voucherech a tvůj ticket zůstává bezpečně uložený v účtu.
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

            {/* Dárková krabička podle schváleného návrhu. Originální logo
                zůstává beze změny a je vložené na přední stranu dárku. */}
            {!isWin && (
              <div
                data-testid="mystery-result-noprize-icon"
                aria-hidden="true"
                className="relative h-[94px] sm:h-[108px] w-full"
              >
                <span className="absolute left-1 sm:left-3 top-4 sm:top-5 h-[70px] w-[68px] sm:h-[80px] sm:w-[78px] rotate-[8deg] rounded-md border border-[#F0C58D] bg-gradient-to-br from-white via-[#FFF9F0] to-[#FFE8C6] shadow-[0_12px_24px_rgba(180,94,8,0.22)]">
                  <span className="absolute inset-x-0 top-0 h-3 rounded-t-md bg-gradient-to-r from-[#FFB547] via-[#F97316] to-[#FFB547]" />
                  <span className="absolute left-1/2 top-0 h-full w-2 -translate-x-1/2 bg-gradient-to-b from-[#FFB547] to-[#F97316]" />
                  <span className="absolute -top-4 left-1/2 h-7 w-9 -translate-x-1/2 rounded-[50%] border-[5px] border-[#F97316]" />
                  <span className="absolute left-1/2 top-7 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-white/95 shadow-sm">
                    <img src={couponImage ?? "/apple-touch-icon.png"} alt="" className="h-7 w-7 rounded-full object-contain" />
                  </span>
                </span>
                <span className="absolute right-0 sm:right-1 top-10 sm:top-12 rotate-[-8deg] text-[9px] sm:text-[11px] italic font-bold leading-tight text-[#F97316]">
                  Více zážitků<br />z každého<br />nákupu
                </span>
                <span className="absolute left-0 top-2 text-[#F97316] text-xs">✦</span>
                <span className="absolute right-4 top-1 text-[#FFB547] text-sm">✦</span>
              </div>
            )}
          </section>

          {/* ── Druhý, garantovaný bonus: kupon — má vlastní, opožděný reveal,
                aby to působilo jako druhá odměna odhalená až po hlavním výsledku ── */}
          <div className="flex items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-700 [animation-delay:450ms] fill-mode-both">
            <Gift className="h-4 w-4 shrink-0 text-[#F97316]" />
            <p className="text-[11px] sm:text-xs uppercase tracking-[0.18em] font-bold text-[#334155]">
              A navíc získáváš voucher
            </p>
          </div>

          {/*
            Kupon JE fyzický ticket — vygenerovaný Higgsfield objekt (prémiový
            papír, ražba, fóliová hrana, perforovaný oddíl útržku) tvoří celý
            tvar a materiál bloku, žádná bílá karta kolem něj. Živá data se
            pokládají jako HTML vrstva přímo na jeho povrch. Poměr stran musí
            přesně odpovídat zdrojovému obrázku, jinak by se textové zóny
            rozjely od natištěných panelů.
          */}
          <section
            data-testid="mystery-coupon-reveal"
            className="relative w-full rounded-xl overflow-hidden text-[#111827] drop-shadow-[0_16px_28px_rgba(91,57,16,0.28)] animate-in fade-in slide-in-from-bottom-4 zoom-in-95 spin-in-[6deg] duration-[900ms] [animation-delay:550ms] fill-mode-both"
            style={{ aspectRatio: "2688 / 1152" }}
          >
            {/* Samotný ticket — nosný vizuální objekt, ne pozadí karty. */}
            <img
              src={voucherTicket}
              alt=""
              className="block h-full w-full object-cover"
            />

            {/* Jemný jednorázový světelný přejezd po fóliové hraně — imituje
                záblesk kovového detailu při usazení ticketu na místo. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 mix-blend-overlay opacity-80 animate-[golden-shimmer_1.3s_ease-out_1] [animation-delay:900ms] fill-mode-both"
              style={{
                backgroundImage:
                  "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.8) 48%, rgba(255,196,110,0.6) 52%, transparent 65%)",
                backgroundSize: "260% 100%",
              }}
            />

            {/* Hlavní tělo ticketu — název, partner, popis. Pozice odpovídá
                levému ~72% panelu vygenerovaného obrázku. */}
            <div
              className="absolute flex flex-col justify-center gap-1 sm:gap-1.5 overflow-hidden"
              style={{ left: "5%", right: "34%", top: "10%", bottom: "10%" }}
            >
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                {couponImage && (
                  <img
                    src={couponImage}
                    alt=""
                    data-testid="mystery-coupon-image"
                    className="h-4 w-4 sm:h-6 sm:w-6 rounded-full object-contain bg-white/70 flex-shrink-0 border border-[#E9D8B8] p-0.5"
                  />
                )}
                <p
                  data-testid="mystery-coupon-name"
                  className="font-heading text-[12px] sm:text-xl font-extrabold text-[#1C1A14] leading-[1.15] tracking-[-0.01em] break-words line-clamp-2"
                >
                  {coupon?.name}
                </p>
              </div>
              {coupon?.partner_name && (
                <p data-testid="mystery-coupon-partner" className="font-heading text-[8px] sm:text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9A7A42] break-words line-clamp-1">
                  {coupon.partner_name}
                </p>
              )}
              {coupon?.short_description && (
                <p className="font-sans text-[8px] sm:text-xs font-normal leading-relaxed text-[#5B5648]/80 break-words line-clamp-1 sm:line-clamp-2">
                  {coupon.short_description}
                </p>
              )}
            </div>

            {/* Útržek ticketu — kód a kopírování. Pozice odpovídá pravému
                ~28% panelu za perforovanou dělicí čárou. */}
            <div
              className="absolute flex flex-col items-center justify-center gap-0.5 sm:gap-1 text-center"
              style={{ left: "76%", right: "4%", top: "10%", bottom: "10%" }}
            >
              {coupon?.code && (
                <>
                <p className="font-sans text-[6.5px] sm:text-[9px] font-semibold uppercase tracking-[0.22em] sm:tracking-[0.26em] text-[#B07A2E]">
                  Tvůj kód
                </p>
                <p
                  data-testid="mystery-coupon-code"
                  className="font-heading text-[9px] sm:text-[15px] font-bold tracking-[0.02em] text-[#2B2A24] break-all leading-snug max-w-full px-0.5 mt-0.5 sm:mt-1"
                >
                  {coupon.code}
                </p>
                <button
                  type="button"
                  data-testid="mystery-coupon-copy"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 rounded-full border border-[#D9A85C]/70 bg-white/70 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[6.5px] sm:text-[10.5px] font-medium tracking-[0.02em] text-[#9A6B24] hover:bg-white hover:border-[#D9A85C] transition-colors mt-1 sm:mt-1.5 whitespace-nowrap"
                >
                  {copied ? <Check className="h-2 w-2 sm:h-3 sm:w-3" /> : <Copy className="h-2 w-2 sm:h-3 sm:w-3" />}
                  <span className="hidden sm:inline">{copied ? "Zkopírováno" : "Kopírovat kód"}</span>
                  <span className="sm:hidden">{copied ? "OK" : "Kopírovat"}</span>
                </button>
                </>
              )}
            </div>
          </section>

          {/* ── Výrazný postup k dalšímu výhernímu tiketu ─────────────── */}
          {showNextWin && (
            <section
              data-testid="mystery-result-next-win"
              className="rounded-2xl border border-[#FFD69E] bg-white/75 px-3 py-3 sm:px-4 sm:py-3 shadow-[0_12px_30px_rgba(249,115,22,0.12)] min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-700 [animation-delay:650ms] fill-mode-both"
            >
              <div className="grid grid-cols-[3rem_minmax(0,1fr)] sm:grid-cols-[3.25rem_minmax(0,1fr)_5.5rem] items-center gap-3 min-w-0">
                <span className="h-12 w-12 sm:h-[52px] sm:w-[52px] rounded-full bg-gradient-to-br from-[#FF9B22] to-[#C85D00] flex items-center justify-center shadow-[0_9px_22px_rgba(201,93,0,0.34)]">
                  <Calendar className="h-6 w-6 text-white" />
                </span>
                <div className="min-w-0">
                  <p className="font-heading text-xs sm:text-sm font-black text-[#111827] leading-tight break-words">
                    Další výherní ticket čeká už za{" "}
                    <span
                      data-testid="mystery-result-next-win-distance"
                      className="text-[#F97316]"
                    >
                      {distance.toLocaleString("cs-CZ")} {tahPlural(distance)}
                    </span>
                    .
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-[#94A3B8] mt-1 break-words">
                    Může obsahovat MIO, bonusovou cenu nebo hlavní výhru.
                  </p>
                </div>
                <p className="hidden sm:block rotate-[-8deg] text-center text-[11px] italic font-bold leading-tight text-[#F97316]">
                  Jsi blíž<br />než si myslíš!
                </p>
              </div>

              {showNextWinStepper && (
                <div
                  data-testid="mystery-result-next-win-stepper"
                  aria-hidden="true"
                  className="relative mt-3 grid grid-cols-5 items-center px-2 sm:ml-[3.8rem] sm:mr-[5.8rem]"
                >
                  <span className="absolute left-[10%] right-[10%] top-1/2 h-[2px] -translate-y-1/2 bg-[#F1E3D2]" />
                  <span
                    className="absolute left-[10%] top-1/2 h-[2px] -translate-y-1/2 bg-[#FF8A00]"
                    style={{ width: `${completedPreviewSteps * 20}%` }}
                  />
                  {Array.from({ length: 5 }, (_, index) => {
                    const step = index + 1;
                    const completed = index < completedPreviewSteps;
                    const current = index === completedPreviewSteps;
                    return (
                      <span
                        key={step}
                        className={`relative z-10 mx-auto flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                          completed
                            ? "bg-[#FF8A00] text-white shadow-[0_4px_10px_rgba(249,115,22,0.25)]"
                            : current
                              ? "border border-[#FFB35C] bg-white text-[#F97316]"
                              : "border border-[#E8DED2] bg-[#FAF8F5] text-[#C9C0B7]"
                        }`}
                      >
                        {completed ? <Check className="h-3 w-3" /> : step}
                      </span>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          <p data-testid="mystery-result-storage-note" className="text-xs text-[#6B7280] text-center break-words animate-in fade-in duration-700 [animation-delay:700ms] fill-mode-both">
            Voucher najdeš ve <span className="font-semibold text-[#374151]">Voucherech</span>, ticket máš uložený ve svém účtu.
          </p>

          <Button
            data-testid="mystery-result-continue"
            onClick={onClose}
            className="h-11 font-heading font-bold rounded-full w-full text-base animate-in fade-in slide-in-from-bottom-2 duration-700 [animation-delay:750ms] fill-mode-both bg-gradient-to-b from-[#F6A63A] via-[#E47B0A] to-[#C35A00] text-white shadow-[0_8px_20px_rgba(180,82,0,0.3)] hover:brightness-105"
          >
            Pokračovat <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
