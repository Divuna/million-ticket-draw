import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

type Item = {
  key: string;
  media: string;
  kicker: string;
  title: string;
  teaser: string;
  body: string[];
};

const ITEMS: Item[] = [
  {
    key: 'villa',
    media: '/brand/coming-soon/villa',
    kicker: 'Nemovitost',
    title: 'Vila v Thajsku',
    teaser: 'Tvůj druhý domov přes zimu – u moře, mezi palmami.',
    body: [
      'Soutěž o nemovitost v Thajsku připravujeme velmi pečlivě.',
      'Aby taková soutěž dávala smysl, potřebujeme dostatečný počet soutěžících – na tom teď intenzivně pracujeme.',
      'Zároveň ověřujeme vše, co s takovou výhrou souvisí. Nemovitost v zahraničí není jen o ceně: patří k ní pravidla, správa, servis i náklady na vlastnictví.',
      'Nechceme jen vystavit krásnou výhru. Chceme vybrat nemovitost, která bude výherci přínosem i do budoucna – ideálně i se zajištěnou správou, servisem a případně nájemním modelem, aby s ní měl co nejméně starostí a výhra ho ničím nezatížila.',
      'Jakmile bude vše připravené a ověřené, zveřejníme přesné podmínky.',
    ],
  },
  {
    key: 'lambo',
    media: '/brand/coming-soon/lambo',
    kicker: 'Supersport',
    title: 'Lamborghini Huracán',
    teaser: 'Splň si dětský sen – zvuk, energie a čistá emoce.',
    body: [
      'Lamborghini není jen auto. Je to zážitek, zvuk a energie, které se nedají popsat slovy – auto, které budí pozornost dřív, než ho uvidíš.',
      'U soutěže této velikosti potřebujeme větší komunitu soutěžících, a proto teď OneMil intenzivně rozšiřujeme. Zároveň ladíme podmínky tak, aby výhra byla bezpečná a výherce ničím nezatížila.',
      'Pomoct můžeš i ty: sdílej OneMil s přáteli a použij svůj pozvánkový kód. Čím víc nás bude, tím dřív takové soutěže spustíme.',
    ],
  },
  {
    key: 'watch',
    media: '/brand/coming-soon/watch',
    kicker: 'Hodinky',
    title: 'Rolex Daytona',
    teaser: 'Jen to TOP – hodinky, které nestárnou.',
    body: [
      'Luxusní hodinky nejsou jen doplněk. Jsou to přesnost, charakter a tichý symbol výjimečnosti – věc s vlastním příběhem, která dělá radost každý den.',
      'Právě takové ceny chceme v OneMil přinášet: nejen velké a okázalé výhry, ale i věci, které mají hodnotu a osobnost.',
      'Abychom mohli podobné soutěže spouštět častěji, rozšiřujeme naši komunitu. Každé sdílení a každé pozvání přátel nám pomáhá připravit další soutěž.',
    ],
  },
];

const DISCLAIMER =
  'Obrázky a videa jsou ilustrační vizualizace vytvořené pro představu. Skutečná výhra a přesné podmínky budou uvedeny v pravidlech soutěže při jejím spuštění.';

function ShowcaseCard({ item, index, motion, onOpen }: { item: Item; index: number; motion: boolean; onOpen: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => { if (visible) setShown(true); }, [visible]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (visible) { v.muted = true; void v.play().catch(() => undefined); } else { v.pause(); }
  }, [visible]);

  return (
    <article
      ref={ref}
      className={`om-cs-card ${shown ? 'is-in' : ''}`}
      style={{ transitionDelay: `${index * 120}ms` }}
    >
      <div className="om-cs-frame">
        <img className="om-cs-media" src={`${item.media}.jpg`} alt="" aria-hidden="true" loading="lazy" />
        {motion && (
          <video ref={videoRef} className="om-cs-media" muted loop playsInline preload="none" poster={`${item.media}.jpg`} aria-hidden="true">
            <source src={`${item.media}.webm`} type="video/webm" />
            <source src={`${item.media}.mp4`} type="video/mp4" />
          </video>
        )}
        <div className="om-cs-shade" aria-hidden="true" />
        <div className="om-cs-sweep" aria-hidden="true" />

        <div className="om-cs-top">
          <span className="om-cs-status"><span className="om-cs-dot" aria-hidden="true" />Ve fázi příprav</span>
          <span className="om-cs-illu">Ilustrační vizualizace</span>
        </div>

        <div className="om-cs-body">
          <span className="om-cs-kicker">{item.kicker}</span>
          <h4 className="om-cs-title">{item.title}</h4>
          <p className="om-cs-teaser">{item.teaser}</p>
          <button type="button" className="om-cs-more" onClick={onOpen}>
            Co chystáme
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </article>
  );
}

/** Sekce „Připravujeme“ s videi – výchozí obsah, když admin nemá vlastní karty. */
export function ComingSoonShowcase() {
  const [motion, setMotion] = useState(false);
  const [open, setOpen] = useState<Item | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    setMotion(!reduce && !conn?.saveData);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <p className="om-cs-intro">
        Chystáme soutěže o opravdu velké výhry. U takových cen ladíme každý detail – pravidla, bezpečné předání
        a hlavně to, aby výhra výherce ničím nezatížila. Spustíme je, až bude všechno připravené.
      </p>
      <div className="om-cs-grid">
        {ITEMS.map((item, i) => (
          <ShowcaseCard key={item.key} item={item} index={i} motion={motion} onOpen={() => setOpen(item)} />
        ))}
      </div>
      <p className="om-cs-disclaimer">{DISCLAIMER}</p>

      {open && (
        <div className="om-cs-modal" role="dialog" aria-modal="true" aria-labelledby="om-cs-modal-title" onClick={() => setOpen(null)}>
          <div className="om-cs-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="om-cs-modal-media">
              <img src={`${open.media}.jpg`} alt="" aria-hidden="true" />
              <span className="om-cs-illu">Ilustrační vizualizace</span>
            </div>
            <button type="button" className="om-cs-close" onClick={() => setOpen(null)} aria-label="Zavřít">
              <X className="h-4 w-4" />
            </button>
            <div className="om-cs-modal-body">
              <span className="om-cs-status"><span className="om-cs-dot" aria-hidden="true" />Ve fázi příprav</span>
              <h3 id="om-cs-modal-title" className="om-cs-modal-title">{open.title}</h3>
              {open.body.map((p) => <p key={p}>{p}</p>)}
              <p className="om-cs-modal-note">{DISCLAIMER}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ComingSoonShowcase;
