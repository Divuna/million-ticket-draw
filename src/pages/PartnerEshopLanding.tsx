import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight,
  Check,
  ChevronRight,
  ChevronDown,
  Store,
  ShoppingBag,
  ShoppingBasket,
  Car,
  Clock,
  Plane,
  Tags,
  Ticket,
  Megaphone,
  PackageOpen,
  TrendingUp,
  User,
  Mail,
  Phone,
} from 'lucide-react';
import heroImg from '@/assets/pro-eshopy-hero.jpg';

/* ---------------------------------------------------------------------------
 * OneMil — B2B landing page pro e-shopy (/pro-eshopy)
 *
 * Funnel: B2B reklama -> tato stránka -> /partner/register (EXISTUJÍCÍ partnerská
 * registrace). Stránka nesbírá žádné údaje a nevytváří paralelní registraci —
 * všechna CTA odkazují na /partner/register.
 *
 * Vizuál: světlá prémiová B2B varianta (bílá / #FAFAF9 warm cream, text #111827
 * a #4B5563, OneMil orange #F97316 jako hlavní akcent, červená #DC2626 výhradně
 * pro štítky ZDARMA). Poppins na nadpisy, Inter na text.
 *
 * Ikony jsou lucide-react (viz docs/brand/onemil_brand_kit/graphics.md —
 * "Icons: outline style (Lucide)"). Externí ikonové CDN použít nelze: produkční
 * CSP v index.html povoluje style-src pouze 'self' + fonts.googleapis.com.
 * ------------------------------------------------------------------------- */

/** Existující partnerská registrace — žádná nová registrace se nevytváří. */
const REGISTER_PATH = '/partner/register';

const B2B_EMAIL = 'b2b@onemil.cz';
const B2B_PHONE_DISPLAY = '731 215 816';
const B2B_PHONE_HREF = '+420731215816';

/** Scoped CSS pro glassmorphism, pulzující "i", tooltip a spojovací linky.
 *  Prefix pe- zabraňuje kolizi s globálními styly aplikace. */
const SCOPED_CSS = `
.pe-glass {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 24px 56px -20px rgba(17, 24, 39, 0.35);
}
.pe-pulse::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: #F97316;
  opacity: 0.55;
  animation: pePulseRing 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
@keyframes pePulseRing {
  0%   { transform: scale(1);   opacity: 0.55; }
  70%  { transform: scale(2.1); opacity: 0; }
  100% { transform: scale(2.1); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .pe-pulse::before { animation: none; }
}
.pe-tip .pe-tip-body {
  opacity: 0;
  visibility: hidden;
  transform: translate(-50%, 6px);
  transition: opacity .18s ease, transform .18s ease, visibility .18s;
}
.pe-tip:hover .pe-tip-body,
.pe-tip:focus-within .pe-tip-body {
  opacity: 1;
  visibility: visible;
  transform: translate(-50%, 0);
}
.pe-flow-line {
  height: 1px;
  background: linear-gradient(to right, transparent, #D6D3D1 20%, #D6D3D1 80%, transparent);
}
.pe-flow-line-v {
  width: 1px;
  background: linear-gradient(to bottom, transparent, #D6D3D1 20%, #D6D3D1 80%, transparent);
}
`;

const SUMMARY_POINTS = [
  'Odměňujete prémiově, ale s mikronáklady od 0,50 Kč.',
  'Platíte striktně jen za ty kredity, které zákazník reálně využije.',
  'Auta a drahé ceny hradí OneMil ze společného rozpočtu platformy.',
  'Zboží pro bonusové výhry nakupujeme přímo od našich partnerů.',
  'Získáváte trvalou provizi z další aktivity vašich zákazníků v OneMil.',
  'Snadná integrace na Shoptet, podpora více e-shopů z jedné administrace.',
];

const FREE_BENEFITS = [
  {
    icon: Tags,
    title: 'Slevy v aplikaci',
    text: 'Vkládejte do OneMil vlastní slevy a speciální nabídky pro zákazníky.',
    pad: 'sm:pr-10',
  },
  {
    icon: Ticket,
    title: 'Vouchery k soutěžím',
    text: 'Nabídněte své vouchery jako bonus k nákupu ticketů do vybraných soutěží.',
    pad: 'sm:px-10',
  },
  {
    icon: Megaphone,
    title: 'Promo na sítích',
    text: 'Po dohodě můžeme váš produkt nebo značku zapojit do soutěží a společné propagace na sociálních sítích.',
    pad: 'sm:pl-10',
  },
];

const PartnerEshopLanding: React.FC = () => {
  return (
    <div className="min-h-screen bg-white text-[#111827]">
      <Helmet>
        <title>OneMil pro e-shopy — dejte zákazníkům důvod nakoupit právě u vás</title>
        <meta
          name="description"
          content="Vyměňte slevy za odměny. K nákupu přidáte zákazníkovi kredity OneMil a platíte jen ty, které skutečně využije. 0 Kč fixní poplatky, bez měsíčního paušálu."
        />
      </Helmet>

      <style>{SCOPED_CSS}</style>

      {/* ==================== 1. HERO ==================== */}
      <section className="relative overflow-hidden bg-white">
        <div className="lg:grid lg:grid-cols-[40%_60%] lg:items-center lg:min-h-[680px]">

          {/* Text */}
          <div className="order-1 px-6 sm:px-10 lg:pl-16 xl:pl-24 lg:pr-10 py-14 lg:py-24">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] uppercase text-[#F97316] bg-orange-50 border border-orange-100 rounded-full px-3.5 py-1.5 mb-7">
              <Store className="w-3 h-3" strokeWidth={2.5} /> Pro e-shopy
            </span>

            <h1 className="font-heading font-black text-[2.2rem] leading-[1.06] sm:text-[2.7rem] xl:text-[3rem] xl:leading-[1.04] text-[#111827]">
              Vyměňte slevy, které vám ničí marži, za odměny, které zákazníci milují.
            </h1>

            <p className="mt-7 text-[17px] sm:text-[18px] leading-relaxed text-[#4B5563] max-w-[46ch]">
              Vy dáte zákazníkům kredity (klidně jen za 0,50 Kč). My za ně pořádáme soutěže o prémiové ceny.{' '}
              <strong className="text-gray-900 font-semibold">Platíte jen tehdy, když zákazník odměnu využije.</strong>
            </p>

            <div className="mt-9">
              <Link
                to={REGISTER_PATH}
                className="inline-flex items-center justify-center gap-2.5 bg-[#F97316] hover:bg-orange-600 transition-colors text-white font-heading font-bold text-[16px] rounded-2xl px-8 py-4 shadow-[0_18px_40px_-12px_rgba(249,115,22,0.6)]"
              >
                Zjistit více o napojení
                <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
              </Link>
            </div>

            <div className="mt-7 flex flex-col gap-2.5 text-[13px] text-gray-500">
              <span className="inline-flex items-start gap-2.5">
                <Check className="w-3.5 h-3.5 text-[#F97316] mt-[3px] shrink-0" strokeWidth={3} /> 0 Kč fixní poplatky
              </span>
              <span className="inline-flex items-start gap-2.5">
                <Check className="w-3.5 h-3.5 text-[#F97316] mt-[3px] shrink-0" strokeWidth={3} />
                Prvních 30 dní hradíme první 2 využité kredity my.
              </span>
            </div>
          </div>

          {/* Vizuál */}
          <div className="order-2 relative h-[340px] sm:h-[440px] lg:h-full lg:min-h-[680px]">
            {/* Mobil: ořez drží auto jako hlavní objekt. Desktop: poměr panelu (~1.27)
                je blízko poměru obrázku (4:3), takže je vidět i motorka, hodinky a taška. */}
            <img
              src={heroImg}
              alt="Prémiové ceny v soutěžích OneMil — sportovní auto, motorka, luxusní hodinky a cestovní taška u vily na pláži"
              className="absolute inset-0 w-full h-full object-cover object-[38%_58%] sm:object-[46%_52%] lg:object-[54%_50%]"
            />
            {/* změkčení hrany směrem k textu */}
            <div className="hidden lg:block absolute inset-y-0 left-0 w-40 bg-gradient-to-r from-white to-transparent" aria-hidden="true" />
            <div className="lg:hidden absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white to-transparent" aria-hidden="true" />

            {/* Glassmorphism karta */}
            <div className="pe-glass absolute bottom-6 left-6 sm:bottom-10 sm:left-10 rounded-2xl px-5 py-4 flex items-center gap-4 max-w-[330px]">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#F97316] to-orange-400 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-white" strokeWidth={2} />
              </div>
              <div className="leading-snug">
                <p className="text-[13px] text-gray-600">
                  Náklad e-shopu: <strong className="text-gray-900 font-bold">10 Kč</strong>
                </p>
                <p className="text-[13px] text-gray-600">
                  Odměna: <strong className="text-gray-900 font-bold">Šance vyhrát C8</strong>
                </p>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ==================== 2. SDÍLENÝ EKOSYSTÉM ==================== */}
      <section className="bg-[#FAFAF9] py-20 sm:py-28 px-6">
        <div className="max-w-6xl mx-auto">

          <h2 className="font-heading font-black text-[2rem] sm:text-[2.7rem] leading-[1.1] text-center text-[#111827]">
            Tajemství je ve sdílené platformě.
          </h2>
          <p className="mt-6 text-[16px] sm:text-[17px] leading-relaxed text-[#4B5563] text-center max-w-2xl mx-auto">
            Nemusíte sami kupovat sportovní auta. OneMil spojuje desítky e-shopů do jednoho ekosystému.
            Vy zákazníkovi poskytnete pouze kredity k nákupu. Společné soutěže o prémiové ceny organizujeme my.
          </p>

          <div className="mt-16 sm:mt-20">

            {/* Desktop */}
            <div className="hidden md:grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-4">

              <div className="text-center">
                <div className="flex items-center justify-center -space-x-3 mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                    <Store className="w-[19px] h-[19px] text-gray-400" strokeWidth={1.8} />
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                    <ShoppingBag className="w-[19px] h-[19px] text-gray-400" strokeWidth={1.8} />
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                    <ShoppingBasket className="w-[19px] h-[19px] text-gray-400" strokeWidth={1.8} />
                  </div>
                </div>
                <p className="font-heading font-bold text-[17px] text-[#111827]">Desítky e-shopů</p>
                <p className="mt-1 text-[13px] text-gray-500">Každý přidá zákazníkovi kredity</p>
              </div>

              <div className="flex items-center gap-2 w-24" aria-hidden="true">
                <div className="pe-flow-line flex-1" />
                <ChevronRight className="w-3.5 h-3.5 text-gray-300" strokeWidth={2.5} />
              </div>

              <div className="text-center">
                <div className="relative inline-flex items-center justify-center mb-5">
                  <div className="absolute w-28 h-28 rounded-full bg-orange-100/70 blur-2xl" aria-hidden="true" />
                  <div className="relative w-20 h-20 rounded-full bg-[#F97316] flex items-center justify-center shadow-[0_20px_44px_-14px_rgba(249,115,22,0.6)]">
                    <span className="font-heading font-black text-white text-[15px] tracking-tight">OneMil</span>
                  </div>
                </div>
                <p className="font-heading font-bold text-[17px] text-[#111827]">Sdílená platforma</p>
                <p className="mt-1 text-[13px] text-gray-500">Organizuje společné soutěže</p>
              </div>

              <div className="flex items-center gap-2 w-24" aria-hidden="true">
                <div className="pe-flow-line flex-1" />
                <ChevronRight className="w-3.5 h-3.5 text-gray-300" strokeWidth={2.5} />
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center gap-2.5 mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                    <Car className="w-[19px] h-[19px] text-[#F97316]" strokeWidth={1.8} />
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                    <Clock className="w-[19px] h-[19px] text-[#F97316]" strokeWidth={1.8} />
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                    <Plane className="w-[19px] h-[19px] text-[#F97316]" strokeWidth={1.8} />
                  </div>
                </div>
                <p className="font-heading font-bold text-[17px] text-[#111827]">Prémiové ceny</p>
                <p className="mt-1 text-[13px] text-gray-500">Auta, hodinky, cestování</p>
              </div>
            </div>

            {/* Mobil — vertikální timeline */}
            <div className="md:hidden flex flex-col items-center">
              <div className="text-center">
                <div className="flex items-center justify-center -space-x-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                    <Store className="w-[17px] h-[17px] text-gray-400" strokeWidth={1.8} />
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                    <ShoppingBag className="w-[17px] h-[17px] text-gray-400" strokeWidth={1.8} />
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                    <ShoppingBasket className="w-[17px] h-[17px] text-gray-400" strokeWidth={1.8} />
                  </div>
                </div>
                <p className="font-heading font-bold text-[16px]">Desítky e-shopů</p>
                <p className="mt-1 text-[13px] text-gray-500">Každý přidá zákazníkovi kredity</p>
              </div>

              <div className="pe-flow-line-v h-10 my-3" aria-hidden="true" />
              <ChevronDown className="w-3.5 h-3.5 text-gray-300 -mt-4 mb-3" strokeWidth={2.5} aria-hidden="true" />

              <div className="text-center">
                <div className="relative inline-flex items-center justify-center mb-4">
                  <div className="absolute w-24 h-24 rounded-full bg-orange-100/70 blur-2xl" aria-hidden="true" />
                  <div className="relative w-[72px] h-[72px] rounded-full bg-[#F97316] flex items-center justify-center shadow-lg">
                    <span className="font-heading font-black text-white text-[14px]">OneMil</span>
                  </div>
                </div>
                <p className="font-heading font-bold text-[16px]">Sdílená platforma</p>
                <p className="mt-1 text-[13px] text-gray-500">Organizuje společné soutěže</p>
              </div>

              <div className="pe-flow-line-v h-10 my-3" aria-hidden="true" />
              <ChevronDown className="w-3.5 h-3.5 text-gray-300 -mt-4 mb-3" strokeWidth={2.5} aria-hidden="true" />

              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                    <Car className="w-[17px] h-[17px] text-[#F97316]" strokeWidth={1.8} />
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                    <Clock className="w-[17px] h-[17px] text-[#F97316]" strokeWidth={1.8} />
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                    <Plane className="w-[17px] h-[17px] text-[#F97316]" strokeWidth={1.8} />
                  </div>
                </div>
                <p className="font-heading font-bold text-[16px]">Prémiové ceny</p>
                <p className="mt-1 text-[13px] text-gray-500">Auta, hodinky, cestování</p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ==================== 3. FINANCE ==================== */}
      <section className="bg-white py-20 sm:py-28 px-6">
        <div className="max-w-6xl mx-auto">

          <div className="max-w-3xl">
            <h2 className="font-heading font-black text-[2rem] sm:text-[2.7rem] leading-[1.1] text-[#111827]">
              Pravidla určujete vy. Platíte pouze za reálný úspěch.
            </h2>
            <p className="mt-6 text-[16px] sm:text-[17px] leading-relaxed text-[#4B5563]">
              Výši odměny nastavujete přesně podle své marže. Můžete začít na 0,50 Kč u drobných nákupů, nebo
              nabídnout třeba 100 kreditů u dražšího zboží pro maximální „wow efekt“. Nikdo vám nic nediktuje.
              Ať už ale zákazníkům rozdáte kolikkoliv, vaše riziko zůstává nulové. Platíte totiž jen za to, co se
              reálně využije.
            </p>
          </div>

          <div className="mt-16 grid md:grid-cols-3 gap-y-14 md:gap-y-0 md:gap-x-6">

            <div className="md:pr-8 md:border-r border-gray-200">
              <p className="text-[12px] font-semibold tracking-[0.18em] uppercase text-gray-400">Hodnota odměny:</p>
              <p className="mt-4 font-heading font-black text-[2.5rem] sm:text-[3rem] leading-[1.02] text-[#111827]">
                Zcela na vás
              </p>
              <p className="mt-3 text-[14px] text-gray-500">(od 0,50 Kč až po stovky kreditů)</p>
            </div>

            <div className="md:px-8 md:border-r border-gray-200">
              <p className="text-[12px] font-semibold tracking-[0.18em] uppercase text-gray-400">1 využitý kredit</p>
              <p className="mt-4 font-heading font-black text-[2.5rem] sm:text-[3rem] leading-[1.02] text-[#F97316]">
                = 1 Kč
              </p>
              <p className="mt-3 text-[14px] text-gray-500">+ DPH</p>
            </div>

            <div className="md:pl-8">
              <p className="text-[12px] font-semibold tracking-[0.18em] uppercase text-gray-400">Pokud kredit nevyužije:</p>
              <p className="mt-4 font-heading font-black text-[2.5rem] sm:text-[3rem] leading-[1.02] text-[#111827]">
                0 Kč
              </p>
              <p className="mt-3 text-[14px] text-gray-500">(Nulový náklad)</p>
            </div>

          </div>
        </div>
      </section>

      {/* ==================== 4. B2B BENEFITY ==================== */}
      <section className="bg-[#FAFAF9] py-20 sm:py-28 px-6">
        <div className="max-w-6xl mx-auto">

          <div className="max-w-2xl">
            <h2 className="font-heading font-black text-[2rem] sm:text-[2.7rem] leading-[1.1] text-[#111827]">
              S OneMil získáte mnohem víc.
            </h2>
            <p className="mt-5 text-[16px] sm:text-[17px] leading-relaxed text-[#4B5563]">
              Náš ekosystém neslouží jen vašim zákazníkům. Je navržen tak, aby generoval byznys přímo vám.
            </p>
          </div>

          {/* Horní část — tři položky zdarma */}
          <div className="mt-16 grid sm:grid-cols-3 gap-12 sm:gap-0 sm:divide-x sm:divide-gray-200">
            {FREE_BENEFITS.map(({ icon: Icon, title, text, pad }) => (
              <div key={title} className={pad}>
                <div className="flex items-center gap-3">
                  <Icon className="w-[19px] h-[19px] text-[#F97316]" strokeWidth={1.8} />
                  <span className="inline-flex items-center bg-[#DC2626] text-white font-semibold text-xs tracking-wide uppercase rounded-full px-3 py-1">
                    Zdarma
                  </span>
                </div>
                <h3 className="mt-5 font-heading font-bold text-[1.4rem] leading-snug text-[#111827]">{title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[#4B5563]">{text}</p>
              </div>
            ))}
          </div>

          {/* Střední část — editorial blok přes celou šířku */}
          <div className="mt-16 pt-16 border-t border-gray-200">
            <div className="grid lg:grid-cols-[auto_1fr] gap-6 lg:gap-14 items-start">
              <div className="flex items-center lg:pt-3">
                <PackageOpen className="w-[22px] h-[22px] text-[#F97316]" strokeWidth={1.8} />
              </div>

              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="font-heading font-black text-[1.8rem] sm:text-[2.1rem] leading-[1.15] text-[#111827]">
                    Zboží do soutěží
                  </h3>
                  <span className="inline-flex items-center bg-[#F97316] text-white font-semibold text-xs tracking-wide uppercase rounded-full px-3 py-1 whitespace-nowrap">
                    Nakupujeme u partnerů
                  </span>

                  {/* pulzující "i" + CSS tooltip */}
                  <span className="pe-tip relative inline-flex" tabIndex={0}>
                    <span className="pe-pulse relative inline-flex items-center justify-center w-5 h-5 shrink-0">
                      <span className="relative z-10 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#F97316] text-white text-[11px] font-bold cursor-help">
                        i
                      </span>
                    </span>
                    <span className="pe-tip-body absolute left-1/2 bottom-full mb-3 z-20 w-64 rounded-xl bg-white text-[#111827] text-[13px] leading-relaxed px-4 py-3 shadow-[0_20px_44px_-12px_rgba(0,0,0,0.35)] border border-gray-100">
                      Modelový příklad: Z budgetu pro bonusové výhry můžeme nakupovat zboží přímo od vás do našich
                      soutěží.
                      <span className="absolute left-1/2 -translate-x-1/2 top-full w-3 h-3 bg-white border-r border-b border-gray-100 rotate-45 -mt-1.5" />
                    </span>
                  </span>
                </div>

                <p className="mt-4 text-[16px] leading-relaxed text-[#4B5563] max-w-[62ch]">
                  Když hledáme produkty do soutěží, nakupujeme je přednostně od našich partnerů.
                  OneMil se tak může stát i vaším zákazníkem.
                </p>
              </div>
            </div>
          </div>

          {/* Spodní část — pasivní příjem */}
          <div className="mt-16 rounded-3xl bg-[#22C55E]/[0.06] border border-[#22C55E]/25 px-8 sm:px-12 py-11 sm:py-14">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-[22px] h-[22px] text-[#16A34A]" strokeWidth={1.8} />
              <span className="inline-flex items-center bg-[#22C55E] text-white font-semibold text-xs tracking-wide uppercase rounded-full px-3 py-1">
                Pasivní příjem
              </span>
            </div>

            <h3 className="mt-6 font-heading font-black text-[2rem] sm:text-[2.5rem] leading-[1.1] text-[#111827] max-w-[22ch]">
              Dlouhodobá provize z vašich zákazníků
            </h3>
            <p className="mt-5 text-[16px] sm:text-[17px] leading-relaxed text-[#4B5563] max-w-[64ch]">
              Pokud přes vaši odměnu začne zákazník využívat OneMil i samostatně, získáváte z jeho aktivity
              průběžnou partnerskou provizi. Vy přivedete zákazníka, my ho bavíme, vy dlouhodobě profitujete.
            </p>
          </div>

        </div>
      </section>

      {/* ==================== 4.5 VŠE V KOSTCE ==================== */}
      <section className="bg-white py-20 sm:py-28 px-6">
        <div className="max-w-6xl mx-auto">

          <h2 className="font-heading font-black text-[2rem] sm:text-[2.7rem] leading-[1.1] text-[#111827]">
            OneMil pro e-shopy v kostce.
          </h2>

          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-8">
            {SUMMARY_POINTS.map((point) => (
              <div key={point} className="flex items-start gap-3.5">
                <Check className="w-4 h-4 text-[#F97316] mt-[3px] shrink-0" strokeWidth={3} />
                <p className="text-[15px] leading-relaxed text-[#4B5563]">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== 5. BOTTOM CTA ==================== */}
      <section className="bg-[#F97316] py-20 sm:py-28 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-heading font-black text-[2.1rem] sm:text-[3rem] leading-[1.08] text-white">
            Přestaňte dotovat slevy.
          </h2>
          <p className="mt-5 text-[16px] sm:text-[18px] leading-relaxed text-orange-50 max-w-[52ch] mx-auto">
            Zapojte svůj e-shop během chvíle. Integrace je jednoduchá a funguje s většinou platforem
            (včetně Shoptetu).
          </p>
          <div className="mt-10">
            <Link
              to={REGISTER_PATH}
              className="inline-flex items-center justify-center gap-2.5 bg-white hover:bg-orange-50 transition-colors text-[#F97316] font-heading font-bold text-[16px] sm:text-[17px] rounded-2xl px-9 py-4 shadow-[0_20px_44px_-14px_rgba(0,0,0,0.35)]"
            >
              Chci OneMil pro svůj e-shop
              <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
            </Link>
          </div>

          {/* Kontakt */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8">
            <a
              href={`mailto:${B2B_EMAIL}`}
              className="inline-flex items-center gap-2.5 text-[15px] font-semibold text-white hover:text-orange-100 transition-colors"
            >
              <Mail className="w-4 h-4" strokeWidth={2} />
              {B2B_EMAIL}
            </a>
            <a
              href={`tel:${B2B_PHONE_HREF}`}
              className="inline-flex items-center gap-2.5 text-[15px] font-semibold text-white hover:text-orange-100 transition-colors"
            >
              <Phone className="w-4 h-4" strokeWidth={2} />
              {B2B_PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PartnerEshopLanding;
