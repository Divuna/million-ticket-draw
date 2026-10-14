import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  OneMilCartIcon,
  OneMilHomeIcon,
  OneMilGiftIcon,
  OneMilProfileIcon,
  OneMilStarIcon,
  OneMilZapIcon,
  OneMilMioCoinIcon,
  OneMilVoucherIcon,
  OneMilTrophyIcon,
  OneMilHeartIcon,
  OneMilTicketIcon,
  OneMilFilterIcon,
} from "@/components/icons/OneMilIcons";

/**
 * Veřejná stránka `/partnerstvi` — přehled možností spolupráce s OneMil.
 *
 * Marketingová vstupní stránka pro firmy, značky, agentury a tvůrce. Odsud
 * vede registrace na `/partner/register`; samotná registrace ani partnerský
 * portál se odsud nemění.
 *
 * Pravidla obsahu (neměnit bez schválení vlastníka):
 * - Žádná procenta, ceny, konkrétní výše provizí ani veřejné detailní
 *   obchodní podmínky. Konkrétní nastavení se domlouvá individuálně.
 * - Zakázané rámování (casino, hazard, jackpot, sázení, kryptoměna) se
 *   nepoužívá; contest se popisuje jako spotřebitelská soutěž o věcné ceny.
 * - Obsah vychází z `ONEMIL_BUSINESS_CONTEXT.md`; neslibovat funkce, které
 *   tam nejsou potvrzené.
 * - Používají se jen existující OneMil ikony a logo v `Header`; žádná nová
 *   grafika ani nový MioCoin symbol.
 */

const AUDIENCES = [
  {
    icon: OneMilCartIcon,
    title: "E-shopy a firmy",
    points: [
      "Odměny zákazníkům za nákup",
      "Podpora opakovaných nákupů a věrnosti",
      "Vlastní kampaně a nabídky",
    ],
  },
  {
    icon: OneMilHomeIcon,
    title: "Kamenné provozovny a služby",
    points: [
      "Zapojení zákazníků přímo v provozovně",
      "Odměnové kódy a promo akce",
      "Propojení nákupu s OneMil",
    ],
  },
  {
    icon: OneMilGiftIcon,
    title: "Značky a dodavatelé produktů",
    points: [
      "Prezentace produktů",
      "Vlastní vouchery a partnerské nabídky",
      "Produkty v kampaních a soutěžích",
    ],
  },
  {
    icon: OneMilProfileIcon,
    title: "Agentury a obchodní partneři",
    points: [
      "Přivádění firem a značek do OneMil",
      "Dlouhodobá správa spolupráce",
      "Přehled výsledků v partnerském systému",
    ],
  },
  {
    icon: OneMilStarIcon,
    title: "Influenceři a tvůrci",
    points: [
      "Vlastní kampaně a komunikační aktivity",
      "Osobní odkazy a kódy",
      "Propojení s partnery a komunitou",
    ],
  },
  {
    icon: OneMilZapIcon,
    title: "Menší a začínající značky",
    points: [
      "Zviditelnění produktů",
      "Zapojení do kampaní a sociálních aktivit",
      "Oslovení nových zákazníků",
    ],
  },
] as const;

const COOPERATION_OPTIONS = [
  { icon: OneMilMioCoinIcon, text: "MioCoiny jako odměna za nákup nebo jinou aktivitu" },
  { icon: OneMilVoucherIcon, text: "Vlastní vouchery" },
  { icon: OneMilGiftIcon, text: "Partnerské nabídky" },
  { icon: OneMilTrophyIcon, text: "Produkty a ceny do soutěží" },
  { icon: OneMilZapIcon, text: "Společné marketingové kampaně" },
  { icon: OneMilHeartIcon, text: "Sociální soutěže a propagace" },
  { icon: OneMilTicketIcon, text: "Podpora sezónních akcí, vybraných produktů a doprodeje" },
  { icon: OneMilFilterIcon, text: "Měřitelný přehled aktivity" },
] as const;

const STEPS = [
  "Vyberete si vhodný způsob spolupráce.",
  "Odešlete registraci firmy.",
  "OneMil registraci zkontroluje a domluví konkrétní nastavení.",
  "Po schválení získáte přístup do partnerského portálu.",
  "V portálu budou postupně dostupné podrobné návody, videa a materiály pro spuštění spolupráce.",
] as const;

const PAGE_TITLE = "Partnerství OneMil | Možnosti spolupráce pro firmy";
const PAGE_DESCRIPTION =
  "Možnosti spolupráce s OneMil pro e-shopy, provozovny, značky, agentury a tvůrce — odměny za nákup, vouchery, partnerské nabídky, kampaně a soutěžní zážitky v jednom systému.";

const PartnerPartnership = () => {
  /**
   * `<Helmet>` je v aplikaci deklarovaný standard, ale react-helmet-async se
   * v současném buildu neprojevuje (stejně se chová i `/kontakt` — jde o
   * pre-existující stav mimo rozsah této stránky). Tenhle efekt proto title
   * a description nastaví přímo a při odchodu vrátí původní hodnoty, aby SPA
   * navigace nenechala stránku s cizím titulkem.
   */
  useEffect(() => {
    const previousTitle = document.title;
    const descriptionTag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = descriptionTag?.content ?? null;

    document.title = PAGE_TITLE;
    descriptionTag?.setAttribute("content", PAGE_DESCRIPTION);

    return () => {
      document.title = previousTitle;
      if (descriptionTag && previousDescription !== null) {
        descriptionTag.setAttribute("content", previousDescription);
      }
    };
  }, []);

  return (
    <div className="homepage-light-page min-h-screen bg-background pb-20">
      <Helmet>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
      </Helmet>

      <Header />

      <main className="homepage-light-content container mx-auto px-4 py-10 md:py-14 space-y-12 md:space-y-16">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative isolate overflow-hidden rounded-2xl">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(255,181,71,0.28),transparent_70%)] blur-2xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(226,99,5,0.16),transparent_70%)] blur-2xl"
          />

          <div className="relative z-10 mx-auto max-w-3xl space-y-5 py-8 text-center md:py-12">
            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,138,0,0.28)] bg-[rgba(255,138,0,0.08)] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#e26305]">
              Partnerství OneMil
            </span>

            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground md:text-5xl md:leading-[1.1]">
              Více hodnoty pro vaše zákazníky.
              <br className="hidden sm:block" /> Více možností pro vaši značku.
            </h1>

            <p className="mx-auto max-w-2xl text-base text-text-silver md:text-lg">
              OneMil propojuje odměny za nákup, vouchery, partnerské nabídky, kampaně a soutěžní
              zážitky do jednoho přehledného systému.
            </p>

            <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="w-full bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-black font-bold shadow-[0_10px_28px_-10px_rgba(226,99,5,0.6)] transition-all duration-300 hover:from-[#FFB547] hover:to-[#FF8A00] hover:-translate-y-0.5 sm:w-auto"
              >
                <Link to="/partner/register">Registrovat firmu</Link>
              </Button>

              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full border-[rgba(255,138,0,0.35)] font-semibold text-foreground transition-all duration-300 hover:border-[rgba(255,138,0,0.6)] hover:bg-[rgba(255,138,0,0.06)] sm:w-auto"
              >
                <a href="#moznosti-spoluprace">Prohlédnout možnosti spolupráce</a>
              </Button>
            </div>
          </div>
        </section>

        {/* ── Pro koho je partnerství určené ───────────────────────────── */}
        <section className="space-y-6">
          <div className="space-y-2 text-center">
            <h2 className="homepage-premium-orange-heading text-2xl font-bold md:text-3xl">
              Pro koho je partnerství určené
            </h2>
            <p className="mx-auto max-w-2xl text-sm text-text-silver md:text-base">
              Spolupráce dává smysl e-shopům, provozovnám, značkám i lidem, kteří pomáhají značky
              propojovat se zákazníky.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {AUDIENCES.map(({ icon: Icon, title, points }) => (
              <Card
                key={title}
                className="homepage-light-panel h-full rounded-xl border border-[rgba(255,138,0,0.18)] bg-[hsl(220_45%_6%)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(255,138,0,0.4)] hover:shadow-[0_18px_38px_-20px_rgba(226,99,5,0.45)]"
              >
                <CardContent className="flex h-full flex-col gap-4 p-5 md:p-6">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#FFB547] to-[#FF8A00] shadow-[0_8px_20px_-8px_rgba(226,99,5,0.55)]">
                    <Icon size={24} className="h-6 w-6 text-black" />
                  </span>

                  <h3 className="text-lg font-bold text-foreground">{title}</h3>

                  <ul className="space-y-2">
                    {points.map((point) => (
                      <li key={point} className="flex items-start gap-2.5 text-sm text-text-silver">
                        <span
                          aria-hidden="true"
                          className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF8A00]"
                        />
                        <span className="leading-relaxed">{point}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ── Možnosti spolupráce ──────────────────────────────────────── */}
        <section id="moznosti-spoluprace" className="scroll-mt-24 space-y-6">
          <div className="space-y-2 text-center">
            <h2 className="homepage-premium-orange-heading text-2xl font-bold md:text-3xl">
              Možnosti spolupráce
            </h2>
            <p className="mx-auto max-w-2xl text-sm text-text-silver md:text-base">
              Jednotlivé možnosti lze kombinovat podle toho, co dává vaší značce smysl.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {COOPERATION_OPTIONS.map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="homepage-light-tile flex h-full items-start gap-3 rounded-xl border border-[rgba(255,138,0,0.18)] bg-[hsl(220_45%_6%)] px-4 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(255,138,0,0.4)]"
              >
                <Icon size={22} className="mt-0.5 h-[22px] w-[22px] shrink-0 text-[#FF8A00]" />
                <span className="text-sm font-semibold leading-snug text-foreground">{text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Jak spolupráce začíná ────────────────────────────────────── */}
        <section className="space-y-6">
          <div className="space-y-2 text-center">
            <h2 className="homepage-premium-orange-heading text-2xl font-bold md:text-3xl">
              Jak spolupráce začíná
            </h2>
          </div>

          <ol className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((step, index) => (
              <li
                key={step}
                className="homepage-light-tile flex h-full flex-col gap-3 rounded-xl border border-[rgba(255,138,0,0.18)] bg-[hsl(220_45%_6%)] p-5"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#FFB547] to-[#FF8A00] text-sm font-extrabold text-black shadow-[0_6px_16px_-6px_rgba(226,99,5,0.55)]">
                  {index + 1}
                </span>
                <span className="text-sm leading-relaxed text-text-silver">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Nemusíte využívat všechno ────────────────────────────────── */}
        <section>
          <Card className="homepage-light-panel homepage-miocoin-panel rounded-2xl border border-[rgba(255,138,0,0.2)] bg-[hsl(220_45%_6%)]">
            <CardContent className="p-6 md:p-8">
              <div className="mx-auto max-w-3xl space-y-3 text-center">
                <h2 className="homepage-premium-orange-heading text-2xl font-bold md:text-3xl">
                  Nemusíte využívat všechno
                </h2>
                <p className="text-sm leading-relaxed text-text-silver md:text-base">
                  Každý partner si vybírá jen ty možnosti, které odpovídají jeho podnikání a cíli
                  konkrétní kampaně. Někomu stačí odměna za nákup, jiný přidá vlastní voucher nebo
                  zapojí produkty do soutěže. Rozsah spolupráce lze kdykoli upravit a domlouvá se
                  individuálně.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── Závěrečná CTA ────────────────────────────────────────────── */}
        <section className="relative isolate overflow-hidden rounded-2xl">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(255,181,71,0.85)] to-transparent"
          />
          <div className="relative z-10 mx-auto max-w-2xl space-y-5 py-8 text-center md:py-10">
            <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-foreground md:text-3xl">
              Najděme správný způsob spolupráce pro vaši firmu.
            </h2>

            <div className="flex flex-col items-center gap-3">
              <Button
                asChild
                size="lg"
                className="w-full bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-black font-bold shadow-[0_10px_28px_-10px_rgba(226,99,5,0.6)] transition-all duration-300 hover:from-[#FFB547] hover:to-[#FF8A00] hover:-translate-y-0.5 sm:w-auto sm:px-10"
              >
                <Link to="/partner/register">Registrovat firmu</Link>
              </Button>

              <Link
                to="/partner/login"
                className="text-sm font-semibold text-[#e26305] underline-offset-4 transition-colors hover:underline"
              >
                Již mám partnerský účet
              </Link>
            </div>
          </div>
        </section>

        <Footer />
      </main>
    </div>
  );
};

export default PartnerPartnership;
