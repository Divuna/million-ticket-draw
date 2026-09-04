import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight,
  ArrowDown,
  Check,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Key,
  Sparkles,
  Watch,
  Car,
  Plane,
  Ticket,
  Tag,
  Megaphone,
  Handshake,
} from 'lucide-react';
import logo from '@/assets/logo-onemil.png';
import { MIOCOIN_IMAGE_URL } from '@/components/MioCoin';

/* ---------------------------------------------------------------------------
 * OneMil — B2B landing page pro e-shopy ("SHOW" redesign, 04. 09. 2026)
 *
 * Funnel: B2B reklama -> tato stránka -> /partner/register (existující
 * partnerská registrace). Stránka NEsbírá žádné údaje a nevytváří paralelní
 * registraci — pouze vysvětluje nabídku a odkazuje na /partner/register
 * (obchod) a /affiliate/register (dlouhodobá spolupráce / obchodní partner).
 *
 * Vizuál: převážně světlá B2B základna (bílá / velmi světlá šedá / černý
 * text / OneMil orange), proložená tmavými "SHOW" momenty ve stejné dark
 * premium paletě jako zbytek zákaznické aplikace (--om-* tokeny v
 * src/index.css). Světlé sekce zůstávají scopované lokálně pevnými hodnotami
 * (stejná konvence jako v předchozí verzi téhle stránky), tmavé sekce
 * hardcodují stejné hex hodnoty jako --om-black/--om-navy/--om-orange atd.,
 * protože zbytek repa tokeny také nepoužívá přes Tailwind utility třídy.
 * ------------------------------------------------------------------------- */

/* --- FEATURE GATES ----------------------------------------------------------
 * Stav k 04. 09. 2026 (viz CLAUDE.md a onemil_state.md pro detail):
 *
 * 1) SHOW_PARTNER_15MC_CARD — VYPNUTO. Bonus 15 MC pro NOVÉHO zákazníka
 *    registrovaného přes partnera (Fáze 4 — partner_new_customer_bonus) má
 *    hotovou migraci a rollback na samostatné, dosud nemergnuté větvi a
 *    NENÍ nasazen na produkci. Nezobrazovat, dokud produkční rollout
 *    neproběhne a nebude schválený.
 *
 * 2) SHOW_TRIAL_CARD — ZAPNUTO. 30denní zahajovací akce (první 2 MC z každé
 *    odměny AKTIVOVANÉ během trialu hradí OneMil) je staging-ověřená.
 *    Produkční rollout čeká na samostatné schválení — nezveřejňovat naživo,
 *    dokud produkce backend nemá.
 *
 * 3) SHOW_REWARD_EXPIRY_CLAIM — ZAPNUTO. 90denní platnost neaktivované
 *    odměny od jejího vydání zákazníkovi je staging-ověřená. Produkční
 *    rollout čeká na samostatné schválení.
 * ------------------------------------------------------------------------- */
const SHOW_PARTNER_15MC_CARD = false;
const SHOW_TRIAL_CARD = true;
const SHOW_REWARD_EXPIRY_CLAIM = true;

/** Kolik MioCoinů z každé aktivované odměny hradí OneMil během zahajovací akce. */
const TRIAL_FREE_MC_PER_REWARD = 2;
/** Délka zahajovací akce ve dnech. Běží od první skutečně vydané odměny. */
const TRIAL_DAYS = 30;
/** Bonus pro nového zákazníka při první registraci do OneMil přes partnera.
 *  FÁZE 4 zatím není nasazená na produkci — konstanta zůstává pro pozdější
 *  zapnutí SHOW_PARTNER_15MC_CARD, ale nikde se dnes nevykresluje. */
const NEW_CUSTOMER_BONUS_MC = 15;
/** Platnost neaktivované partnerské odměny ve dnech od jejího vydání zákazníkovi. */
const REWARD_VALIDITY_DAYS = 90;
/** Cena jednoho aktivovaného MioCoinu partnerovi, bez DPH. */
const PRICE_PER_ACTIVATED_MC_CZK = 1;
/** Minimální odměna komunikovaná partnerům — reálné technické minimum. */
const MIN_REWARD_MC = 0.5;

/* --- "100 000 → 500" wow moment — čistě ilustrativní kulaté hodnoty -------- */
const WOW_DISTRIBUTED_MC = 100000;
const WOW_USED_MC = 500;
const WOW_UNUSED_MC = WOW_DISTRIBUTED_MC - WOW_USED_MC; // 99 500
const WOW_BILLED_CZK = WOW_USED_MC * PRICE_PER_ACTIVATED_MC_CZK; // 500

const cz = (n: number) => n.toLocaleString('cs-CZ');

/* --- drobné animační hooky (bez externí knihovny, matchuje projektový styl) */

/** Fade-up reveal při vstupu do viewportu. Spustí se jen jednou. */
function useReveal<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, visible };
}

const Reveal: React.FC<{ className?: string; delayMs?: number; children: React.ReactNode }> = ({
  className = '',
  delayMs = 0,
  children,
}) => {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delayMs}ms` }}
      className={`transition-all duration-700 ease-out will-change-transform ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      } ${className}`}
    >
      {children}
    </div>
  );
};

/** Count-up čísla od 0 do target, spustí se jednou při vstupu do viewportu. */
function useCountUp(target: number, durationMs = 1400) {
  const { ref, visible } = useReveal<HTMLSpanElement>(0.4);
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, target, durationMs]);
  return { ref, value };
}

/* --- stavební prvky --------------------------------------------------------- */

const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div
    className={
      'rounded-2xl bg-white border border-[#E8EBEF] shadow-[0_1px_2px_rgba(16,23,34,0.04),0_8px_24px_-12px_rgba(16,23,34,0.14)] ' +
      className
    }
  >
    {children}
  </div>
);

const SectionTitle: React.FC<{ eyebrow?: string; title: string; lead?: string; dark?: boolean }> = ({
  eyebrow,
  title,
  lead,
  dark = false,
}) => (
  <div className="max-w-2xl mx-auto text-center">
    {eyebrow && (
      <p
        className={`text-xs font-semibold tracking-[0.18em] uppercase mb-3 ${
          dark ? 'text-[#FFB547]' : 'text-[#FF8A00]'
        }`}
      >
        {eyebrow}
      </p>
    )}
    <h2
      className={`font-heading text-2xl sm:text-3xl md:text-[2.15rem] font-bold leading-tight ${
        dark ? 'text-[#E7EBF0]' : 'text-[#12161C]'
      }`}
    >
      {title}
    </h2>
    {lead && (
      <p className={`mt-4 text-[15px] sm:text-base leading-relaxed ${dark ? 'text-[#BFC6CF]' : 'text-[#5B6572]'}`}>
        {lead}
      </p>
    )}
  </div>
);

/** MioCoin odznak — malá zlato-oranžová mince, používá stejný asset jako
 * zákaznická aplikace (MIOCOIN_IMAGE_URL z src/components/MioCoin.tsx). */
const CoinBadge: React.FC<{ size?: number; className?: string }> = ({ size = 22, className = '' }) => (
  <span
    className={`relative inline-flex items-center justify-center rounded-full bg-gradient-to-br from-[rgba(255,138,0,0.45)] via-[rgba(255,181,71,0.15)] to-black/80 p-[2px] shadow-[0_0_10px_rgba(255,138,0,0.4)] shrink-0 ${className}`}
    style={{ width: size + 4, height: size + 4 }}
  >
    <span className="flex items-center justify-center rounded-full bg-black/85 w-full h-full">
      <img src={MIOCOIN_IMAGE_URL} alt="" aria-hidden="true" style={{ width: size, height: size, objectFit: 'contain' }} />
    </span>
  </span>
);

/**
 * Prémiová "Kling" plocha — tmavý cinematic panel s vrstvenými radiálními
 * gradienty, jemným glow a decentním šumem, bez textu (text jde vždy jako
 * HTML overlay nad plochou, nikdy do samotného obrázku).
 *
 * DOČASNÝ STAV: Kling generace obou hero/show vizuálů byla připravena a
 * spuštěna (viz report), ale API účet vrátil `1102 Account balance not
 * enough` — vlastní přihlášení na kling.ai web je oddělené od kreditu na
 * API platformě (klingai.com/dev), který se kupuje samostatně jako
 * "Resource Package". Jakmile bude kredit doplněný, stačí tuto komponentu
 * nahradit `<img src={heroVisual} className="..." />` (žádná jiná změna
 * layoutu není potřeba — panel má už teď připravené rozměry i zaoblení).
 */
const PremiumVisualPanel: React.FC<{
  className?: string;
  variant?: 'hero' | 'show';
  children?: React.ReactNode;
}> = ({ className = '', variant = 'hero', children }) => (
  <div
    className={`relative overflow-hidden rounded-[28px] bg-[#0A0B0F] ${className}`}
    style={{
      backgroundImage:
        variant === 'hero'
          ? 'radial-gradient(120% 90% at 85% 0%, rgba(255,138,0,0.22), transparent 60%), radial-gradient(90% 70% at 10% 100%, rgba(255,181,71,0.10), transparent 55%), linear-gradient(160deg, #101722 0%, #0A0B0F 60%, #1D2128 100%)'
          : 'radial-gradient(100% 80% at 20% 10%, rgba(255,138,0,0.20), transparent 55%), radial-gradient(90% 70% at 85% 90%, rgba(255,181,71,0.14), transparent 55%), linear-gradient(150deg, #1D2128 0%, #0A0B0F 55%, #101722 100%)',
    }}
  >
    {/* jemný šum / vinětace, ať plocha nepůsobí jako plochý gradient */}
    <div className="absolute inset-0 opacity-[0.06] mix-blend-overlay bg-[url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22120%22%20height%3D%22120%22%3E%3Cfilter%20id%3D%22n%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.9%22%20numOctaves%3D%222%22%20stitchTiles%3D%22stitch%22%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20filter%3D%22url(%23n)%22%2F%3E%3C%2Fsvg%3E')] bg-repeat" />
    <div className="absolute inset-0 shadow-[inset_0_0_90px_rgba(0,0,0,0.55)]" />
    {children}
  </div>
);

/* --- Hero visual — světlý e-shop mockup + VELKÝ skutečný MioCoin asset ----
 * MioCoin je zde fyzicky dominantní vizuální objekt (ne malý badge) —
 * použit přímo MIOCOIN_IMAGE_URL asset z projektu, nepřekreslený, jen
 * zvětšený/natočený/se stínem a jemným glow. Přesahuje kartu s e-shop
 * mockupem, aby cesta „nakoupím → dostanu MioCoiny → použiju v OneMil"
 * byla čitelná za 2 sekundy bez velké tmavé plochy. */

const HeroVisual: React.FC = () => (
  <div className="relative pt-10 pr-4 sm:pt-14 sm:pr-8 lg:pt-16 lg:pr-2">
    {/* Realistický browser mockup — o něco menší a posunutý doleva, aby
     * měl obří MioCoin místo přesahovat vpravo nahoře jako fyzický objekt,
     * ne malý badge v rohu karty. */}
    <div className="relative z-10 max-w-[420px] ml-auto mr-8 sm:mr-12 rounded-2xl bg-white border border-[#E8EBEF] shadow-[0_1px_2px_rgba(16,23,34,0.04),0_40px_80px_-32px_rgba(16,23,34,0.28)] overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#F1F4F7] border-b border-[#E8EBEF]">
        <span className="w-2 h-2 rounded-full bg-[#FF8A00]/40" />
        <span className="w-2 h-2 rounded-full bg-[#E1E5EA]" />
        <span className="w-2 h-2 rounded-full bg-[#E1E5EA]" />
        <span className="ml-1.5 flex-1 rounded-md bg-white border border-[#E8EBEF] px-2.5 py-1 text-[10px] text-[#8E98A6] truncate">
          vaseeshop.cz/kosik
        </span>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex gap-3 pb-4 border-b border-[#EEF1F4]">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#F1F4F7] to-[#E8EBEF] shrink-0 flex items-center justify-center">
            <ShoppingBag className="w-6 h-6 text-[#B0B8C2]" />
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <p className="text-[13px] font-semibold text-[#12161C] leading-snug">Prémiový produkt</p>
            <p className="text-[12px] text-[#8E98A6] mt-0.5">1 990 Kč</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-[#5B6572]" />
            <span className="text-[13px] text-[#5B6572]">Košík · 2 položky</span>
          </div>
          <span className="text-[13px] font-bold text-[#12161C]">3 980 Kč</span>
        </div>

        <div className="rounded-xl bg-gradient-to-r from-[#FFF6EA] to-[#FFF1DF] border border-[#FFD9A6] px-3.5 py-3 flex items-center gap-2.5">
          <CoinBadge size={16} />
          <span className="text-[12.5px] font-bold text-[#7A4A00]">Za tuto objednávku získáte 34 MioCoinů.</span>
        </div>
      </div>
    </div>

    {/* OBŘÍ skutečný MioCoin — hlavní vizuální objekt hero, ne malá mince.
     * Přesahuje browser mockup vpravo nahoře, mírně natočený, s měkkým
     * stínem a jemným glow za sebou. */}
    <div className="absolute top-0 right-0 sm:-right-2 w-[62%] sm:w-[54%] lg:w-[58%] max-w-[420px] pointer-events-none z-20">
      <div className="relative" style={{ transform: 'rotate(-11deg)' }}>
        <div className="absolute inset-0 rounded-full blur-[70px] bg-[#FF8A00]/25 scale-110" aria-hidden="true" />
        <img
          src={MIOCOIN_IMAGE_URL}
          alt="MioCoin"
          className="relative w-full h-auto drop-shadow-[0_40px_60px_rgba(255,138,0,0.32)]"
        />
      </div>
    </div>

    {/* Callout kartička — plave nad mockupem vlevo dole, propojuje coin s benefitem */}
    <div className="absolute -bottom-5 left-0 sm:-left-4 z-30 rounded-2xl bg-[#0A0B0F] shadow-[0_20px_44px_-16px_rgba(10,11,15,0.5)] px-4 py-3 flex items-center gap-2.5 max-w-[220px]">
      <CoinBadge size={20} />
      <p className="text-[12px] font-semibold text-white leading-snug">+15 MioCoinů za tento nákup</p>
    </div>
  </div>
);

/* --- "Co vidí zákazník" — realistický e-shop mockup ------------------------ */

const CustomerShopMockup: React.FC = () => (
  <div className="rounded-2xl bg-white border border-[#E8EBEF] shadow-[0_1px_2px_rgba(16,23,34,0.04),0_20px_44px_-24px_rgba(16,23,34,0.22)] overflow-hidden">
    <div className="flex items-center gap-1.5 px-4 py-2.5 bg-[#FAFBFC] border-b border-[#E8EBEF]">
      <span className="w-2 h-2 rounded-full bg-[#E1E5EA]" />
      <span className="w-2 h-2 rounded-full bg-[#E1E5EA]" />
      <span className="w-2 h-2 rounded-full bg-[#E1E5EA]" />
      <span className="ml-2 text-[10px] font-medium text-[#8E98A6] truncate">vaseeshop.cz — produkt</span>
    </div>

    <div className="p-4 sm:p-5">
      {/* produktová karta */}
      <div className="flex gap-3 pb-4 border-b border-[#EEF1F4]">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-gradient-to-br from-[#F1F4F7] to-[#E8EBEF] shrink-0 flex items-center justify-center">
          <ShoppingBag className="w-7 h-7 text-[#B0B8C2]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#12161C] leading-snug">Prémiový produkt</p>
          <p className="text-[12px] text-[#8E98A6] mt-0.5">1 990 Kč</p>
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#FFF1DF] border border-[#FFD9A6] px-2.5 py-1">
            <CoinBadge size={14} />
            <span className="text-[11px] font-bold text-[#C96A00]">+15 MioCoinů za tento nákup</span>
          </span>
        </div>
      </div>

      {/* košík */}
      <div className="pt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-[#5B6572]" />
          <span className="text-[13px] text-[#5B6572]">Košík · 2 položky</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFF6EA] border border-[#FFD9A6] px-2.5 py-1.5">
          <CoinBadge size={14} />
          <span className="text-[12px] font-bold text-[#7A4A00]">Za tuto objednávku získáte 23 MioCoinů.</span>
        </span>
      </div>
    </div>
  </div>
);

const PRIZE_CATEGORIES = [
  { icon: Car, label: 'Sportovní auto' },
  { icon: Watch, label: 'Prémiové hodinky' },
  { icon: Smartphone, label: 'Smartphone' },
  { icon: Plane, label: 'Cestování' },
];

/** Generický "svět soutěží" — jen kategorie cen, žádné konkrétní neschválené
 * značky (viz docs/advertising/GENERALIZATION_RULES.md — konkrétní název jen
 * u schváleného, potvrzeného briefu). Světlá karta, ne tmavý panel — má
 * stát vedle světlého e-shop mockupu jako rovnocenný, ne kontrastní blok. */
const PrizeWorldPanel: React.FC = () => (
  <div className="h-full rounded-2xl bg-gradient-to-br from-[#FFF8EE] to-white border border-[#FFE3BC] p-5 sm:p-6">
    <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-[#C96A00] mb-4">Svět soutěží OneMil</p>
    <div className="grid grid-cols-2 gap-3">
      {PRIZE_CATEGORIES.map(({ icon: Icon, label }) => (
        <div
          key={label}
          className="rounded-xl bg-white border border-[#F0DDC3] shadow-[0_1px_2px_rgba(16,23,34,0.03)] p-3.5 flex flex-col items-center text-center gap-2"
        >
          <span className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#FF8A00] to-[#FFB547] flex items-center justify-center">
            <Icon className="w-5 h-5 text-white" />
          </span>
          <span className="text-[12px] font-semibold text-[#12161C] leading-snug">{label}</span>
        </div>
      ))}
    </div>
  </div>
);

/* --- Sekce 5: "100 000 → 500" wow moment ----------------------------------- */

/** Hoisted na module scope záměrně — komponenta definovaná uvnitř render těla
 * `WowFlow` by na každý re-render (např. při tiku count-up animace) dostala
 * nový function reference, React by ji vyhodnotil jako jiný typ, remountnul
 * by span s `ref` a odpojil by tím IntersectionObserver dřív, než mohl
 * kdy zaznamenat viditelnost — animace by tak zůstala navždy na 0. */
/** Jeden řádek "fintech ledger" — obří číslo vlevo, popisek vpravo,
 * propojené tenkou vertikální linkou (ne kartička s borderem všude). */
const WowRow: React.FC<{
  big: string;
  small: string;
  size: string;
  muted?: boolean;
  countRef?: React.Ref<HTMLSpanElement>;
  isLast?: boolean;
}> = ({ big, small, size, muted, countRef, isLast }) => (
  <div className="relative pl-8 sm:pl-12">
    {!isLast && <div className="absolute left-[3px] sm:left-[5px] top-3 bottom-[-1.75rem] w-px bg-white/15" aria-hidden="true" />}
    <div className="absolute left-0 top-2 w-[7px] h-[7px] sm:w-[11px] sm:h-[11px] rounded-full bg-[#FF8A00]" aria-hidden="true" />
    <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-6 pb-7">
      <p className={`font-heading font-extrabold leading-none tabular-nums ${size} ${muted ? 'text-white' : 'text-[#FFB547]'}`}>
        <span ref={countRef}>{big}</span>
      </p>
      <p className="text-[12px] sm:text-sm font-semibold tracking-[0.1em] uppercase text-[#8E98A6] shrink-0">{small}</p>
    </div>
  </div>
);

const WowFlow: React.FC = () => {
  const distributed = useCountUp(WOW_DISTRIBUTED_MC);
  const used = useCountUp(WOW_USED_MC);
  const billed = useCountUp(WOW_BILLED_CZK);

  return (
    <div>
      <WowRow
        big={cz(distributed.value)}
        small="MioCoinů rozdáno"
        size="text-5xl sm:text-7xl lg:text-8xl"
        muted
        countRef={distributed.ref}
      />
      <WowRow
        big={cz(used.value)}
        small="MioCoinů zákazníci využili"
        size="text-4xl sm:text-6xl lg:text-7xl"
        muted
        countRef={used.ref}
      />
      <WowRow
        big={`${cz(billed.value)} Kč`}
        small="účtujeme + DPH"
        size="text-3xl sm:text-5xl lg:text-6xl"
        countRef={billed.ref}
        isLast
      />

      <div className="mt-12 sm:mt-16 pt-10 border-t border-white/10 text-center">
        <p className="font-heading text-4xl sm:text-6xl md:text-[4.2rem] font-extrabold leading-[1.02] text-white">
          {cz(WOW_UNUSED_MC)} <span className="text-[#FFB547]">= 0 Kč</span>
        </p>
        <p className="mt-2 text-[12px] sm:text-[13px] font-semibold tracking-[0.14em] uppercase text-[#8E98A6]">
          nevyužitých MioCoinů
        </p>
        <p className="mt-6 max-w-xl mx-auto font-heading text-lg sm:text-xl font-bold text-white leading-snug">
          Ne. Fakt vám nepošleme účet za něco, co vaši zákazníci nevyužili.
        </p>
        <p className="mt-4 text-[11.5px] text-[#7C8590]">Ilustrativní příklad — reálné hodnoty závisí na vašem nastavení a objemu objednávek.</p>
      </div>
    </div>
  );
};

/* --- stránka ---------------------------------------------------------------- */

const PartnerEshopLanding: React.FC = () => {
  // Zachovej případný obchodnický/affiliate kód z reklamy (?via=KOD), aby se
  // atribuce nezahodila při přechodu na existující partnerskou registraci.
  const [searchParams] = useSearchParams();
  const via = (searchParams.get('via') || '').trim();
  const registerHref = via ? `/partner/register?via=${encodeURIComponent(via)}` : '/partner/register';
  const affiliateHref = via ? `/affiliate/register?via=${encodeURIComponent(via)}` : '/affiliate/register';

  const ctaPrimary =
    'inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-heading text-sm sm:text-[15px] font-bold tracking-wide text-white bg-gradient-to-r from-[#FF8A00] to-[#FFA333] shadow-[0_10px_24px_-10px_rgba(255,138,0,0.75)] hover:from-[#F07F00] hover:to-[#FF9A1F] transition-colors';
  const ctaSecondary =
    'inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-heading text-sm sm:text-[15px] font-semibold text-[#12161C] bg-white border border-[#DDE2E8] hover:border-[#C6CCD4] transition-colors';
  const ctaOnDark =
    'inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-heading text-sm sm:text-[15px] font-bold tracking-wide text-[#0A0B0F] bg-gradient-to-r from-white to-[#E7EBF0] hover:from-[#F3F5F7] hover:to-white transition-colors';

  // Pozice na škále 0,5–100 MC v log měřítku (lineární by 0,5/5/20 zmáčklo k sobě).
  const rewardTiers: Array<{ mc: number; label: string; pct: number }> = [
    { mc: 0.5, label: 'Začínáme opatrně.', pct: 0 },
    { mc: 5, label: 'Běžná odměna.', pct: 43.5 },
    { mc: 20, label: 'Dnes zákazníka potěšíme víc.', pct: 69.6 },
    { mc: 100, label: 'Máme speciální akci.', pct: 100 },
  ];

  const trialRows: Array<[number, number]> = [
    [2, 0],
    [5, 3],
    [20, 18],
  ];

  const showMoreCards = [
    {
      icon: Ticket,
      title: 'VOUCHERY',
      text: 'Máte speciální nabídku? Vložte svůj voucher do OneMil a nabídněte ho našim zákazníkům.',
      badge: 'ZDARMA PRO PARTNERY',
    },
    {
      icon: Tag,
      title: 'KUPÓNY',
      text: 'Chcete zákazníkovi dát důvod vrátit se? Nabídněte v OneMil vlastní kupón nebo zvýhodnění.',
      badge: 'ZDARMA PRO PARTNERY',
    },
    {
      icon: Sparkles,
      title: 'SPECIÁLNÍ NABÍDKY',
      text: 'Máte akci, nový produkt nebo něco, co stojí za pozornost? Představte svou nabídku zákazníkům OneMil.',
      badge: 'ZDARMA PRO PARTNERY',
    },
    {
      icon: Megaphone,
      title: 'SOUTĚŽE A SOCIÁLNÍ SÍTĚ',
      text: 'Zajímavé produkty partnerů můžeme zapojovat do soutěží OneMil a společných kampaní. Propagaci na sociálních sítích řešíme individuálně podle konkrétní akce a po vzájemné domluvě.',
      badge: 'PODLE DOMLUVY',
    },
  ];

  const partnershipFlow = [
    { q: 'Má náš partner vhodný produkt?', a: 'Může být hlavní cenou.' },
    { q: 'Nehodí se jako hlavní?', a: 'Může být bonusovou cenou.' },
    { q: 'Má zajímavý voucher?', a: 'Můžeme ho nabídnout zákazníkům.' },
    { q: 'Má produkt, který potřebuje ukázat?', a: 'Pojďme vymyslet, jak ho dostat mezi lidi.' },
  ];

  const creatorFlow = ['VÁŠ PRODUKT', 'SOUTĚŽ', 'VOUCHER', 'MIOCOIN AKCE', 'SOCIÁLNÍ SÍTĚ', 'NOVÍ ZÁKAZNÍCI'];

  return (
    <div className="min-h-screen bg-[#F6F7F9] font-body text-[#12161C] overflow-x-hidden">
      <Helmet>
        <title>OneMil pro e-shopy — dejte zákazníkům důvod nakoupit právě u vás</title>
        <meta
          name="description"
          content="Za nákup u vás získají MioCoiny. S nimi se mohou zapojit do soutěží OneMil o prémiové ceny. Platíte jen za skutečně využité MioCoiny — 0 Kč zapojení, 0 Kč nastavení."
        />
      </Helmet>

      {/* ================= Header ================= */}
      <header className="sticky top-0 z-40 bg-[#F6F7F9]/85 backdrop-blur-md border-b border-[#E8EBEF]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 sm:h-[72px] flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 shrink-0" aria-label="OneMil">
            <span className="rounded-xl bg-[#0A0B0F] p-1.5 sm:p-2 shadow-[0_6px_18px_-10px_rgba(16,23,34,0.5)]">
              <img src={logo} alt="OneMil logo" className="h-7 sm:h-9 w-auto object-contain rounded-md" />
            </span>
            <span className="hidden sm:inline text-[11px] font-semibold tracking-[0.18em] uppercase text-[#8E98A6]">
              Pro e-shopy
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <a href="#jak-to-funguje" className="hidden md:inline text-sm font-medium text-[#5B6572] hover:text-[#12161C] transition-colors">
              Jak to funguje
            </a>
            <a href="#partnerstvi" className="hidden md:inline text-sm font-medium text-[#5B6572] hover:text-[#12161C] transition-colors">
              Partnerství
            </a>
            <Link
              to={registerHref}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 sm:px-4 py-2 text-[13px] font-heading font-bold text-white bg-gradient-to-r from-[#FF8A00] to-[#FFA333] hover:from-[#F07F00] hover:to-[#FF9A1F] transition-colors"
            >
              Registrace
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ================= 3. HERO ================= */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(1300px_560px_at_82%_-10%,rgba(255,138,0,0.12),transparent_62%)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-14 sm:py-20 lg:py-24">
          <div className="grid lg:grid-cols-[1fr_1.15fr] gap-12 lg:gap-8 items-center">
            <Reveal>
              <p className="text-xs font-semibold tracking-[0.24em] uppercase text-[#FF8A00]">Pro e-shopy, prodejny a značky</p>
              <h1 className="mt-5 font-heading text-[2.5rem] leading-[1.04] sm:text-[3.4rem] lg:text-[4rem] font-extrabold text-[#12161C] max-w-[13ch] tracking-tight">
                Dejte zákazníkům důvod nakoupit u vás.
              </h1>
              <p className="mt-6 text-base sm:text-lg text-[#5B6572] leading-relaxed max-w-md">
                Za nákup u vás získají MioCoiny. S nimi se mohou zapojit do soutěží OneMil o prémiové ceny.
              </p>
              <p className="mt-5 font-heading text-lg sm:text-xl font-bold text-[#12161C] max-w-md leading-snug border-l-2 border-[#FF8A00] pl-4">
                Stejný nákup. Stejná cena. Ale u vás dostane zákazník něco navíc.
              </p>

              <div className="mt-9 flex flex-col sm:flex-row gap-3">
                <Link to={registerHref} className={ctaPrimary}>
                  CHCI ONEMIL PRO SVOU FIRMU
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <a href="#jak-to-funguje" className={ctaSecondary}>
                  Jak to funguje
                </a>
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
                {['0 Kč zapojení', '0 Kč nastavení', 'Platíte jen využité MioCoiny'].map((p) => (
                  <span key={p} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#39424E]">
                    <span className="w-4 h-4 rounded-full bg-[#FFF1DF] flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 text-[#C96A00]" strokeWidth={3.5} />
                    </span>
                    {p}
                  </span>
                ))}
              </div>
            </Reveal>

            <Reveal delayMs={150}>
              <HeroVisual />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= Zahajovací akce teaser (krátký, detail v sekci 7) === */}
      {SHOW_TRIAL_CARD && (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-4 sm:pb-8">
          <Reveal className="rounded-2xl border border-[#FFD9A6] bg-gradient-to-br from-[#FFF8EE] to-[#FFF1DF] p-5 sm:p-6 flex items-center gap-4">
            <span className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-[#FF8A00] to-[#FFB547] flex items-center justify-center shadow-[0_10px_22px_-12px_rgba(255,138,0,0.9)]">
              <Sparkles className="w-5.5 h-5.5 text-white" />
            </span>
            <p className="text-[14px] sm:text-[15px] text-[#7A4A00] leading-snug">
              <strong className="font-heading">Prvních {TRIAL_DAYS} dní</strong> hradí OneMil první {TRIAL_FREE_MC_PER_REWARD} MioCoiny
              z každé aktivované odměny. <a href="#trial-detail" className="underline underline-offset-2">Jak to funguje ↓</a>
            </p>
          </Reveal>
        </section>
      )}

      {/* ================= 4. UKAŽ, CO VIDÍ ZÁKAZNÍK ================= */}
      <section id="jak-to-funguje" className="scroll-mt-20 mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20">
        <Reveal>
          <SectionTitle eyebrow="Pohled zákazníka" title="Z obyčejného nákupu může být začátek něčeho většího." />
        </Reveal>
        <div className="mt-10 grid lg:grid-cols-2 gap-6 items-stretch">
          <Reveal>
            <CustomerShopMockup />
          </Reveal>
          <Reveal delayMs={150}>
            <PrizeWorldPanel />
          </Reveal>
        </div>
        <Reveal delayMs={250}>
          <p className="mt-8 text-center font-heading text-lg sm:text-xl font-bold text-[#12161C] max-w-2xl mx-auto leading-snug">
            Stejný produkt. Stejná cena. Ale u vás dostane zákazník něco navíc.
          </p>
        </Reveal>
      </section>

      {/* ================= 5. "100 000 → 500" WOW MOMENT (dark) ================= */}
      <section className="bg-[#0A0B0F] py-14 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <Reveal>
            <SectionTitle
              dark
              eyebrow="Kolik to reálně stojí"
              title="Rozdáte 100 000 MioCoinů. Kolik zaplatíte?"
            />
          </Reveal>
          <Reveal delayMs={150} className="mt-10">
            <WowFlow />
          </Reveal>
        </div>
      </section>

      {/* ================= 6. PARTNER URČUJE ODMĚNU — horizontální škála ================= */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
        <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-10 lg:gap-16 items-center">
          <Reveal>
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[#FF8A00]">Vaše pravidla</p>
            <h2 className="mt-4 font-heading text-3xl sm:text-[2.6rem] font-extrabold text-[#12161C] leading-[1.05]">
              Vaše odměna.
              <br />
              Vaše pravidla.
            </h2>
            <p className="mt-5 text-base text-[#5B6572] leading-relaxed max-w-sm">
              Od opatrného startu po speciální akci — o výši odměny vždy rozhodujete vy. Kdykoliv ji můžete změnit.
            </p>
            <p className="mt-6 font-heading text-xl font-extrabold text-[#12161C]">„Já rozhoduji."</p>
          </Reveal>

          <Reveal delayMs={150}>
            <div className="relative h-[220px] sm:h-[240px] mx-2 sm:mx-4">
              {/* track */}
              <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-gradient-to-r from-[#FFE3BC] via-[#FFB547] to-[#FF8A00]" />
              {rewardTiers.map(({ mc, label, pct }, i) => {
                const above = i % 2 === 0;
                return (
                  <div key={mc} className="absolute top-1/2 -translate-y-1/2" style={{ left: `${pct}%` }}>
                    <div
                      className={`absolute left-1/2 -translate-x-1/2 w-px bg-[#DDE2E8] ${
                        above ? 'bottom-[6px] h-[38px] sm:h-[44px]' : 'top-[6px] h-[38px] sm:h-[44px]'
                      }`}
                    />
                    <div
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-[3px] border-[#FF8A00] shadow-[0_2px_8px_rgba(255,138,0,0.35)] -translate-x-1/2"
                    />
                    <div
                      className={`absolute left-1/2 -translate-x-1/2 w-[110px] sm:w-[140px] text-center ${
                        above ? 'bottom-[52px] sm:bottom-[58px]' : 'top-[52px] sm:top-[58px]'
                      } ${i === 0 ? '!left-0 !translate-x-0 text-left' : ''} ${
                        i === rewardTiers.length - 1 ? '!left-auto !right-0 !translate-x-0 text-right' : ''
                      }`}
                    >
                      <p className="font-heading text-2xl sm:text-3xl font-extrabold text-[#12161C] leading-none">
                        {mc.toLocaleString('cs-CZ')} MC
                      </p>
                      <p className="mt-1.5 text-[11.5px] sm:text-[12.5px] text-[#8E98A6] leading-snug">{label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= 7. PRVNÍCH 30 DNÍ (orange premium block) ================= */}
      {SHOW_TRIAL_CARD && (
        <section id="trial-detail" className="scroll-mt-20 bg-gradient-to-br from-[#FF8A00] to-[#FFB547] py-14 sm:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <Reveal>
              <p className="text-xs font-semibold tracking-[0.22em] uppercase text-[#3D2200]/70 text-center">Prvních {TRIAL_DAYS} dní</p>
              <h2 className="mt-3 font-heading text-2xl sm:text-4xl font-extrabold text-[#1A0F00] text-center leading-tight max-w-2xl mx-auto">
                Do každé objednávky vám dáme {TRIAL_FREE_MC_PER_REWARD} MioCoiny zdarma.
              </h2>
            </Reveal>

            <Reveal delayMs={150} className="mt-10 grid sm:grid-cols-3 gap-4">
              {trialRows.map(([set, you]) => (
                <div key={set} className="rounded-2xl bg-white/90 backdrop-blur-sm p-5 text-center shadow-[0_16px_40px_-24px_rgba(26,15,0,0.5)]">
                  <p className="text-[11px] font-bold tracking-widest uppercase text-[#8E98A6]">Nastavíte</p>
                  <p className="font-heading text-2xl font-extrabold text-[#12161C]">{set} MC</p>
                  <div className="my-2.5 h-px bg-[#EEF1F4]" />
                  <p className="text-[12px] text-[#5B6572]">{TRIAL_FREE_MC_PER_REWARD} MC dá OneMil</p>
                  <p className="mt-1 font-heading text-lg font-bold text-[#C96A00]">Vy = {you} MC</p>
                </div>
              ))}
            </Reveal>

            <Reveal delayMs={300}>
              <p className="mt-8 text-center text-[15px] sm:text-base font-semibold text-[#1A0F00]/90 max-w-xl mx-auto leading-relaxed">
                Platíte až tam, kde zákazník svoji odměnu skutečně využije.
              </p>
              <p className="mt-2 text-center text-[13px] text-[#3D2200]/70">
                První {TRIAL_FREE_MC_PER_REWARD} MioCoiny jdou {TRIAL_DAYS} dní za námi.
              </p>
            </Reveal>
          </div>
        </section>
      )}

      {/* ================= 8. +15 MC PRO NOVÉHO ZÁKAZNÍKA (feature-gated) ===== */}
      {SHOW_PARTNER_15MC_CARD && (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <Reveal>
              <p className="text-xs font-semibold tracking-[0.18em] uppercase text-[#FF8A00]">Na náš účet</p>
              <h2 className="mt-3 font-heading text-2xl sm:text-[2.1rem] font-extrabold text-[#12161C] leading-tight">
                Dárek pro vaše nové zákazníky. Na náš účet.
              </h2>
              <p className="mt-4 text-[15px] text-[#5B6572] leading-relaxed">
                Nový zákazník, který se do OneMil poprvé zaregistruje přes váš obchod, získá od OneMil{' '}
                {NEW_CUSTOMER_BONUS_MC} MioCoinů navíc.
              </p>
              <p className="mt-3 text-[13.5px] text-[#8E98A6] leading-relaxed">
                Další benefit spojený s vaším obchodem. Náklad jde za OneMil.
              </p>
            </Reveal>
            <Reveal delayMs={150}>
              <Card className="p-8 sm:p-10 text-center">
                <CoinBadge size={56} className="mx-auto" />
                <p className="mt-4 font-heading text-4xl sm:text-5xl font-extrabold text-[#12161C]">
                  +{NEW_CUSTOMER_BONUS_MC} MioCoinů
                </p>
              </Card>
            </Reveal>
          </div>
        </section>
      )}

      {/* ================= 9. PARTNER MŮŽE ONEMIL PROPAGOVAT U SEBE — vrstvený mockup, ne 3 boxy ================= */}
      <section className="bg-white border-y border-[#E8EBEF]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
          <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-12 lg:gap-16 items-center">
            <Reveal>
              <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[#FF8A00]">Ukažte to</p>
              <h2 className="mt-4 font-heading text-3xl sm:text-[2.4rem] font-extrabold text-[#12161C] leading-[1.08]">
                A hlavně: ukažte zákazníkům, co u vás dostanou navíc.
              </h2>
              <p className="mt-5 text-base text-[#5B6572] leading-relaxed max-w-sm">
                Na homepage, u produktu, v košíku, v newsletteru, na sociálních sítích i na bannerech — kdekoliv, kde
                to dává smysl. Benefit žije přímo uvnitř vašeho e-shopu.
              </p>
            </Reveal>

            {/* Jeden vrstvený "device stack" — homepage banner uvnitř browseru,
             * s produktovou a košíkovou kartou plovoucí navrch jako reálné
             * UI snippety, ne tři oddělené stejné boxy. */}
            <Reveal delayMs={150}>
              <div className="relative pb-10 pr-6 sm:pb-14 sm:pr-10">
                <div className="rounded-2xl bg-white border border-[#E8EBEF] shadow-[0_1px_2px_rgba(16,23,34,0.04),0_40px_80px_-32px_rgba(16,23,34,0.26)] overflow-hidden">
                  <div className="flex items-center gap-1.5 px-3.5 py-2.5 bg-[#F1F4F7] border-b border-[#E8EBEF]">
                    <span className="w-2 h-2 rounded-full bg-[#E1E5EA]" />
                    <span className="w-2 h-2 rounded-full bg-[#E1E5EA]" />
                    <span className="w-2 h-2 rounded-full bg-[#E1E5EA]" />
                    <span className="ml-1.5 flex-1 rounded-md bg-white border border-[#E8EBEF] px-2.5 py-1 text-[10px] text-[#8E98A6] truncate">
                      vaseeshop.cz
                    </span>
                  </div>

                  {/* homepage banner uvnitř mockupu */}
                  <PremiumVisualPanel variant="show" className="p-6 sm:p-8">
                    <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#8E98A6] mb-2">Banner na homepage</p>
                    <p className="font-heading text-xl sm:text-2xl font-bold text-white leading-snug max-w-[26ch]">
                      S námi můžete zažít víc.
                    </p>
                    <p className="mt-2 text-[13px] text-[#BFC6CF] leading-relaxed max-w-[38ch]">
                      Nakupte. Získejte MioCoiny. A zapojte se s námi do soutěží OneMil.
                    </p>
                  </PremiumVisualPanel>

                  <div className="p-5 sm:p-6 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#F1F4F7] to-[#E8EBEF] flex items-center justify-center shrink-0">
                      <ShoppingBag className="w-5 h-5 text-[#B0B8C2]" />
                    </div>
                    <p className="text-[13px] text-[#5B6572]">Prémiový produkt · 1 990 Kč</p>
                  </div>
                </div>

                {/* plovoucí produktová karta */}
                <div className="absolute -top-6 -left-4 sm:-left-8 rounded-xl bg-[#0A0B0F] shadow-[0_20px_44px_-16px_rgba(10,11,15,0.5)] px-3.5 py-2.5 flex items-center gap-2 max-w-[200px]" style={{ transform: 'rotate(-4deg)' }}>
                  <CoinBadge size={16} />
                  <p className="text-[11px] font-semibold text-white leading-snug">Za tento nákup získáte 15 MioCoinů.</p>
                </div>

                {/* plovoucí košíková karta */}
                <div className="absolute bottom-2 -right-2 sm:right-0 rounded-xl bg-white border border-[#FFD9A6] shadow-[0_20px_44px_-16px_rgba(16,23,34,0.3)] px-3.5 py-2.5 flex items-center gap-2 max-w-[210px]" style={{ transform: 'rotate(3deg)' }}>
                  <CoinBadge size={16} />
                  <p className="text-[11px] font-bold text-[#7A4A00] leading-snug">Za tuto objednávku získáte 34 MioCoinů.</p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================= 10. PRÉMIOVÉ CENY — editorial poster, ne bento grid ================= */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <SectionTitle
              eyebrow="Prémiové ceny"
              title="S námi se mohou zapojit do soutěží o opravdu velké věci."
              lead="MioCoiny získané u vás mohou využít v soutěžích OneMil o prémiové ceny."
            />
          </Reveal>
        </div>

        {/* Hlavní cena — světlá karta ve stejném jazyce jako zbytek stránky
         * (bílá/cream, tenký border, měkký stín, oranžová ikona-badge).
         * Vizuálně nejsilnější díky velikosti karty a typografii, ne díky
         * těžké dekoraci nebo tmavému/černému bloku. */}
        <Reveal delayMs={150} className="mt-12 mx-auto max-w-6xl px-4 sm:px-6">
          <div className="rounded-[28px] bg-gradient-to-br from-[#FFFBF3] to-white border border-[#F0DEC0] shadow-[0_1px_2px_rgba(16,23,34,0.04),0_32px_64px_-36px_rgba(201,106,0,0.22)] px-7 py-8 sm:px-12 sm:py-11 flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-10">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[#FFE9C7] to-[#FFD79A] flex items-center justify-center shrink-0">
              <Car className="w-7 h-7 sm:w-9 sm:h-9 text-[#8A4B00]" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[#C96A00]">Hlavní cena</p>
              <p className="mt-2 font-heading text-3xl sm:text-4xl font-extrabold text-[#12161C] leading-tight tracking-tight">
                Sportovní auto
              </p>
              <p className="mt-3 text-[14px] sm:text-[15px] text-[#5B6572] leading-relaxed max-w-[46ch]">
                Jedna z hlavních cen, o kterou se zákazníci mohou v soutěžích OneMil ucházet.
              </p>
            </div>
          </div>
        </Reveal>

        {/* Vedlejší kategorie — tři lehké karty stejného vizuálního jazyka
         * jako hlavní karta (bílá, border-[#E8EBEF], jemný stín, ikona-badge). */}
        <Reveal delayMs={250} className="mt-4 sm:mt-5 mx-auto max-w-6xl px-4 sm:px-6 grid sm:grid-cols-3 gap-4 sm:gap-5">
          {PRIZE_CATEGORIES.slice(1).map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="rounded-2xl bg-white border border-[#E8EBEF] shadow-[0_1px_2px_rgba(16,23,34,0.04),0_20px_40px_-28px_rgba(16,23,34,0.18)] px-6 py-6 flex items-center gap-4"
            >
              <span className="w-11 h-11 shrink-0 rounded-xl bg-[#FFF1DF] flex items-center justify-center">
                <Icon className="w-5 h-5 text-[#C96A00]" strokeWidth={1.5} />
              </span>
              <p className="font-heading text-lg sm:text-xl font-bold text-[#12161C]">{label}</p>
            </div>
          ))}
        </Reveal>

        <Reveal delayMs={300} className="mt-6 flex items-center justify-center gap-2.5 mx-4">
          <CoinBadge size={18} />
          <p className="text-[13px] font-semibold text-[#8E98A6]">MioCoiny → zapojení do soutěže → šance na výhru</p>
        </Reveal>
      </section>

      {/* ================= 11. A TO JEŠTĚ NENÍ VŠECHNO (dark) ================= */}
      <section className="bg-[#0A0B0F] py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <SectionTitle
              dark
              eyebrow="A to ještě není vše"
              title="Mysleli jste, že tím končíme? Teprve začínáme."
            />
            <p className="mt-4 text-center font-heading text-lg sm:text-xl font-bold text-white">
              A většinu z toho máte jako partner OneMil zdarma.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {showMoreCards.map(({ icon: Icon, title, text, badge }, i) => (
              <Reveal key={title} delayMs={i * 100}>
                <div className="h-full rounded-2xl bg-white/[0.04] border border-white/10 p-5 hover:bg-white/[0.06] transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <span className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#FF8A00] to-[#FFB547] flex items-center justify-center">
                      <Icon className="w-5 h-5 text-white" />
                    </span>
                    <span className="shrink-0 rounded-full bg-[#FF8A00]/15 border border-[#FF8A00]/30 px-2 py-1 text-[9px] font-bold tracking-wide text-[#FFB547] text-right">
                      {badge}
                    </span>
                  </div>
                  <h3 className="mt-3.5 font-heading text-[13px] font-bold tracking-wide text-[#FFB547]">{title}</h3>
                  <p className="mt-1.5 text-[13.5px] text-[#BFC6CF] leading-relaxed">{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delayMs={450}>
            <p className="mt-8 text-center text-[13px] text-[#BFC6CF] max-w-2xl mx-auto leading-relaxed">
              Vouchery, kupóny a speciální nabídky mohou partneři OneMil prezentovat zdarma. Propagaci na sociálních
              sítích a individuální kampaně domlouváme podle konkrétní spolupráce.
            </p>
            <p className="mt-2 text-center text-[11.5px] text-[#7C8590] max-w-2xl mx-auto leading-relaxed">
              Při mimořádně vysokém zájmu může OneMil rozsah bezplatných partnerských ploch organizačně upravit.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ================= 12. PARTNERSTVÍ PODLE NÁS — dvě velké poloviny ================= */}
      <section id="partnerstvi" className="scroll-mt-20 mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[#FF8A00] text-center">Partnerství podle nás</p>
          <h2 className="mt-3 font-heading text-3xl sm:text-5xl font-extrabold text-[#12161C] text-center leading-tight max-w-2xl mx-auto">
            Vy ukazujete OneMil.
            <br />
            My ukazujeme vás.
          </h2>
        </Reveal>

        <Reveal delayMs={150} className="mt-14 relative grid sm:grid-cols-2 gap-10 sm:gap-0">
          <div className="sm:pr-12 sm:text-right">
            <p className="font-heading text-5xl sm:text-6xl font-extrabold text-[#12161C] leading-none">VY</p>
            <p className="mt-4 text-[13px] font-semibold tracking-[0.14em] uppercase text-[#8E98A6]">co u vás najdeme</p>
            <ul className="mt-6 space-y-3 sm:flex sm:flex-col sm:items-end">
              {partnershipFlow.map(({ q }) => (
                <li key={q} className="text-[14.5px] text-[#5B6572] leading-snug">{q}</li>
              ))}
            </ul>
          </div>

          <div className="hidden sm:flex absolute left-1/2 top-2 bottom-2 -translate-x-1/2 items-center">
            <div className="h-full w-px bg-[#E8EBEF]" />
            <span className="absolute w-10 h-10 rounded-full bg-white border border-[#E8EBEF] shadow-[0_4px_16px_rgba(16,23,34,0.08)] flex items-center justify-center">
              <ArrowRight className="w-4 h-4 text-[#FF8A00]" />
            </span>
          </div>

          <div className="sm:pl-12">
            <p className="font-heading text-5xl sm:text-6xl font-extrabold text-[#FF8A00] leading-none">ONEMIL</p>
            <p className="mt-4 text-[13px] font-semibold tracking-[0.14em] uppercase text-[#8E98A6]">co s tím uděláme</p>
            <ul className="mt-6 space-y-3">
              {partnershipFlow.map(({ a }) => (
                <li key={a} className="text-[14.5px] font-semibold text-[#12161C] leading-snug">{a}</li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal delayMs={400}>
          <div className="mt-10 rounded-3xl bg-[#0A0B0F] p-8 sm:p-12 text-center">
            <p className="font-heading text-xl sm:text-3xl font-extrabold text-white leading-snug max-w-3xl mx-auto">
              Když vhodný produkt nabízí náš partner, proč bychom ho kupovali jinde?
            </p>
            <p className="mt-4 text-[14px] sm:text-[15px] text-[#BFC6CF] max-w-2xl mx-auto leading-relaxed">
              Pokud produkt, který potřebujeme pro soutěž nebo kampaň, nabízí některý z našich partnerů, chceme ho
              přednostně nakoupit právě u něj.
            </p>
            <p className="mt-4 text-[13px] text-[#7C8590] italic">
              Tak trochu „já na bráchu, brácha na mě". Jen jsme tomu dali hezčí logo.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ================= 13. MALÉ ZNAČKY A TVŮRCI ================= */}
      <section className="bg-white border-y border-[#E8EBEF]">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-14 sm:py-20 text-center">
          <Reveal>
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[#FF8A00]">Malé značky a tvůrci</p>
            <h2 className="mt-3 font-heading text-2xl sm:text-4xl font-extrabold text-[#12161C] leading-tight">
              Jste malí? Pojďme udělat trochu hluku.
            </h2>
            <p className="mt-4 max-w-xl mx-auto text-[15px] text-[#5B6572] leading-relaxed">
              Vyrábíte vlastní produkt? Budujete novou značku? Máte něco skvělého, o čem zatím skoro nikdo neví?
            </p>
            <p className="mt-6 font-heading text-3xl sm:text-4xl font-extrabold text-[#FF8A00] tracking-wide">
              OZVĚTE SE.
            </p>
            <p className="mt-4 max-w-xl mx-auto text-[14px] text-[#8E98A6] leading-relaxed">
              Nemusíte mít obrovský marketingový rozpočet. Pokud bude spolupráce dávat smysl oběma stranám, pojďme
              společně hledat cestu, jak váš produkt dostat k novým zákazníkům.
            </p>
          </Reveal>

          <Reveal delayMs={200} className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
            {creatorFlow.map((label, i) => (
              <React.Fragment key={label}>
                <span className="rounded-full bg-[#FFF1DF] border border-[#FFD9A6] px-4 py-2 text-[12px] font-bold tracking-wide text-[#C96A00]">
                  {label}
                </span>
                {i < creatorFlow.length - 1 && <ArrowRight className="w-4 h-4 text-[#B0B8C2]" />}
              </React.Fragment>
            ))}
          </Reveal>

          <Reveal delayMs={350}>
            <p className="mt-10 font-heading text-lg sm:text-xl font-bold text-[#12161C] leading-snug">
              Vy máte produkt. My máme nápady, soutěže a zákazníky. Tak to spojme.
            </p>
            <div className="mt-6">
              <a href="mailto:eshop@onemil.cz" className={ctaSecondary}>
                Chci probrat spolupráci
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= 14. PARTNERSKÁ PROVIZE ================= */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-14 sm:py-20 text-center">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[#FF8A00]">Ještě jedna věc…</p>
          <h2 className="mt-3 font-heading text-2xl sm:text-3xl font-extrabold text-[#12161C] leading-tight">
            Partnerství může přinášet hodnotu i dlouhodobě.
          </h2>
          <p className="mt-4 max-w-2xl mx-auto text-[15px] text-[#5B6572] leading-relaxed">
            Pokud pomůžete propojit OneMil s dalším e-shopem nebo firmou a ze spolupráce vznikne reálná aktivita,
            může to pro vás dlouhodobě znamenat víc než jednorázový benefit. Přesné podmínky probereme individuálně.
          </p>
          <div className="mt-6">
            <Link to={affiliateHref} className={ctaSecondary}>
              Zjistit více
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ================= 15. OBCHODNÍ PARTNER ================= */}
      <section className="bg-[#F1F4F7] border-y border-[#E8EBEF]">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-14 sm:py-20 text-center">
          <Reveal>
            <span className="inline-flex w-12 h-12 rounded-xl bg-[#0A0B0F] items-center justify-center mb-5">
              <Handshake className="w-6 h-6 text-[#FFB547]" />
            </span>
            <h2 className="font-heading text-2xl sm:text-3xl font-extrabold text-[#12161C] leading-tight">
              Nemáte e-shop? Ale znáte někoho, kdo ho má?
            </h2>
            <p className="mt-3 font-heading text-lg font-bold text-[#5B6572]">
              Tak možná nehledáme zákazníka. Možná hledáme vás.
            </p>
            <p className="mt-4 max-w-xl mx-auto text-[15px] text-[#5B6572] leading-relaxed">
              Pokud dokážete OneMil propojovat s firmami, e-shopy a prodejnami, máme pro vás samostatný program
              obchodní spolupráce.
            </p>
            <div className="mt-7">
              <Link to={affiliateHref} className={ctaPrimary}>
                CHCI SPOLUPRACOVAT JAKO OBCHODNÍ PARTNER
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= Napojení e-shopu — zachovaný technický obsah ================= */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <span className="w-11 h-11 shrink-0 rounded-xl bg-[#F1F4F7] flex items-center justify-center">
              <Key className="w-5 h-5 text-[#5B6572]" />
            </span>
            <p className="text-[14px] text-[#5B6572] leading-relaxed">
              <strong className="text-[#12161C] font-semibold">Technické napojení je jednoduché.</strong> Máte Shoptet?
              Propojení připravíme a otestujeme společně s vámi — MioCoiny se pak přidělují k objednávkám automaticky.
              Máte vlastní vývojáře nebo jinou platformu? Objednávky lze posílat přímo přes OneMil Partner API. Napište
              nám na{' '}
              <a href="mailto:eshop@onemil.cz" className="font-semibold text-[#C96A00] hover:underline">
                eshop@onemil.cz
              </a>
              .
            </p>
          </div>
        </Card>
        <p className="mt-4 text-[12px] text-[#8E98A6] leading-relaxed">
          Shoptet je název platformy třetí strany a slouží pouze k označení podporovaného způsobu napojení e-shopu.
          Nejedná se o oznámení partnerství, sponzoringu ani oficiální spolupráce.
        </p>
      </section>

      {/* ================= 16. FINÁLE ================= */}
      <section className="relative overflow-hidden bg-[#0A0B0F]">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(900px_500px_at_50%_0%,rgba(255,138,0,0.14),transparent_65%)]" />
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-24 text-center">
          <Reveal>
            <p className="font-heading text-xl sm:text-2xl font-bold text-[#E7EBF0] leading-snug">
              Vaši zákazníci už nakupují.
            </p>
            <p className="mt-1 font-heading text-xl sm:text-2xl font-bold text-[#E7EBF0] leading-snug">
              Tak jim dejte důvod, aby příště nakoupili zase u vás.
            </p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
              {['MioCoiny', 'Prémiové soutěže', 'Vouchery', 'Kampaně', 'Partnerská spolupráce'].map((w) => (
                <span key={w} className="rounded-full bg-white/[0.06] border border-white/10 px-3.5 py-1.5 text-[12.5px] font-medium text-[#BFC6CF]">
                  {w}
                </span>
              ))}
            </div>

            <p className="mt-10 font-heading text-4xl sm:text-6xl font-extrabold bg-gradient-to-r from-[#FF8A00] to-[#FFB547] bg-clip-text text-transparent">
              START 0 KČ
            </p>

            <div className="mt-8 flex justify-center">
              <Link to={registerHref} className={ctaOnDark}>
                JDU DO TOHO
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <p className="mt-4 text-[12px] text-[#7C8590]">
              Registrace trvá pár minut. Zapojení a nastavení připravíme společně s vámi.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ================= Patička ================= */}
      <footer className="bg-[#F6F7F9] border-t border-[#E8EBEF]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="rounded-lg bg-[#0A0B0F] p-1.5">
            <img src={logo} alt="OneMil logo" className="h-7 w-auto object-contain rounded" />
          </span>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-[#5B6572]">
            <Link to="/vop" className="hover:text-[#12161C] transition-colors">
              Obchodní podmínky
            </Link>
            <Link to="/gdpr" className="hover:text-[#12161C] transition-colors">
              Ochrana osobních údajů
            </Link>
            <Link to="/kontakt" className="hover:text-[#12161C] transition-colors">
              Kontakt
            </Link>
            <Link to="/partner/login" className="hover:text-[#12161C] transition-colors">
              Přihlášení partnera
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PartnerEshopLanding;
