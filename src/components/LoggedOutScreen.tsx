import { useNavigate, useLocation } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import logoOnemil from '@/assets/logo-onemil.png';
import { buildLoginRedirectUrl } from '@/lib/loginRedirect';

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
          {/* Logo */}
          <img
            src={logoOnemil}
            alt="OneMil"
            className="h-14 w-auto object-contain"
            style={{ filter: 'drop-shadow(0 0 12px rgba(255,138,0,0.18))' }}
          />

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
