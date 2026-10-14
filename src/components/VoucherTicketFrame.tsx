import type { ReactNode } from "react";
import voucherTicket from "@/assets/mystery-voucher-ticket.jpg";

/**
 * Sdílený vizuální rámec schváleného ticket/voucher objektu (Higgsfield asset
 * `mystery-voucher-ticket.jpg`) — stejný tvar, materiál, poměr stran, reveal
 * animace (přiletí → 3D natočení → usazení → světelný přejezd) a typografie
 * napříč všemi výsledkovými stavy. Obsah (`main` / `stub`) je na volajícím,
 * tvar a materiál zůstávají vždy identické — žádná nová grafika se negeneruje.
 */

interface VoucherTicketFrameProps {
  main: ReactNode;
  stub?: ReactNode;
  testId?: string;
  animationDelayMs?: number;
  className?: string;
}

export function VoucherTicketFrame({
  main,
  stub,
  testId,
  animationDelayMs = 150,
  className,
}: VoucherTicketFrameProps) {
  return (
    <section
      data-testid={testId}
      className={`relative w-full rounded-xl overflow-hidden text-[#111827] drop-shadow-[0_16px_28px_rgba(91,57,16,0.28)] animate-in fade-in slide-in-from-bottom-4 zoom-in-95 spin-in-[6deg] duration-[900ms] fill-mode-both${className ? ` ${className}` : ""}`}
      style={{ aspectRatio: "2688 / 1152", animationDelay: `${animationDelayMs}ms` }}
    >
      {/* Samotný ticket — nosný vizuální objekt, ne pozadí karty. */}
      <img src={voucherTicket} alt="" className="block h-full w-full object-cover" />

      {/* Jemný jednorázový světelný přejezd po fóliové hraně. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 mix-blend-overlay opacity-80 animate-[golden-shimmer_1.3s_ease-out_1] fill-mode-both"
        style={{
          backgroundImage:
            "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.8) 48%, rgba(255,196,110,0.6) 52%, transparent 65%)",
          backgroundSize: "260% 100%",
          animationDelay: `${animationDelayMs + 350}ms`,
        }}
      />

      {/* Hlavní tělo ticketu — odpovídá levému ~72% panelu obrázku. */}
      <div
        className="absolute flex flex-col justify-center gap-1 sm:gap-1.5 overflow-hidden"
        style={{ left: "5%", right: "34%", top: "10%", bottom: "10%" }}
      >
        {main}
      </div>

      {/* Útržek ticketu — odpovídá pravému ~28% panelu za perforací. */}
      {stub && (
        <div
          className="absolute flex flex-col items-center justify-center gap-0.5 sm:gap-1 text-center overflow-hidden"
          style={{ left: "76%", right: "4%", top: "10%", bottom: "10%" }}
        >
          {stub}
        </div>
      )}
    </section>
  );
}

/** Sdílené typografické třídy schváleného stylu — Poppins pro headline, Inter pro tělo textu. */
export const voucherTicketText = {
  eyebrow:
    "font-heading text-[8px] sm:text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9A7A42] break-words line-clamp-1",
  title:
    "font-heading text-[12px] sm:text-xl font-extrabold text-[#1C1A14] leading-[1.15] tracking-[-0.01em] break-words line-clamp-2",
  description:
    "font-sans text-[8px] sm:text-xs font-normal leading-relaxed text-[#5B5648]/80 break-words line-clamp-1 sm:line-clamp-2",
  stubLabel:
    "font-sans text-[6.5px] sm:text-[9px] font-semibold uppercase tracking-[0.22em] sm:tracking-[0.26em] text-[#B07A2E]",
  stubValue:
    "font-heading text-[9px] sm:text-[15px] font-bold tracking-[0.02em] text-[#2B2A24] break-all leading-snug max-w-full px-0.5 mt-0.5 sm:mt-1",
  stubAction:
    "inline-flex items-center gap-1 rounded-full border border-[#D9A85C]/70 bg-white/70 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[6.5px] sm:text-[10.5px] font-medium tracking-[0.02em] text-[#9A6B24] hover:bg-white hover:border-[#D9A85C] transition-colors mt-1 sm:mt-1.5 whitespace-nowrap",
};
