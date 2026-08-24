import React from 'react';
import { Menu } from 'lucide-react';

type ActiveMode = 'influencer' | 'sales_rep' | 'profile';

interface AffiliateTopbarProps {
  /** undefined on /influencer/messages (no mode concept there). */
  activeMode?: ActiveMode;
  /** "Tento měsíc" figure — same currentMonthCzk value AffiliateDashboard already
   *  computes from affiliate_commissions; not shown on Profil or Zprávy, exactly
   *  like the old hero box only showed it outside activeMode === 'profile'. */
  currentMonthCzk?: number;
  onOpenMobileMenu: () => void;
}

const MODE_TITLES: Record<ActiveMode, string> = {
  influencer: 'Influencer',
  sales_rep: 'Obchodník',
  profile: 'Profil',
};

const czk = (n: number) =>
  `${(n ?? 0).toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Kč`;

export const AffiliateTopbar: React.FC<AffiliateTopbarProps> = ({
  activeMode,
  currentMonthCzk,
  onOpenMobileMenu,
}) => {
  const title = activeMode ? MODE_TITLES[activeMode] : 'Zprávy';

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/90 backdrop-blur px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Otevřít menu"
          className="lg:hidden -ml-1 w-9 h-9 rounded-lg flex items-center justify-center text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-base sm:text-lg font-semibold text-[hsl(var(--foreground))] truncate">{title}</h1>
      </div>
      {typeof currentMonthCzk === 'number' && activeMode !== 'profile' && (
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted-gray))]">Tento měsíc</p>
          <p className="text-lg font-bold tabular-nums text-[hsl(var(--primary))]">{czk(currentMonthCzk)}</p>
        </div>
      )}
    </header>
  );
};
