import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PartnerSidebar } from './PartnerSidebar';
import { PartnerTopbar } from './PartnerTopbar';

interface PartnerPortalLayoutProps {
  partnerName: string | null;
  partnerLogoUrl: string | null;
  partnerStatus: string | null;
  children: React.ReactNode;
}

/**
 * Shared shell for every logged-in partner-portal screen (replaces the old
 * top-only PartnerHeader in App.tsx). Sidebar + topbar are pure navigation —
 * they render Link/`<a href>` to routes and anchors that already exist; no new
 * page, no new data fetch, no new write. Logout is the exact same
 * supabase.auth.signOut() + navigate('/partner/login') the previous header used.
 */
export const PartnerPortalLayout: React.FC<PartnerPortalLayoutProps> = ({
  partnerName,
  partnerLogoUrl,
  partnerStatus,
  children,
}) => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success('Odhlášeno');
    navigate('/partner/login');
  };

  return (
    <div className="partner-portal-theme min-h-screen flex">
      <PartnerSidebar
        partnerName={partnerName}
        partnerLogoUrl={partnerLogoUrl}
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />
      <div className="flex-1 min-w-0 lg:pl-64">
        <PartnerTopbar partnerStatus={partnerStatus} onOpenMobileMenu={() => setMobileMenuOpen(true)} />
        <div>{children}</div>
      </div>
    </div>
  );
};
