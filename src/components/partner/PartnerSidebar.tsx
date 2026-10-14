import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Rocket,
  Coins,
  SlidersHorizontal,
  Receipt,
  MessageCircle,
  BookOpen,
  LogOut,
  Building2,
  X,
} from 'lucide-react';

/**
 * Partner portal sidebar — navigation only. Every entry below points at a route
 * or an anchor that already exists in the app; nothing here creates a new page
 * or a new capability. See src/pages/PartnerDashboard.tsx for the #prehled,
 * #shoptet, #miocoiny and #nastaveni anchors, and src/App.tsx (CUSTOMER_BLOCKED_
 * ROUTES / route table) for /partner/invoices, /partner/messages, /partner/navody.
 */

interface NavItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
  /** True for routes matched by exact pathname; anchors are matched by pathname + hash. */
  isAnchor?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'prehled', label: 'Přehled', icon: LayoutDashboard, to: '/partner/dashboard#prehled', isAnchor: true },
  { key: 'shoptet', label: 'Napojení e-shopu', icon: Rocket, to: '/partner/dashboard#shoptet', isAnchor: true },
  { key: 'miocoiny', label: 'MioCoiny', icon: Coins, to: '/partner/dashboard#miocoiny', isAnchor: true },
  { key: 'nastaveni', label: 'Nastavení', icon: SlidersHorizontal, to: '/partner/dashboard#nastaveni', isAnchor: true },
  { key: 'invoices', label: 'Faktury', icon: Receipt, to: '/partner/invoices' },
  { key: 'messages', label: 'Zprávy', icon: MessageCircle, to: '/partner/messages' },
  { key: 'guides', label: 'Návody', icon: BookOpen, to: '/partner/navody' },
];

interface PartnerSidebarProps {
  partnerName: string | null;
  partnerLogoUrl: string | null;
  onLogout: () => void;
  /** Mobile drawer visibility; ignored on desktop where the sidebar is always shown. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

function isNavItemActive(item: NavItem, pathname: string, hash: string): boolean {
  if (item.isAnchor) {
    if (pathname !== '/partner/dashboard') return false;
    // On the dashboard itself (no hash yet, e.g. right after login) "Přehled" reads active.
    if (!hash) return item.key === 'prehled';
    return hash === `#${item.key}`;
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

const SidebarContent: React.FC<{
  partnerName: string | null;
  partnerLogoUrl: string | null;
  onLogout: () => void;
  onNavigate?: () => void;
}> = ({ partnerName, partnerLogoUrl, onLogout, onNavigate }) => {
  const location = useLocation();

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--sidebar-background))]">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-[hsl(var(--sidebar-border))]">
        <div className="w-9 h-9 rounded-xl bg-[hsl(var(--primary))] flex items-center justify-center flex-shrink-0">
          <Building2 className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[hsl(var(--sidebar-foreground))] truncate">OneMil</p>
          <p className="text-[11px] text-[hsl(var(--text-muted-gray))] truncate">Partnerský portál</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isNavItemActive(item, location.pathname, location.hash);
          return (
            <Link
              key={item.key}
              to={item.to}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-accent-foreground))]'
                  : 'text-[hsl(var(--sidebar-foreground))]/80 hover:bg-[hsl(var(--sidebar-accent))]/60 hover:text-[hsl(var(--sidebar-foreground))]'
              }`}
            >
              <Icon className={`w-4.5 h-4.5 flex-shrink-0 ${active ? 'text-[hsl(var(--sidebar-primary))]' : 'opacity-70'}`} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[hsl(var(--sidebar-border))] p-3 space-y-3">
        <div className="flex items-center gap-2.5 px-2">
          <div className="w-8 h-8 rounded-full bg-[hsl(var(--muted))] flex items-center justify-center overflow-hidden flex-shrink-0">
            {partnerLogoUrl ? (
              <img src={partnerLogoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Building2 className="w-4 h-4 text-[hsl(var(--text-muted-gray))]" />
            )}
          </div>
          <p className="text-xs font-medium text-[hsl(var(--sidebar-foreground))] truncate">
            {partnerName || 'Partner'}
          </p>
        </div>
        <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={onLogout}>
          <LogOut className="w-4 h-4" />
          Odhlásit se
        </Button>
      </div>
    </div>
  );
};

/** Desktop: fixed sidebar column. Mobile: slide-over drawer, toggled by the topbar. */
export const PartnerSidebar: React.FC<PartnerSidebarProps> = ({
  partnerName,
  partnerLogoUrl,
  onLogout,
  mobileOpen,
  onCloseMobile,
}) => {
  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:block lg:w-64 lg:flex-shrink-0 lg:border-r lg:border-[hsl(var(--sidebar-border))]">
        <div className="lg:fixed lg:top-0 lg:left-0 lg:h-screen lg:w-64">
          <SidebarContent partnerName={partnerName} partnerLogoUrl={partnerLogoUrl} onLogout={onLogout} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-[70]">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
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
                partnerName={partnerName}
                partnerLogoUrl={partnerLogoUrl}
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
