import React, { useEffect, useState } from 'react';
import { AffiliateSidebar } from './AffiliateSidebar';
import { AffiliateTopbar } from './AffiliateTopbar';

type ActiveMode = 'influencer' | 'sales_rep' | 'profile';

interface AffiliatePortalLayoutProps {
  activeMode?: ActiveMode;
  onSwitchMode?: (mode: ActiveMode) => void;
  currentMonthCzk?: number;
  onLogout: () => void;
  children: React.ReactNode;
}

/**
 * Shared shell for /affiliate/dashboard and /influencer/messages. Sidebar +
 * topbar are pure navigation/display — same onSwitchMode / onLogout the pages
 * already implement, nothing new is read or written here.
 *
 * The theme class is also toggled on document.body (not just the wrapper div)
 * because Radix Dialog/Popover/Select portal directly under <body> — without
 * this, a dialog opened from inside this shell (e.g. "Přidat firmu") would
 * still pick up the global dark theme instead of this light one.
 */
export const AffiliatePortalLayout: React.FC<AffiliatePortalLayoutProps> = ({
  activeMode,
  onSwitchMode,
  currentMonthCzk,
  onLogout,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add('affiliate-portal-theme');
    return () => document.body.classList.remove('affiliate-portal-theme');
  }, []);

  return (
    <div className="affiliate-portal-theme min-h-screen flex">
      <AffiliateSidebar
        activeMode={activeMode}
        onSwitchMode={onSwitchMode}
        onLogout={onLogout}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />
      <div className="flex-1 min-w-0 lg:pl-64">
        <AffiliateTopbar
          activeMode={activeMode}
          currentMonthCzk={currentMonthCzk}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />
        <div>{children}</div>
      </div>
    </div>
  );
};
