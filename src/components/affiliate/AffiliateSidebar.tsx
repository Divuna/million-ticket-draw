import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Megaphone, Briefcase, User, MessageCircle, LogOut, X, Star, TrendingUp } from 'lucide-react';

/**
 * Affiliate/Influencer portal sidebar — navigation only.
 *
 * "Influencer" / "Obchodník" / "Profil" do exactly what the old horizontal
 * ModeSwitcher pills did: write the SAME localStorage key
 * ('affiliate_active_mode') AffiliateDashboard.tsx already reads on mount, and
 * either call the dashboard's own onSwitchMode (when already on the dashboard,
 * for an instant switch with no reload) or navigate to /affiliate/dashboard
 * (when coming from Zprávy) so the dashboard's existing mount-time
 * localStorage read picks it up — no new persistence mechanism.
 *
 * "Zprávy" points at the existing /influencer/messages route, unchanged.
 *
 * The bottom "Tento měsíc" panel renders the SAME currentMonthCzk figure the
 * dashboard already computes from affiliate_commissions (previously shown in
 * the topbar) — no new data source, just moved/re-styled to match the
 * reference layout's use of the lower sidebar for real account info.
 */

const STORAGE_KEY = 'affiliate_active_mode';
type ActiveMode = 'influencer' | 'sales_rep' | 'profile';

interface NavItem {
  key: ActiveMode | 'messages';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'influencer', label: 'Influencer', icon: Megaphone },
  { key: 'sales_rep', label: 'Obchodník', icon: Briefcase },
  { key: 'profile', label: 'Profil', icon: User },
  { key: 'messages', label: 'Zprávy', icon: MessageCircle },
];

interface AffiliateSidebarProps {
  /** Current mode when on /affiliate/dashboard; undefined on other pages (e.g. Zprávy). */
  activeMode?: ActiveMode;
  /** Present only on /affiliate/dashboard — switches mode in place, no navigation/reload. */
  onSwitchMode?: (mode: ActiveMode) => void;
  /** Same figure the dashboard already computes; not shown on Profil/Zprávy. */
  currentMonthCzk?: number;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const czk = (n: number) =>
  `${(n ?? 0).toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Kč`;

const SidebarContent: React.FC<{
  activeMode?: ActiveMode;
  onSwitchMode?: (mode: ActiveMode) => void;
  currentMonthCzk?: number;
  onLogout: () => void;
  onNavigate?: () => void;
}> = ({ activeMode, onSwitchMode, currentMonthCzk, onLogout, onNavigate }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const onMessagesPage = location.pathname === '/influencer/messages';

  const handleModeClick = (mode: ActiveMode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    if (onSwitchMode) {
      onSwitchMode(mode);
    } else {
      navigate('/affiliate/dashboard');
    }
    onNavigate?.();
  };

  const handleMessagesClick = () => {
    navigate('/influencer/messages');
    onNavigate?.();
  };

  const showMonthCard = typeof currentMonthCzk === 'number' && !onMessagesPage && activeMode !== 'profile';

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--sidebar-background))]">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[hsl(var(--sidebar-border))]">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
          style={{ background: 'linear-gradient(135deg, hsl(243 75% 59%), hsl(262 80% 62%))' }}
        >
          <Star className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[hsl(var(--sidebar-foreground))] truncate">OneMil</p>
          <p className="text-[11px] text-[hsl(var(--text-muted-gray))] truncate">Affiliate portál</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5" data-testid="mode-switcher">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.key === 'messages' ? onMessagesPage : !onMessagesPage && activeMode === item.key;
          // Preserves the exact data-testid values existing Playwright specs
          // (26, 27, 28, 35) already click/assert on for the mode buttons — the
          // old horizontal pills used the same "mode-btn-<key>" names.
          const testId = item.key === 'messages' ? 'affiliate-sidebar-messages' : `mode-btn-${item.key}`;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => (item.key === 'messages' ? handleMessagesClick() : handleModeClick(item.key))}
              data-testid={testId}
              aria-pressed={active}
              className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all text-left ${
                active
                  ? 'text-[hsl(var(--sidebar-accent-foreground))] shadow-sm'
                  : 'text-[hsl(var(--sidebar-foreground))]/75 hover:bg-[hsl(var(--sidebar-accent))]/50 hover:text-[hsl(var(--sidebar-foreground))]'
              }`}
              style={
                active
                  ? { background: 'linear-gradient(135deg, hsl(243 65% 95%), hsl(258 70% 95%))' }
                  : undefined
              }
            >
              <span
                className={`flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 transition-colors ${
                  active ? '' : 'bg-[hsl(var(--muted)/0.6)]'
                }`}
                style={active ? { background: 'linear-gradient(135deg, hsl(243 75% 59%), hsl(262 80% 62%))' } : undefined}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-[hsl(var(--text-muted-gray))]'}`} />
              </span>
              <span className="truncate">{item.label}</span>
              {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))]" />}
            </button>
          );
        })}
      </nav>

      {showMonthCard && (
        <div className="px-3 pb-3">
          <div
            className="relative overflow-hidden rounded-2xl p-4 text-white shadow-sm"
            style={{ background: 'linear-gradient(140deg, hsl(243 75% 59%), hsl(258 80% 55%) 55%, hsl(262 80% 62%))' }}
          >
            <div
              className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-20"
              style={{ background: 'radial-gradient(circle, white, transparent 70%)' }}
              aria-hidden="true"
            />
            <div className="relative flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-white/75">
              <TrendingUp className="w-3.5 h-3.5" />
              Tento měsíc
            </div>
            <p className="relative text-2xl font-extrabold tabular-nums mt-1">{czk(currentMonthCzk!)}</p>
          </div>
        </div>
      )}

      <div className="border-t border-[hsl(var(--sidebar-border))] p-3">
        <Button variant="outline" size="sm" className="w-full justify-start gap-2 rounded-xl" onClick={onLogout}>
          <LogOut className="w-4 h-4" />
          Odhlásit se
        </Button>
      </div>
    </div>
  );
};

export const AffiliateSidebar: React.FC<AffiliateSidebarProps> = ({
  activeMode,
  onSwitchMode,
  currentMonthCzk,
  onLogout,
  mobileOpen,
  onCloseMobile,
}) => {
  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:block lg:w-64 lg:flex-shrink-0 lg:border-r lg:border-[hsl(var(--sidebar-border))]">
        <div className="lg:fixed lg:top-0 lg:left-0 lg:h-screen lg:w-64">
          <SidebarContent
            activeMode={activeMode}
            onSwitchMode={onSwitchMode}
            currentMonthCzk={currentMonthCzk}
            onLogout={onLogout}
          />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[70]">
          <div className="absolute inset-0 bg-black/40" onClick={onCloseMobile} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">
            <div className="relative h-full">
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Zavřít menu"
                className="absolute top-4 right-3 z-10 w-8 h-8 rounded-full bg-[hsl(var(--muted))] flex items-center justify-center"
              >
                <X className="w-4 h-4 text-[hsl(var(--foreground))]" />
              </button>
              <SidebarContent
                activeMode={activeMode}
                onSwitchMode={onSwitchMode}
                currentMonthCzk={currentMonthCzk}
                onLogout={onLogout}
                onNavigate={onCloseMobile}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
