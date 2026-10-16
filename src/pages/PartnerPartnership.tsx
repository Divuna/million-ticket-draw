import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
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
import emblem from "@/assets/redesign/onemil-emblem.png";

/**
 * Veřejná stránka `/partnerstvi` — přehled možností spolupráce s OneMil.
 *
 * Marketingová vstupní stránka pro firmy, značky, agentury a tvůrce. Odsud
 * vede registrace na `/partner/register`; samotná registrace ani partnerský
 * portál se odsud nemění. Vzhled: obchodní varianta nového vizuálu
 * (krémový podklad, námořnická modř, zlato jen jako linky, `onemil-b2b.css`).
 *
 * Pravidla obsahu (neměnit bez schválení vlastníka):
 * - Žádná procenta, ceny, konkrétní výše provizí ani veřejné detailní
 *   obchodní podmínky. Konkrétní nastavení se domlouvá individuálně.
 * - Zakázané rámování (casino, hazard, jackpot, sázení, kryptoměna) se
 *   nepoužívá; contest se popisuje jako spotřebitelská soutěž o věcné ceny.
 * - Obsah vychází z `ONEMIL_BUSINESS_CONTEXT.md`; neslibovat funkce, které
 *   tam nejsou potvrzené. Veřejný název kreditu je MIO.
 */

const AUDIENCES = [
  {
    icon: OneMilCartIcon,
    title: "E-shopy a firmy",
    points: ["Odměny zákazníkům za nákup", "Podpora opakovaných nákupů a věrnosti", "Vlastní kampaně a nabídky"],
  },
  {
    icon: OneMilHomeIcon,
    title: "Kamenné provozovny a služby",
    points: ["Zapojení zákazníků přímo v provozovně", "Odměnové kódy a promo akce", "Propojení nákupu s OneMil"],
  },
  {
    icon: OneMilGiftIcon,
    title: "Značky a dodavatelé produktů",
    points: ["Prezentace produktů", "Vlastní vouchery a partnerské nabídky", "Produkty v kampaních a soutěžích"],
  },
  {
    icon: OneMilProfileIcon,
    title: "Agentury a obchodní partneři",
    points: ["Přivádění firem a značek do OneMil", "Dlouhodobá správa spolupráce", "Přehled výsledků v partnerském systému"],
  },
  {
    icon: OneMilStarIcon,
    title: "Influenceři a tvůrci",
    points: ["Vlastní kampaně a komunikační aktivity", "Osobní odkazy a kódy", "Propojení s partnery a komunitou"],
  },
  {
    icon: OneMilZapIcon,
    title: "Menší a začínající značky",
    points: ["Zviditelnění produktů", "Zapojení do kampaní a sociálních aktivit", "Oslovení nových zákazníků"],
  },
] as const;

const COOPERATION_OPTIONS = [
  { icon: OneMilMioCoinIcon, text: "MIO jako odměna za nákup nebo jinou aktivitu" },
  { icon: OneMilVoucherIcon, text: "Vlastní vouchery" },
  { icon: OneMilGiftIcon, text: "Partnerské nabídky" },
  { icon: OneMilTrophyIcon, text: "Produkty a ceny do soutěží" },
  { icon: OneMilZapIcon, text: "Společné marketingové kampaně" },
  { icon: OneMilHeartIcon, text: "Sociální soutěže a propagace" },
  { icon: OneMilTicketIcon, text: "Podpora sezónních akcí, vybraných produktů a doprodeje" },
  { icon: OneMilFilterIcon, text: "Měřitelný přehled aktivity" },
] as const;

/** Ověřená fakta o spolupráci (stav systému, žádná čísla ani ceny). */
const FACTS = [
  { icon: OneMilProfileIcon, text: "Každou registraci firmy ručně schvalujeme" },
  { icon: OneMilFilterIcon, text: "Přehled v partnerském portálu" },
  { icon: OneMilMioCoinIcon, text: "Fakturace jen za aktivované odměny" },
  { icon: OneMilCartIcon, text: "Napojení Shoptetu bez programování" },
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

const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l5 5 9-10" />
  </svg>
);

/** Animace: podpis smlouvy o spolupráci a razítko partnerství (čistě dekorativní). */
const ContractSigning = () => (
  <div className="om-b2b-sign" aria-hidden="true">
    <div className="om-b2b-doc om-b2b-doc-back" />
    <div className="om-b2b-doc om-b2b-doc-front">
      <span className="om-b2b-doc-title">SMLOUVA O SPOLUPRÁCI</span>
      <div className="om-b2b-doc-lines"><i /><i /><i /><i /></div>
      <div className="om-b2b-doc-lines"><i /><i /><i /></div>
      <div className="om-b2b-doc-sigs">
        <div className="om-b2b-sigbox">
          <svg viewBox="0 0 120 46" preserveAspectRatio="none">
            <path className="om-b2b-sigpath om-b2b-sigpath-1" d="M4 34c8-22 14-26 16-14s-2 18 6 6 12-20 16-8-4 14 6 4 14-10 20-4 10 6 18-2 14-6 30-4" />
          </svg>
          <span>OneMil</span>
        </div>
        <div className="om-b2b-sigbox">
          <svg viewBox="0 0 120 46" preserveAspectRatio="none">
            <path className="om-b2b-sigpath om-b2b-sigpath-2" d="M4 30c6-4 10-20 18-18s-6 22 4 18 10-16 18-16 2 14 10 12 8-12 16-10 4 12 14 6 12-8 28-6" />
          </svg>
          <span>Partner</span>
        </div>
      </div>
    </div>
    <svg className="om-b2b-pen" viewBox="0 0 60 60" aria-hidden="true">
      <path d="M8 52 L40 10 L50 18 L18 60 Z" fill="#0E1B33" />
      <path d="M40 10 L46 2 L56 10 L50 18 Z" fill="#C9A24A" />
      <path d="M8 52 L6 58 L12 56 Z" fill="#C9A24A" />
    </svg>
    <div className="om-b2b-seal">
      <img src={emblem} alt="" />
      <span>PARTNER</span>
    </div>
    <span className="om-b2b-chip om-b2b-chip-1"><i><CheckIcon /></i>Registrace schválena</span>
    <span className="om-b2b-chip om-b2b-chip-2"><i><CheckIcon /></i>Portál aktivní</span>
  </div>
);

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
    <div className="homepage-light-page om-b2b min-h-screen pb-20">
      <Helmet>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
      </Helmet>

      <Header />

      <main className="container mx-auto max-w-6xl space-y-14 px-4 py-8 md:space-y-20 md:py-12">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="om-b2b-hero">
          <div className="relative grid items-center gap-8 px-6 py-10 md:grid-cols-[1.1fr_1fr] md:px-12 md:py-14">
            <div className="flex flex-col items-start gap-5">
              <span className="om-b2b-kicker">Partnerství OneMil</span>
              <h1 className="om-b2b-h1">
                Více hodnoty pro vaše zákazníky.
                <br />
                Více možností pro vaši značku.
              </h1>
              <p className="om-b2b-hero-text max-w-xl">
                OneMil propojuje odměny za nákup, vouchery, partnerské nabídky, kampaně a soutěžní
                zážitky do jednoho přehledného systému. Spolupráci nastavujeme s každou firmou
                individuálně.
              </p>
              <div className="flex w-full flex-col gap-3 pt-1 sm:w-auto sm:flex-row">
                <Link to="/partner/register" className="om-b2b-btn-gold">Registrovat firmu</Link>
                <a href="#moznosti-spoluprace" className="om-b2b-btn-ghost">Možnosti spolupráce</a>
              </div>
            </div>
            <ContractSigning />
          </div>
        </section>

        {/* ── Fakta ────────────────────────────────────────────────────── */}
        <section aria-label="Proč OneMil" className="om-b2b-facts">
          {FACTS.map(({ icon: Icon, text }) => (
            <div key={text} className="om-b2b-fact">
              <span className="om-b2b-icon om-b2b-icon-sm"><Icon size={20} className="h-5 w-5" /></span>
              <strong>{text}</strong>
            </div>
          ))}
        </section>

        {/* ── Pro koho je partnerství určené ───────────────────────────── */}
        <section className="space-y-7">
          <div className="om-b2b-center space-y-3 text-center">
            <h2 className="om-b2b-h2">Pro koho je partnerství určené</h2>
            <p className="om-b2b-lead mx-auto max-w-2xl">
              Spolupráce dává smysl e-shopům, provozovnám, značkám i lidem, kteří pomáhají značky
              propojovat se zákazníky.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {AUDIENCES.map(({ icon: Icon, title, points }) => (
              <article key={title} className="om-b2b-card">
                <span className="om-b2b-icon"><Icon size={24} className="h-6 w-6" /></span>
                <h3>{title}</h3>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {points.map((point) => <li key={point}>{point}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* ── Možnosti spolupráce ──────────────────────────────────────── */}
        <section id="moznosti-spoluprace" className="scroll-mt-24 space-y-7">
          <div className="om-b2b-center space-y-3 text-center">
            <h2 className="om-b2b-h2">Možnosti spolupráce</h2>
            <p className="om-b2b-lead mx-auto max-w-2xl">
              Jednotlivé možnosti lze kombinovat podle toho, co dává vaší značce smysl.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {COOPERATION_OPTIONS.map(({ icon: Icon, text }) => (
              <div key={text} className="om-b2b-option">
                <span className="om-b2b-icon om-b2b-icon-sm"><Icon size={20} className="h-5 w-5" /></span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Jak spolupráce začíná ────────────────────────────────────── */}
        <section className="space-y-7">
          <div className="om-b2b-center space-y-3 text-center">
            <h2 className="om-b2b-h2">Jak spolupráce začíná</h2>
          </div>
          <ol className="om-b2b-steps">
            {STEPS.map((step, index) => (
              <li key={step} className="om-b2b-step">
                <span className="om-b2b-step-num" style={{ animationDelay: `${index * 1.3}s` }}>{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Nemusíte využívat všechno ────────────────────────────────── */}
        <section className="om-b2b-band om-b2b-center text-center">
          <div className="mx-auto max-w-3xl space-y-4">
            <h2 className="om-b2b-h2">Nemusíte využívat všechno</h2>
            <p className="text-[15px] leading-relaxed md:text-base">
              Každý partner si vybírá jen ty možnosti, které odpovídají jeho podnikání a cíli
              konkrétní kampaně. Někomu stačí odměna za nákup, jiný přidá vlastní voucher nebo
              zapojí produkty do soutěže. Rozsah spolupráce lze kdykoli upravit a domlouvá se
              individuálně.
            </p>
          </div>
        </section>

        {/* ── Závěrečná CTA ────────────────────────────────────────────── */}
        <section className="om-b2b-center flex flex-col items-center gap-5 text-center">
          <h2 className="om-b2b-h2 max-w-2xl">Najděme správný způsob spolupráce pro vaši firmu</h2>
          <p className="om-b2b-lead max-w-xl">
            Pošlete registraci a ozveme se vám s návrhem nastavení. Obchodní dotazy můžete psát
            i na <a href="mailto:b2b@onemil.cz" className="font-bold text-[#16294B] underline-offset-4 hover:underline">b2b@onemil.cz</a>.
          </p>
          <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            <Link to="/partner/register" className="om-b2b-btn-navy w-full sm:w-auto">Registrovat firmu</Link>
            <Link to="/partner/login" className="text-sm font-bold text-[#16294B] underline-offset-4 hover:underline">
              Již mám partnerský účet
            </Link>
          </div>
        </section>

        <Footer />
      </main>
    </div>
  );
};

export default PartnerPartnership;
