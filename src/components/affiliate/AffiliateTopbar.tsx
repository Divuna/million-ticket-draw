import React from 'react';
import { Menu } from 'lucide-react';

type ActiveMode = 'influencer' | 'sales_rep' | 'profile';

interface AffiliateTopbarProps {
  /** undefined on /influencer/messages (no mode concept there). */
  activeMode?: ActiveMode;
  onOpenMobileMenu: () => void;
}

const MODE_TITLES: Record<ActiveMode, string> = {
  influencer: 'Influencer',
  sales_rep: 'Obchodník',
  profile: 'Profil',
};

const MODE_SUBTITLES: Record<ActiveMode, string> = {
  influencer: 'Přehled odkazu, statistik a provizí',
  sales_rep: 'Přehled firem, žádostí a provizí',
  profile: 'Fakturační a výplatní údaje',
};

export const AffiliateTopbar: React.FC<AffiliateTopbarProps> = ({ activeMode, onOpenMobileMenu }) => {
  const title = activeMode ? MODE_TITLES[activeMode] : 'Zprávy';
  const subtitle = activeMode ? MODE_SUBTITLES[activeMode] : 'Komunikace s týmem OneMil';

  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/85 backdrop-blur px-4 py-4 sm:px-6">
      <button
        type="button"
        onClick={onOpenMobileMenu}
        aria-label="Otevřít menu"
        className="lg:hidden -ml-1 w-9 h-9 rounded-lg flex items-center justify-center text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
      >
        <Menu className="w-5 h-5" />
      </button>
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[hsl(var(--foreground))] truncate">{title}</h1>
        <p className="text-xs sm:text-sm text-[hsl(var(--text-muted-gray))] truncate">{subtitle}</p>
      </div>
    </header>
  );
};
