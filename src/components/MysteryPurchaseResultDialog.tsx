import { useCallback, useEffect, useState } from "react";
import Confetti from "react-confetti";
import { useWindowSize } from "react-use";
import { supabase } from "@/integrations/supabase/client";
import { MIOCOIN_IMAGE_URL } from "@/components/MioCoin";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Check, Gift, Calendar, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { MysteryCoupon } from "@/lib/mysteryCouponPurchase";
import { ResultTicket } from "@/components/brand/ResultTicket";
import { MioBadge } from "@/components/brand/MioBadge";
import avatarSmile from "@/assets/redesign/avatar/face-jisty.png";
import faceExcited from "@/assets/redesign/avatar/face-nadseny.png";
import avatarJoy from "@/assets/redesign/avatar/avatar-mava.png";
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
  const [contestTitle, setContestTitle] = useState<string | null>(null);

  const wonType = ticket?.won_type ?? null;

  // Název soutěže na tiketu (veřejný údaj); číslo tiketu se nikdy neukazuje.
  useEffect(() => {
    if (!open || !contestId) {
      setContestTitle(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from("contests")
      .select("title")
      .eq("id", contestId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setContestTitle((data as { title?: string | null } | null)?.title ?? null);
      });
    return () => { cancelled = true; };
  }, [open, contestId]);
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
        className={`om-rd ${wonType === "bonus" ? "om-rd-bonus" : wonType === "main" ? "om-rd-main" : ""} max-w-[480px] w-[calc(100vw-1.5rem)] max-h-[92vh] overflow-y-auto overflow-x-hidden p-5 sm:p-6 [&>button]:right-4 [&>button]:top-4 [&>button]:z-20`}
      >
        {isWin && (
          <Confetti
            width={width}
            height={height}
            recycle={false}
            numberOfPieces={wonType === "main" ? 520 : 220}
            gravity={wonType === "main" ? 0.18 : 0.32}
            colors={["#FFE29A", "#E9B949", "#C2902F", "#B5122B", "#FF6B80", "#ECEDEF"]}
            className="pointer-events-none fixed inset-0 z-[60]"
          />
        )}

        <DialogHeader className="sr-only">
          <DialogTitle>
            {isWin ? `Vyhrál jsi: ${prizeTitle}` : "Tentokrát bez výhry"}
          </DialogTitle>
        </DialogHeader>

        {/* Hlavní výhra: zlaté paprsky za tiketem (deska Momenty, krok 3). */}
        {wonType === "main" && <span aria-hidden="true" className="om-rd-rays" />}

        <div className="relative flex flex-col gap-4 min-w-0">
          {/* ── Tiket: černý bez výhry, zlatý při výhře; nikdy s číslem ── */}
          <div className="pt-10 px-3">
            {isWin ? (
              <ResultTicket
                variant="gold"
                label="VÝHERNÍ TIKET"
                word={wonType === "main" ? "Hlavní výhra" : "Bonus"}
                contestTitle={contestTitle}
                seal={
                  wonType === "main"
                    ? "emblem"
                    : isMioCoinWin
                      ? { top: `+${miocoinAmount.toLocaleString("cs-CZ")}`, bottom: "MIO" }
                      : null
                }
              />
            ) : (
              <ResultTicket variant="black" label="SOUTĚŽNÍ TIKET" word="Tiket" contestTitle={contestTitle} />
            )}
          </div>

          {/* ── Avatar podle momentu ── */}
          {!isWin ? (
            <div data-testid="mystery-result-noprize-icon" aria-hidden="true" className="om-rd-avatar">
              <img src={avatarSmile} alt="" />
            </div>
          ) : wonType === "main" ? (
            <img src={avatarJoy} alt="" aria-hidden="true" className="om-rd-avatar-big" />
          ) : (
            <div aria-hidden="true" className="om-rd-avatar" style={{ width: 96, height: 96, boxShadow: "0 0 0 2px #E9B949" }}>
              <img src={faceExcited} alt="" />
            </div>
          )}

          {/* ── Hlavní sdělení: výhra z tiketu ─────────────────────────── */}
          <section data-testid="mystery-result-prize" className="om-rd-up text-center min-w-0">
            {isWin ? (
              <>
                <p className="om-rd-eyebrow">Gratulujeme – VYHRÁL JSI!</p>
                <p className={`om-rd-head mt-1.5 ${wonType === "main" ? "om-rd-head-gold" : ""}`}>
                  {wonType === "main" ? "Hlavní výhra je tvoje!" : "Bonus je tvůj!"}
                </p>
                <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-[#A9AAB3]">{prizeLabel}</p>
                <div className="mt-1.5 flex items-center justify-center gap-3 min-w-0">
                  {isMioCoinWin ? (
                    // MIO se ukazuje vždy jako korunkový odznak (pravidlo redesignu).
                    <span data-testid="mystery-result-prize-badge" className="shrink-0">
                      <MioBadge width={58} />
                    </span>
                  ) : prizeImage && (
                    <img
                      src={prizeImage}
                      alt={prizeTitle}
                      data-testid="mystery-result-prize-image"
                      className="h-20 w-20 shrink-0 rounded-xl bg-white/5 object-contain p-1"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  )}
                  <p
                    data-testid={isMioCoinWin ? "mystery-result-miocoin-amount" : "mystery-result-prize-title"}
                    className="om-rd-prize break-words text-left"
                  >
                    {prizeTitle}
                  </p>
                </div>
                {prizeDescription && (
                  <p className="om-rd-sub mt-2 break-words">
                    {wonType === "main" ? `${prizeDescription}` : prizeDescription}
                  </p>
                )}
                {wonType === "main" && (
                  <p className="om-rd-sub mt-2">Ozveme se ti kvůli předání výhry.</p>
                )}
              </>
            ) : (
              // Nevýherní tiket není chyba ani prázdná obrazovka: zákazník
              // se dozví, co se stalo, a rovnou i to, co si odnáší.
              <div data-testid="mystery-result-noprize">
                <p className="om-rd-head">TENTOKRÁT BEZ VÝHRY</p>
                <p className="mt-1.5 text-base font-extrabold text-[#F6D77A]">Ale jsi stále ve hře!</p>
                <p className="om-rd-sub mt-1">„Nevadí – každý tiket je nová šance.“</p>
                <p className="om-rd-note mt-2 break-words">
                  Voucher najdeš ve Voucherech a tvůj ticket zůstává bezpečně uložený v účtu.
                </p>
              </div>
            )}
          </section>

          {/* ── Druhý, garantovaný bonus: kupon — má vlastní, opožděný reveal,
                aby to působilo jako druhá odměna odhalená až po hlavním výsledku ── */}
          <div className="flex items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-700 [animation-delay:450ms] fill-mode-both">
            <Gift className="h-4 w-4 shrink-0 text-[#E9B949]" />
            <p className="text-[11px] sm:text-xs uppercase tracking-[0.18em] font-bold text-[#F2C55C]">
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
            className="relative w-full rounded-xl overflow-hidden text-[#111827] drop-shadow-[0_16px_28px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-bottom-4 zoom-in-95 spin-in-[6deg] duration-[900ms] [animation-delay:550ms] fill-mode-both"
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
              className="om-rd-panel min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-700 [animation-delay:650ms] fill-mode-both"
            >
              <div className="grid grid-cols-[3rem_minmax(0,1fr)] sm:grid-cols-[3.25rem_minmax(0,1fr)_5.5rem] items-center gap-3 min-w-0">
                <span className="h-12 w-12 sm:h-[52px] sm:w-[52px] rounded-full bg-gradient-to-b from-[#FFE29A] via-[#E9B949] to-[#C2902F] flex items-center justify-center shadow-[0_8px_18px_rgba(194,144,47,0.35)]">
                  <Calendar className="h-6 w-6 text-[#1A1205]" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-extrabold text-[#ECEDEF] leading-tight break-words">
                    Další výherní ticket čeká už za{" "}
                    <span
                      data-testid="mystery-result-next-win-distance"
                      className="text-[#F6D77A]"
                    >
                      {distance.toLocaleString("cs-CZ")} {tahPlural(distance)}
                    </span>
                    .
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-[#A9AAB3] mt-1 break-words">
                    Může obsahovat MIO, bonusovou cenu nebo hlavní výhru.
                  </p>
                </div>
                <p className="hidden sm:block rotate-[-8deg] text-center text-[11px] italic font-bold leading-tight text-[#F2C55C]">
                  Jsi blíž<br />než si myslíš!
                </p>
              </div>

              {showNextWinStepper && (
                <div
                  data-testid="mystery-result-next-win-stepper"
                  aria-hidden="true"
                  className="relative mt-3 grid grid-cols-5 items-center px-2 sm:ml-[3.8rem] sm:mr-[5.8rem]"
                >
                  <span className="absolute left-[10%] right-[10%] top-1/2 h-[2px] -translate-y-1/2 bg-white/15" />
                  <span
                    className="absolute left-[10%] top-1/2 h-[2px] -translate-y-1/2 bg-[#C2902F]"
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
                            ? "bg-[#C2902F] text-white shadow-[0_4px_10px_rgba(194,144,47,0.25)]"
                            : current
                              ? "border border-[#E9B949] bg-[#17171B] text-[#F6D77A]"
                              : "border border-white/15 bg-white/5 text-[#8E8F98]"
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

          <p data-testid="mystery-result-storage-note" className="om-rd-note break-words animate-in fade-in duration-700 [animation-delay:700ms] fill-mode-both">
            Voucher najdeš ve <b>Voucherech</b>, ticket máš uložený ve svém účtu.
          </p>

          <button
            type="button"
            data-testid="mystery-result-continue"
            onClick={onClose}
            className="om-rd-gold animate-in fade-in slide-in-from-bottom-2 duration-700 [animation-delay:750ms] fill-mode-both"
          >
            Pokračovat <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
