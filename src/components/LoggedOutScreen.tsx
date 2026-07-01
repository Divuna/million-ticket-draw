import { useNavigate, useLocation } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import logoOnemil from '@/assets/logo-onemil.png';
import { buildLoginRedirectUrl } from '@/lib/loginRedirect';
import { usePartners } from '@/hooks/usePartners';

// Positions near (but not overlapping) the center card area.
// Framing the card on all four sides so logos are visible without blocking content.
const FLOAT_POSITIONS = [
  { left: '16%', top: '24%' },   // upper-left near card
  { left: '70%', top: '20%' },   // upper-right near card
  { left: '14%', top: '62%' },   // lower-left near card
  { left: '72%', top: '64%' },   // lower-right near card
  { left: '44%', top: '7%'  },   // top-center above card
  { left: '18%', top: '44%' },   // left of card mid
  { left: '74%', top: '44%' },   // right of card mid
  { left: '43%', top: '84%' },   // below card
];

// Four calm drift variants — assigned by index % 4
const FLOAT_ANIMS = [
  'partner-float-a',
  'partner-float-b',
  'partner-float-c',
  'partner-float-d',
];


const ROUTE_MESSAGES: Record<string, string> = {
  '/vouchers':
    'Děkujeme, že používáte OneMil. Těšíme se, až se vrátíte. Připravujeme nové vouchery a partnerské nabídky, které vás potěší.',
  '/messages':
    'Děkujeme, že jste byli s námi. Vaše zprávy na vás budou čekat, až se znovu přihlásíte.',
  '/wins':
    'Děkujeme, že hrajete s OneMil. Vaše výhry a odměny budou dostupné po přihlášení.',
  '/games':
    'Děkujeme, že používáte OneMil. Až se vrátíte, budou na vás čekat nové soutěže a další šance na zajímavé výhry.',
};

export const LoggedOutScreen = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { partners } = usePartners();

  const message =
    ROUTE_MESSAGES[pathname] ??
    'Děkujeme, že používáte OneMil. Pro pokračování se prosím přihlaste.';

  const handleLogin = () => {
    navigate(buildLoginRedirectUrl(pathname));
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden pb-24"
      style={{
        background:
          'linear-gradient(180deg, #ffffff 0%, #ffffff 50%, #f8f1e7 66%, #e1d5c6 78%, #b9afa3 91%, #8f8a82 100%)',
      }}
    >
      {/* Soft champagne ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 45% at 50% 12%, rgba(255,181,71,0.10) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 50% 95%, rgba(200,155,80,0.10) 0%, transparent 70%)',
        }}
      />


      {/* Floating partner logos — each approved partner appears exactly once */}
      {partners.map((partner, i) => {
        const pos      = FLOAT_POSITIONS[i % FLOAT_POSITIONS.length];
        const anim     = FLOAT_ANIMS[i % FLOAT_ANIMS.length];
        const duration = 22 + (i % 4) * 4;  // 22 / 26 / 30 / 34 s
        const delay    = -(i * 6);           // stagger start mid-cycle
        return (
          <div
            key={partner.id}
            className="absolute pointer-events-none select-none flex items-center justify-center"
            style={{
              left: pos.left,
              top: pos.top,
              zIndex: 1,
              borderRadius: '10px',
              padding: '8px 14px',
              background: 'rgba(255,255,255,0.85)',
              boxShadow:
                '0 2px 14px rgba(180,130,60,0.14), inset 0 1px 0 rgba(255,255,255,0.9), 0 0 0 1px rgba(200,155,80,0.18)',
              animation: `${anim} ${duration}s ease-in-out infinite`,
              animationDelay: `${delay}s`,
            }}
          >
            <img
              src={partner.logo_url}
              alt={partner.name}
              title={partner.name}
              className="object-contain block"
              style={{
                height: '72px',
                maxWidth: '160px',
                opacity: 0.82,
                filter: 'none',
              }}
            />

          </div>
        );
      })}

      <Header />

      {/* Centered card */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-5 py-12">
        <div
          className="w-full max-w-md flex flex-col items-center gap-8 rounded-2xl p-8 md:p-10"
          style={{
            background: 'hsl(220 40% 7%)',
            border: '1px solid rgba(255,138,0,0.15)',
            boxShadow:
              '0 4px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,181,71,0.06)',
          }}
        >
          {/* Logo — dark pill backdrop + layered amber glow for contrast */}
          <div
            className="flex items-center justify-center rounded-2xl px-8 py-5"
            style={{
              background: 'radial-gradient(ellipse 90% 80% at 50% 50%, rgba(255,138,0,0.07) 0%, rgba(10,11,15,0.55) 60%, rgba(10,11,15,0.80) 100%)',
              boxShadow:
                '0 0 0 1px rgba(255,138,0,0.10), 0 0 24px 4px rgba(255,138,0,0.08), inset 0 1px 0 rgba(255,181,71,0.08)',
            }}
          >
            <img
              src={logoOnemil}
              alt="OneMil"
              className="h-20 md:h-24 w-auto object-contain"
              style={{
                filter:
                  'drop-shadow(0 0 8px rgba(255,138,0,0.55)) drop-shadow(0 0 22px rgba(255,181,71,0.30)) drop-shadow(0 2px 4px rgba(0,0,0,0.60))',
              }}
            />
          </div>

          {/* Divider line */}
          <div
            className="w-16 h-px"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(255,138,0,0.5), transparent)',
            }}
          />

          {/* Heading */}
          <h2
            className="text-2xl md:text-3xl font-bold text-center leading-tight"
            style={{
              fontFamily: "'Poppins', system-ui, sans-serif",
              background: 'linear-gradient(90deg, #E7EBF0 0%, #FFB547 55%, #FF8A00 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Děkujeme
          </h2>

          {/* Route-specific message */}
          <p
            className="text-center text-sm md:text-base leading-relaxed"
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              color: '#8E98A6',
              maxWidth: '320px',
            }}
          >
            {message}
          </p>

          {/* CTA button */}
          <Button
            onClick={handleLogin}
            className="w-full h-12 text-base font-semibold rounded-xl transition-all duration-200 hover:brightness-110 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(255,138,0,0.4)]"
            style={{
              fontFamily: "'Poppins', system-ui, sans-serif",
              background: 'linear-gradient(90deg, #FF8A00 0%, #FFB547 100%)',
              color: '#0A0B0F',
              border: 'none',
              boxShadow: '0 2px 12px rgba(255,138,0,0.25)',
            }}
          >
            Přihlásit se
          </Button>
        </div>
      </div>
    </div>
  );
};
