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
    <div className="customer-auth-shell min-h-screen relative overflow-hidden pb-24">
      {/* Soft champagne ambient glow */}
      <div className="customer-auth-ambient absolute inset-0 pointer-events-none" />
      <div className="customer-auth-grain absolute inset-0 pointer-events-none" />


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
              background: 'rgba(66,55,43,0.36)',
              boxShadow:
                '0 10px 28px rgba(103,70,33,0.18), inset 0 1px 0 rgba(255,244,226,0.16), 0 0 0 1px rgba(190,132,58,0.14)',
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
                opacity: 0.68,
                filter: 'none',
              }}
            />

          </div>
        );
      })}

      <Header />

      {/* Centered card */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-5 py-12">
        <div className="w-full max-w-md">
          <img
            src={logoOnemil}
            alt="OneMil"
            className="customer-auth-logo h-16 w-auto mx-auto mb-4 object-contain onemil-logo-animated"
          />

          <div
            className="customer-auth-card w-full flex flex-col items-center gap-8 rounded-[20px] p-8 md:p-10"
            style={{
              background: 'linear-gradient(180deg, rgba(48,43,39,0.96) 0%, rgba(33,31,29,0.98) 100%)',
              border: '2px solid rgba(255,181,71,0.18)',
              boxShadow:
                '0 34px 90px rgba(112,75,32,0.34), 0 14px 34px rgba(54,42,31,0.22), inset 0 1px 0 rgba(255,244,226,0.08)',
            }}
          >
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
              background: 'linear-gradient(90deg, #FFF7EA 0%, #FFB547 55%, #FF8A00 100%)',
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
              color: '#D7CEC2',
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
    </div>
  );
};
