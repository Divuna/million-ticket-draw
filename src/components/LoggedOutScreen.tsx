import { useNavigate, useLocation } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import logoOnemil from '@/assets/logo-onemil.png';
import { buildLoginRedirectUrl } from '@/lib/loginRedirect';
import { usePartners } from '@/hooks/usePartners';

// Fixed scatter positions for floating partner logos.
// Spread around screen edges/corners, avoiding the center card area.
const FLOAT_POSITIONS = [
  { left: '6%',  top: '20%' },
  { left: '80%', top: '16%' },
  { left: '10%', top: '60%' },
  { left: '76%', top: '56%' },
  { left: '48%', top: '7%'  },
  { left: '22%', top: '80%' },
  { left: '87%', top: '40%' },
  { left: '3%',  top: '42%' },
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
      style={{ background: 'linear-gradient(160deg, hsl(220,30%,5%) 0%, hsl(220,25%,7%) 50%, hsl(220,30%,5%) 100%)' }}
    >
      {/* Subtle ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 15%, rgba(255,138,0,0.06) 0%, transparent 70%)',
        }}
      />

      {/* Starfield noise */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(1.5px 1.5px at 12% 18%, rgba(255,181,71,0.10) 50%, transparent 100%),
            radial-gradient(1px 1px at 28% 44%, rgba(255,138,0,0.08) 50%, transparent 100%),
            radial-gradient(1.5px 1.5px at 50% 12%, rgba(255,181,71,0.11) 50%, transparent 100%),
            radial-gradient(1px 1px at 72% 55%, rgba(255,138,0,0.08) 50%, transparent 100%),
            radial-gradient(1.5px 1.5px at 88% 28%, rgba(255,181,71,0.10) 50%, transparent 100%),
            radial-gradient(1px 1px at 35% 78%, rgba(255,138,0,0.07) 50%, transparent 100%),
            radial-gradient(1px 1px at 65% 82%, rgba(255,181,71,0.09) 50%, transparent 100%),
            radial-gradient(1.5px 1.5px at 8% 62%, rgba(255,138,0,0.08) 50%, transparent 100%),
            radial-gradient(1px 1px at 92% 70%, rgba(255,181,71,0.09) 50%, transparent 100%)
          `,
        }}
      />

      {/* Floating partner logos — background layer, pointer-events disabled */}
      {partners.map((partner, i) => {
        const pos = FLOAT_POSITIONS[i % FLOAT_POSITIONS.length];
        const anim = FLOAT_ANIMS[i % FLOAT_ANIMS.length];
        const duration = 22 + (i % 4) * 4; // 22 / 26 / 30 / 34s
        const delay = -(i * 5);             // stagger start mid-animation
        return (
          <img
            key={partner.id}
            src={partner.logo_url}
            alt={partner.name}
            title={partner.name}
            className="absolute pointer-events-none select-none object-contain"
            style={{
              left: pos.left,
              top: pos.top,
              height: '28px',
              maxWidth: '80px',
              opacity: 0.13,
              filter: 'grayscale(1) brightness(1.7) blur(0.4px)',
              animation: `${anim} ${duration}s ease-in-out infinite`,
              animationDelay: `${delay}s`,
              zIndex: 1,
            }}
          />
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
