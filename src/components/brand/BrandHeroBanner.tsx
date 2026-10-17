import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, House, Laptop, Watch, ShoppingBag, Plane, Gift } from 'lucide-react';
import logo from '@/assets/redesign/onemil-logo.png';
import avatarMio from '@/assets/redesign/avatar/avatar-drzi-mio.png';

const MotorbikeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="5" cy="16" r="3" />
    <circle cx="19" cy="16" r="3" />
    <path d="M8 16h5l3-6h3M12 9h3l1.5 1M7.5 12.5 10 9h2" />
  </svg>
);

const CATEGORIES = [
  { icon: Car, title: 'Sportovní vozy', sub: 'Supersporty a kabriolety' },
  { icon: House, title: 'Nemovitosti', sub: 'Luxusní bydlení' },
  { icon: Laptop, title: 'Elektronika', sub: 'Telefony a notebooky' },
  { icon: Watch, title: 'Prémiové hodinky', sub: 'Zlaté i sportovní' },
  { icon: ShoppingBag, title: 'Luxusní móda', sub: 'Kabelky a doplňky' },
  { icon: MotorbikeIcon, title: 'Motorky', sub: 'Prémiové modely' },
  { icon: Plane, title: 'Dovolené', sub: 'Vysněné destinace' },
  { icon: Gift, title: 'A další výhry', sub: 'MIO, vouchery a další' },
];

/**
 * Obecný úvodní banner OneMil (varianta 3): video pozadí z Google Flow + logo, nadpis,
 * avatar a pás kategorií výher v kódu. Zobrazuje se, když admin nemá nastavený vlastní
 * hlavní banner. Při omezeném pohybu nebo úspoře dat zůstane jen statický snímek.
 */
export function BrandHeroBanner() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playVideo, setPlayVideo] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches);

  useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 639px)");
    if (!mq) return;
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const base = isMobile ? "/brand/hero/onemil-hero-mobile" : "/brand/hero/onemil-hero";
  const poster = `${base}-poster.jpg`;

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    setPlayVideo(!reduce && !conn?.saveData);
  }, []);

  useEffect(() => {
    if (!playVideo) return;
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    void v.play().catch(() => undefined);
  }, [playVideo, base]);

  return (
    <section className="om-hero" aria-labelledby="om-hero-title">
      <div className="om-hero-stage">
        <img className="om-hero-media" src={poster} alt="" aria-hidden="true" />
        {playVideo && (
          <video
            key={base}
            ref={videoRef}
            className="om-hero-media"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={poster}
            aria-hidden="true"
          >
            <source src={`${base}.webm`} type="video/webm" />
            <source src={`${base}.mp4`} type="video/mp4" />
          </video>
        )}
        <div className="om-hero-veil" aria-hidden="true" />
        <div className="om-hero-sweep" aria-hidden="true" />

        <div className="om-hero-copy">
          <img src={logo} alt="OneMil" className="om-hero-logo" />
          <h1 id="om-hero-title" className="om-hero-title">
            Luxusní soutěže. <span>Prémiové výhry.</span>
          </h1>
          <div className="om-hero-ctas">
            <button
              type="button"
              className="om-hero-cta"
              onClick={() => document.getElementById('partneri')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Nakupuj u partnerů – MIO získáš jako odměnu
            </button>
            <button type="button" className="om-hero-cta om-hero-cta-dark" onClick={() => navigate('/top-up')}>
              Nechceš čekat? Dobij si MIO
            </button>
          </div>
          <p className="om-hero-note">MIO použiješ na tikety do soutěží.</p>
        </div>

        <img src={avatarMio} alt="" aria-hidden="true" className="om-hero-avatar" />
      </div>

      <ul className="om-hero-cats" aria-label="Co můžeš vyhrát">
        {CATEGORIES.map(({ icon: Icon, title, sub }, i) => (
          <li key={title} className="om-hero-cat" style={{ animationDelay: `${0.35 + i * 0.08}s` }}>
            <span className="om-hero-cat-ic"><Icon aria-hidden="true" /></span>
            <span className="om-hero-cat-txt">
              <strong>{title}</strong>
              <span>{sub}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default BrandHeroBanner;
