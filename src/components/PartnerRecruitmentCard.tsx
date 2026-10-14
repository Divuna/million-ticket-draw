import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  OneMilCartIcon,
  OneMilGiftIcon,
  OneMilVoucherIcon,
  OneMilZapIcon,
} from "@/components/icons/OneMilIcons";

/**
 * Partnerská upoutávka na Homepage.
 *
 * Záměrně je to **teaser, ne seznam podmínek** — má jen zaujmout a poslat
 * návštěvníka na stránku partnerství. Detailní podmínky patří tam, ne sem.
 *
 * Pravidla (neměnit):
 * - Žádné zmínky o provizi, placených dobitích, cenách ani o aktivovaných či
 *   použitých MioCoinech. Obchodní podmínky se na Homepage neslibují.
 * - Blok je čistě odkaz na `/partner/register`. Nevolá Stripe, Supabase ani
 *   žádné platby, proto je viditelný i v nativní aplikaci (bez `isNativeApp()`).
 * - Používají se výhradně existující OneMil ikony; žádné nové logo, obrázek
 *   ani cizí grafika. Světelné efekty jsou čisté CSS gradienty.
 */

const PARTNER_TEASERS = [
  { icon: OneMilGiftIcon, text: "Odměna navíc ke každému nákupu" },
  { icon: OneMilVoucherIcon, text: "Vlastní vouchery a nabídky" },
  { icon: OneMilZapIcon, text: "Jednoduché zapojení pro váš obchod" },
] as const;

export const PartnerRecruitmentCard = () => {
  return (
    <Card className="homepage-light-panel homepage-miocoin-panel group relative isolate overflow-hidden rounded-xl border border-[rgba(255,138,0,0.2)] bg-[hsl(220_45%_6%)] shadow-[0_4px_16px_hsl(222_50%_3%/0.5)] h-full">
      {/* Světelné efekty — čisté CSS, bez obrázků */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(255,181,71,0.30),transparent_70%)] blur-2xl transition-opacity duration-700 group-hover:opacity-90 opacity-70"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 -left-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(226,99,5,0.18),transparent_70%)] blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(255,181,71,0.85)] to-transparent"
      />

      <CardContent className="relative z-10 flex h-full flex-col p-4 md:p-5">
        {/* Hlavní sdělení */}
        <div className="space-y-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,138,0,0.28)] bg-[rgba(255,138,0,0.08)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#e26305]">
            <OneMilCartIcon size={14} className="h-3.5 w-3.5" />
            Pro obchody a e-shopy
          </span>

          <h2 className="homepage-premium-orange-heading text-xl md:text-2xl font-bold text-heading-gold">
            Staňte se partnerem OneMil
          </h2>

          <p className="text-xl md:text-2xl md:leading-[1.15] font-extrabold tracking-tight text-foreground">
            Nabídněte zákazníkům víc než ostatní.
          </p>

          <p className="text-xs md:text-sm text-text-silver max-w-[52ch]">
            Proměňte každý nákup v důvod, proč se k vám zákazníci vrátí.
          </p>
        </div>

        {/* Tři výhody — na mobilu pod sebou, od sm vedle sebe */}
        <ul className="mt-4 grid flex-1 content-center grid-cols-1 gap-2 sm:grid-cols-3">
          {PARTNER_TEASERS.map(({ icon: Icon, text }) => (
            <li
              key={text}
              className="homepage-light-tile flex items-center gap-2.5 rounded-xl border border-[rgba(255,138,0,0.18)] bg-[hsl(220_45%_6%)] px-3 py-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(255,138,0,0.42)] hover:shadow-[0_14px_30px_-16px_rgba(226,99,5,0.45)] sm:flex-col sm:items-start sm:gap-1.5"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#FFB547] to-[#FF8A00] shadow-[0_6px_16px_-6px_rgba(226,99,5,0.55)] transition-transform duration-300 group-hover:scale-[1.03]">
                <Icon size={16} className="h-4 w-4 text-black" />
              </span>
              <span className="text-xs font-semibold leading-snug text-foreground">{text}</span>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <div className="mt-4">
          <Button
            asChild
            size="lg"
            className="w-full bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-black font-bold shadow-[0_10px_28px_-10px_rgba(226,99,5,0.6)] transition-all duration-300 hover:from-[#FFB547] hover:to-[#FF8A00] hover:shadow-[0_14px_34px_-10px_rgba(226,99,5,0.7)] hover:-translate-y-0.5"
          >
            <Link to="/partnerstvi">Zjistit více o partnerství</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default PartnerRecruitmentCard;
