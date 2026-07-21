import React, { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, Link } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/components/AuthProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DateOfBirthGuard } from "@/components/DateOfBirthGuard";
import { DateOfBirthProvider } from "@/hooks/useDateOfBirthCheck";
import { useOneSignal } from "@/hooks/useOneSignal";
import { useAuth } from "@/hooks/useAuth";
import { AdminRealtimeProvider } from "@/components/AdminRealtimeProvider";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import ContestDetailAdmin from "@/components/ContestDetailAdmin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Key, LogOut, CheckCircle, Clock, XCircle, FileText, MessageCircle } from "lucide-react";

import Homepage from "@/pages/Homepage";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Profile from "@/pages/Profile";
import Games from "@/pages/Games";
import ContestDetail from "@/pages/ContestDetail";
import MyContests from "@/pages/MyContests";
import MyContestDetail from "@/pages/MyContestDetail";
import BonusDetail from "@/pages/BonusDetail";
import Vouchers from "@/pages/Vouchers";
import Messages from "@/pages/Messages";
import MessageDetail from "@/pages/MessageDetail";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentCancel from "@/pages/PaymentCancel";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminUsers from "@/pages/AdminUsers";
import AdminAdmins from "@/pages/AdminAdmins";
import AdminBanners from "@/pages/AdminBanners";
import AdminVouchers from "@/pages/AdminVouchers";
import AdminPrizeDeliveryPage from "@/pages/AdminPrizeDeliveryPage";
import AdminPayments from "@/pages/AdminPayments";
import AdminStatistics from "@/pages/AdminStatistics";
import AdminNotifications from "@/pages/AdminNotifications";
import AdminWinners from "@/pages/AdminWinners";
import AdminTests from "@/pages/AdminTests";
import AdminPartners from "@/pages/AdminPartners";
import AdminPartnerOffers from "@/pages/AdminPartnerOffers";
import AdminAuditLogs from "@/pages/AdminAuditLogs";
import AdminEventQueue from "@/pages/AdminEventQueue";
import AdminAuditRepair from "@/pages/AdminAuditRepair";
import AdminMessages from "@/pages/AdminMessages";
import AdminMessageThread from "@/pages/AdminMessageThread";
import AdminContentPages from "@/pages/AdminContentPages";
import AdminLegalAcceptances from "@/pages/AdminLegalAcceptances";
import AdminOnboardingIncomplete from "@/pages/AdminOnboardingIncomplete";
import ContentPage from "@/pages/ContentPage";
import SlugContentPage from "@/pages/SlugContentPage";
import OneMilAudit from "@/pages/OneMilAudit";
import Winners from "@/pages/Winners";
import Wins from "@/pages/Wins";
import FavoriteGames from "@/pages/FavoriteGames";
import ShareTicket from "@/pages/ShareTicket";
import UnsubscribeMarketing from "@/pages/UnsubscribeMarketing";
import DeleteAccount from "@/pages/DeleteAccount";
import Kontakt from "@/pages/Kontakt";
import PartnerLogin from "@/pages/PartnerLogin";
import PartnerRegister from "@/pages/PartnerRegister";
import PartnerDashboard from "@/pages/PartnerDashboard";
import PartnerInvoices from "@/pages/PartnerInvoices";
import PartnerMessages from "@/pages/PartnerMessages";
import InfluencerLanding from "@/pages/InfluencerLanding";
import InfluencerHowToEarn from "@/pages/InfluencerHowToEarn";
import InfluencerRegister from "@/pages/InfluencerRegister";
import InfluencerMessages from "@/pages/InfluencerMessages";
import AdminPartnersPortal from "@/pages/AdminPartnersPortal";
import AdminInvoices from "@/pages/AdminInvoices";
import AdminReferrals from "@/pages/AdminReferrals";
import AdminReferralDashboard from "@/pages/AdminReferralDashboard";
import AdminInfluencers from "@/pages/AdminInfluencers";
import AdminAffiliateAccounts from "@/pages/AdminAffiliateAccounts";
import AffiliateRegister from "@/pages/AffiliateRegister";
import AffiliateLogin from "@/pages/AffiliateLogin";
import AffiliateDashboard from "@/pages/AffiliateDashboard";
import AdminInfluencerCommissions from "@/pages/AdminInfluencerCommissions";
import AdminInfluencerCampaigns from "@/pages/AdminInfluencerCampaigns";
import AdminNotFound from "@/pages/AdminNotFound";
import NotFound from "@/pages/NotFound";
import CompanyLeadConfirm from "@/pages/CompanyLeadConfirm";
import AdminCompanyLeads from "@/pages/AdminCompanyLeads";
import AdminSalesLeads from "@/pages/AdminSalesLeads";
import AdminAffiliateCommissions from "@/pages/AdminAffiliateCommissions";
import AdminAffiliatePayouts from "@/pages/AdminAffiliatePayouts";
import AdminAffiliatePayoutDetail from "@/pages/AdminAffiliatePayoutDetail";
import PartnerSetPassword from "@/pages/PartnerSetPassword";
import ResetPassword from "@/pages/ResetPassword";

import { BottomNavigation } from "@/components/BottomNavigation";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { RequireSuperadminOrRedirect } from "@/components/admin/RequireSuperadminOrRedirect";
import { RequireSuperadmin } from "@/components/admin/RequireSuperadmin";
import { useUserRole } from "@/hooks/useUserRole";
import { useApplyPendingReferral } from "@/hooks/useApplyPendingReferral";
import { useApplyPendingAdultConfirmation } from "@/hooks/useApplyPendingAdultConfirmation";
import { useRetentionTriggers } from "@/hooks/useRetentionTriggers";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { GlobalMusicPlayer } from "@/components/GlobalMusicPlayer";

// Partner Header Component (inline to avoid new files)
interface PartnerHeaderProps {
  partnerName: string | null;
  partnerLogoUrl: string | null;
  partnerStatus: string | null;
}

function PartnerHeader({ partnerName, partnerLogoUrl, partnerStatus }: PartnerHeaderProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success('Odhlášeno');
    navigate('/partner/login');
  };

  const getStatusBadge = (isMobile: boolean = false) => {
    const baseClasses = isMobile 
      ? "text-[10px] px-1.5 py-0.5" 
      : "text-xs";
    
    switch (partnerStatus) {
      case 'approved':
        return (
          <Badge className={`${baseClasses} bg-green-500/10 text-green-600 border-green-500/20`}>
            <CheckCircle className={isMobile ? "w-2.5 h-2.5 mr-0.5" : "w-3 h-3 mr-1"} />
            Aktivní
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary" className={`${baseClasses} bg-amber-500/10 text-amber-600 border-amber-500/20`}>
            <Clock className={isMobile ? "w-2.5 h-2.5 mr-0.5" : "w-3 h-3 mr-1"} />
            {isMobile ? "Čeká" : "Čeká na schválení"}
          </Badge>
        );
      case 'suspended':
        return (
          <Badge variant="destructive" className={`${baseClasses} bg-red-500/10 text-red-600 border-red-500/20`}>
            <XCircle className={isMobile ? "w-2.5 h-2.5 mr-0.5" : "w-3 h-3 mr-1"} />
            Pozastaveno
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <header className="border-b border-border/50 bg-card/50 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link to="/partner/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              {partnerLogoUrl ? (
                <img 
                  src={partnerLogoUrl} 
                  alt={partnerName || 'Partner'} 
                  className="w-9 h-9 rounded-lg object-cover border border-border/50"
                  onError={(e) => {
                    // Fallback to icon if image fails to load
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <div className={`w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center ${partnerLogoUrl ? 'hidden' : ''}`}>
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                {/* Desktop layout */}
                <div className="hidden sm:flex items-center gap-2">
                  <span className="font-semibold text-foreground text-sm">
                    {partnerName || 'Partner'}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    Partnerský portál
                  </Badge>
                  {getStatusBadge(false)}
                </div>
                {/* Mobile layout */}
                <div className="sm:hidden">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground text-sm">
                      {partnerName || 'Partner'}
                    </span>
                    {getStatusBadge(true)}
                  </div>
                  <p className="text-xs text-muted-foreground">Partnerský portál</p>
                </div>
              </div>
            </Link>
          </TooltipTrigger>
          <TooltipContent>
            <p>Přejít na partnerský dashboard</p>
          </TooltipContent>
        </Tooltip>
        <div className="flex items-center gap-2">
          <Link to="/partner/messages">
            <Button variant="ghost" size="sm" className="hidden sm:flex">
              <MessageCircle className="w-4 h-4 mr-2" />
              Zprávy
            </Button>
            <Button variant="ghost" size="icon" className="sm:hidden">
              <MessageCircle className="w-4 h-4" />
            </Button>
          </Link>
          <Link to="/partner/invoices">
            <Button variant="ghost" size="sm" className="hidden sm:flex">
              <FileText className="w-4 h-4 mr-2" />
              Faktury
            </Button>
            <Button variant="ghost" size="icon" className="sm:hidden">
              <FileText className="w-4 h-4" />
            </Button>
          </Link>
          <Link to="/partner/dashboard#api-keys">
            <Button variant="ghost" size="sm" className="hidden sm:flex">
              <Key className="w-4 h-4 mr-2" />
              API klíče
            </Button>
            <Button variant="ghost" size="icon" className="sm:hidden">
              <Key className="w-4 h-4" />
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Odhlásit se</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

// Hook to get partner data for header
interface PartnerHeaderData {
  name: string | null;
  logoUrl: string | null;
  status: string | null;
}

function usePartnerData(userId: string | undefined): PartnerHeaderData {
  const [data, setData] = useState<PartnerHeaderData>({ name: null, logoUrl: null, status: null });

  useEffect(() => {
    if (!userId) {
      setData({ name: null, logoUrl: null, status: null });
      return;
    }

    const fetchPartnerData = async () => {
      const { data: partnerData } = await supabase
        .from('partners')
        .select('name, company_name, logo_url, status')
        .eq('auth_user_id', userId)
        .single();
      
      if (partnerData) {
        setData({
          name: partnerData.company_name || partnerData.name,
          logoUrl: partnerData.logo_url || null,
          status: partnerData.status || null
        });
      }
    };

    fetchPartnerData();
  }, [userId]);

  return data;
}

const queryClient = new QueryClient();

// List of routes blocked for partner accounts
const CUSTOMER_BLOCKED_ROUTES = [
  '/', '/games', '/favorite-games', '/contest', '/my-contests', '/my-contest', 
  '/vouchers', '/messages', '/wins', '/winners', '/profile', '/bonus', 
  '/payment', '/payment-success', '/payment-cancel', '/share/ticket'
];

function isCustomerBlockedRoute(pathname: string): boolean {
  return CUSTOMER_BLOCKED_ROUTES.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  );
}

function GlobalWinnersRealtimeFeed() {
  const { user } = useAuth();
  const currentPublicUserId = user?.id ?? null;
  const lastWinnerToastRef = React.useRef<Record<string, number>>({});

  React.useEffect(() => {
    const channel = supabase
      .channel('global-winners-feed')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'winners',
        },
        async (payload) => {
          const newRow = payload.new as Record<string, unknown>;
          const winType = (newRow.type ?? newRow.winner_type ?? newRow.prize_type ?? newRow.win_type) as string | undefined;
          const winnerUserId = (newRow.user_id ?? newRow.winner_user_id ?? newRow.profile_id) as string | undefined;

          if (!winType || !['bonus', 'main', 'miocoin'].includes(winType)) return;
          if (currentPublicUserId && winnerUserId === currentPublicUserId) return;

          const now = Date.now();
          const cooldown = winType === 'miocoin' ? 60_000 : 120_000;
          const lastForType = lastWinnerToastRef.current[winType] ?? 0;
          if (now - lastForType < cooldown) return;
          lastWinnerToastRef.current = { ...lastWinnerToastRef.current, [winType]: now };

          const contestId = newRow.contest_id as string | undefined;
          let contestName = '';
          if (contestId) {
            const { data } = await supabase
              .from('contests')
              .select('name')
              .eq('id', contestId)
              .maybeSingle();
            if (data?.name) contestName = data.name;
          }

          const prefix = contestName ? `V soutěži ${contestName} padla` : 'Padla';
          const icon = winType === 'main' ? '🏆' : winType === 'miocoin' ? '💰' : '🎁';
          const label = winType === 'main'
            ? `${prefix} hlavní výhra`
            : winType === 'miocoin'
            ? `${prefix} MioCoin výhra`
            : `${prefix} bonusová výhra`;

          toast(label, {
            duration: 10000,
            icon: <span style={{ fontSize: '1.2em', lineHeight: 1 }}>{icon}</span>,
            description: <div className="winner-toast-shimmer" />,
            style: {
              background: 'linear-gradient(135deg, hsl(222, 47%, 11%), hsl(222, 40%, 16%))',
              border: '1px solid rgba(255,138,0,0.3)',
              borderRadius: '0.75rem',
              boxShadow: '0 8px 24px hsl(222, 50%, 3%, 0.5)',
              backdropFilter: 'blur(8px)',
              color: 'hsl(210, 20%, 96%)',
              fontWeight: 500,
              maxWidth: '380px',
              padding: '14px 18px',
            },
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentPublicUserId]);

  return null;
}

function AppContent() {
  const { user, loading: authLoading, isPasswordRecovery, passwordRecoveryRoute } = useAuth();
  const { isAdmin, isPartner, isPartnerAccount, isInfluencerAccount, isAffiliateAccount, loading: roleLoading } = useUserRole();
  const location = useLocation();
  const navigate = useNavigate();
  const isPartnerRoute = location.pathname.startsWith('/partner');
  const isInfluencerRoute = location.pathname.startsWith('/influencer');

  // All hooks MUST be called unconditionally (React rules of hooks).
  const partnerData = usePartnerData(isPartnerAccount && !isInfluencerAccount ? user?.id : undefined);
  useOneSignal();
  useApplyPendingReferral(user?.id);
  // Uloží potvrzení 18+ po přihlášení (zejména po návratu z OAuth).
  useApplyPendingAdultConfirmation(user?.id);
  useRetentionTriggers(user?.id);
  useHeartbeat(user?.id);

  // PASSWORD_RECOVERY: Supabase fires this for both customer reset links and
  // partner one-time setup links. useAuth records the route where the event
  // arrived so customers stay on /reset-password and partners keep /partner/set-password.
  React.useEffect(() => {
    if (isPasswordRecovery) {
      navigate(passwordRecoveryRoute, { replace: true });
    }
  }, [isPasswordRecovery, passwordRecoveryRoute, navigate]);

  // Hard-block: Redirect accounts away from unauthorized routes
  React.useEffect(() => {
    if (roleLoading || !user) return;
    // Never redirect during a password-recovery flow — isPasswordRecovery is set
    // in the same React batch as user (inside useAuthState onAuthStateChange),
    // so by the time this guard fires, isPasswordRecovery is already true.
    if (isPasswordRecovery) return;
    
    // Influencer accounts: redirect to Affiliate v2 UI.
    // /influencer/* routes remain mounted for backward compat but the default landing is /affiliate/dashboard.
    if (isInfluencerAccount) {
      const allowedForInfluencer =
        location.pathname.startsWith('/affiliate') ||   // Affiliate v2 — primary UI
        location.pathname.startsWith('/influencer') ||  // Legacy routes still allowed (backward compat)
        location.pathname === '/partner/login' ||
        location.pathname === '/partner/register' ||
        location.pathname === '/partner/invite' ||
        location.pathname === '/partner/set-password' ||
        location.pathname === '/reset-password' ||
        location.pathname === '/login' ||
        location.pathname === '/register' ||
        location.pathname === '/delete-account' ||
        location.pathname === '/unsubscribe/marketing';

      if (!allowedForInfluencer) {
        navigate('/affiliate/dashboard', { replace: true });
        return;
      }
    }

    // Affiliate v2 accounts (no partners row): confine to /affiliate/* + auth routes.
    if (isAffiliateAccount && !isPartnerAccount) {
      const allowedForAffiliate =
        location.pathname.startsWith('/affiliate') ||
        location.pathname === '/partner/invite' ||
        location.pathname === '/partner/set-password' ||
        location.pathname === '/reset-password' ||
        location.pathname === '/login' ||
        location.pathname === '/register' ||
        location.pathname === '/delete-account' ||
        location.pathname === '/unsubscribe/marketing';

      if (!allowedForAffiliate) {
        navigate('/affiliate/dashboard', { replace: true });
        return;
      }
    }

    // Non-influencer partner accounts: block customer routes
    // Allow /partner/set-password so newly approved partners can set their password
    if (isPartnerAccount && !isInfluencerAccount && isCustomerBlockedRoute(location.pathname)
        && location.pathname !== '/partner/set-password') {
      navigate('/partner/dashboard', { replace: true });
      return;
    }

    // Partner role or partner portal account (non-influencer) must not use /admin (admins exempt)
    if (
      location.pathname.startsWith("/admin") &&
      !isAdmin &&
      !isInfluencerAccount &&
      (isPartner || isPartnerAccount)
    ) {
      navigate("/", { replace: true });
    }
  }, [isAdmin, isPartner, isPartnerAccount, isInfluencerAccount, isAffiliateAccount, user, location.pathname, navigate, roleLoading, isPasswordRecovery]);

  if (authLoading) {
    return null;
  }

  // While role is resolving, block main app flash — but keep auth screens mounted so
  // Login/Register can finish redirect after signIn (otherwise spinner unmounts Login and pending nav is lost).
  const authEntryPath =
    location.pathname === "/login" ||
    location.pathname === "/reset-password" ||
    location.pathname === "/register" ||
    location.pathname === "/partner/login" ||
    location.pathname === "/partner/register" ||
    location.pathname === "/affiliate/register";

  if (user && roleLoading && !authEntryPath) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Hard-block: If partner/influencer tries to access blocked route, show spinner (redirect in effect)
  // Skip during password recovery flow — let the user reach /partner/set-password.
  if (isPartnerAccount && user && !isInfluencerAccount && isCustomerBlockedRoute(location.pathname)
      && !isPasswordRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (
    user &&
    !isAdmin &&
    !isInfluencerAccount &&
    (isPartner || isPartnerAccount) &&
    location.pathname.startsWith("/admin")
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Influencer: block all non-influencer/affiliate routes (render guard mirrors useEffect logic)
  if (isInfluencerAccount && user) {
    const allowedForInfluencer =
      location.pathname.startsWith('/affiliate') ||   // Affiliate v2 — primary UI
      location.pathname.startsWith('/influencer') ||  // Legacy routes still allowed (backward compat)
      location.pathname === '/partner/login' ||
      location.pathname === '/partner/register' ||
      location.pathname === '/partner/invite' ||
      location.pathname === '/partner/set-password' ||
      location.pathname === '/reset-password' ||
      location.pathname === '/login' ||
      location.pathname === '/register' ||
      location.pathname === '/delete-account' ||
      location.pathname === '/unsubscribe/marketing';

    if (!allowedForInfluencer) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      );
    }
  }

  // Affiliate v2: block non-affiliate routes (render guard matches useEffect logic)
  if (isAffiliateAccount && !isPartnerAccount && user) {
    const allowedForAffiliate =
      location.pathname.startsWith('/affiliate') ||
      location.pathname === '/partner/invite' ||
      location.pathname === '/partner/set-password' ||
      location.pathname === '/reset-password' ||
      location.pathname === '/login' ||
      location.pathname === '/register' ||
      location.pathname === '/delete-account' ||
      location.pathname === '/unsubscribe/marketing';

    if (!allowedForAffiliate) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      );
    }
  }

  // Render partner header for partner accounts on partner routes (not influencers)
  const renderPartnerHeader = () => {
    if (isPartnerAccount && !isInfluencerAccount && isPartnerRoute && location.pathname !== '/partner/login' && location.pathname !== '/partner/register') {
      return <PartnerHeader partnerName={partnerData.name} partnerLogoUrl={partnerData.logoUrl} partnerStatus={partnerData.status} />;
    }
    return null;
  };

  // Layout wrapper based on account type
  const renderNavigation = () => {
    // Partners see no navigation - they're confined to partner portal
    if (isPartnerAccount) return null;
    
    // Affiliate v2 accounts use their own dashboard chrome — no customer bottom nav.
    if (isAffiliateAccount) return null;

    // Bottom navigation for customers only; admins use AdminLayout chrome (primary + context sub-nav).
    return <BottomNavigation />;
  };

  const isPublicCustomerThemeRoute =
    !location.pathname.startsWith('/admin') &&
    !location.pathname.startsWith('/partner') &&
    !location.pathname.startsWith('/affiliate') &&
    !location.pathname.startsWith('/influencer');

  const layoutClassName = [
    isPartnerAccount ? 'partner-layout' : 'customer-layout',
    !isPartnerAccount && !isAffiliateAccount && isPublicCustomerThemeRoute
      ? 'public-customer-theme'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <DateOfBirthGuard>
      <GlobalMusicPlayer />
      <GlobalWinnersRealtimeFeed />
      {/* Main app layout wrapper - applies different UI based on accountType */}
      <div className={layoutClassName}>
        {/* Partner header - only visible for partner accounts on partner routes */}
        {renderPartnerHeader()}
        
        <Routes>
          <Route path="/" element={<Homepage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/register" element={<Register />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/games" element={<Games />} />
          <Route path="/favorite-games" element={<FavoriteGames />} />
          <Route path="/contest/:id" element={<ContestDetail />} />
          <Route path="/my-contests" element={<MyContests />} />
          <Route path="/my-contest/:id" element={<MyContestDetail />} />
          <Route path="/bonus/:id" element={<BonusDetail />} />
          <Route path="/vouchers" element={<Vouchers />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/messages/:id" element={<MessageDetail />} />
          <Route path="/payment/success" element={<PaymentSuccess />} />
          <Route path="/payment-success" element={<PaymentSuccess />} />
          <Route path="/payment/cancel" element={<PaymentCancel />} />
          <Route path="/payment-cancel" element={<PaymentCancel />} />
          <Route path="/winners" element={<Winners />} />
          <Route path="/wins" element={<Wins />} />
          <Route path="/share/ticket/:ticketId" element={<ShareTicket />} />
          {/* Datum narození se už při registraci nevyžaduje — stará onboarding
              routa přesměruje na domovskou stránku, nikoho neblokuje. */}
          <Route path="/onboarding/date-of-birth" element={<Navigate to="/" replace />} />
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<RequireSuperadminOrRedirect><AdminDashboard /></RequireSuperadminOrRedirect>} />
            <Route path="/admin/users" element={<RequirePermission permission="users.view.basic"><AdminUsers /></RequirePermission>} />
            <Route path="/admin/admins" element={<RequireSuperadmin><AdminAdmins /></RequireSuperadmin>} />
            <Route path="/admin/banners" element={<RequirePermission permission="banners.manage"><AdminBanners /></RequirePermission>} />
            <Route path="/admin/vouchers" element={<RequirePermission permission="vouchers.manage"><AdminVouchers /></RequirePermission>} />
            <Route path="/admin/payments" element={<RequireSuperadmin><AdminPayments /></RequireSuperadmin>} />
            <Route path="/admin/statistics" element={<RequireSuperadminOrRedirect><AdminStatistics /></RequireSuperadminOrRedirect>} />
            <Route path="/admin/notifications" element={<RequirePermission permission="notifications.manage"><AdminNotifications /></RequirePermission>} />
            <Route path="/admin/winners" element={<RequireSuperadmin><AdminWinners /></RequireSuperadmin>} />
            <Route path="/admin/prize-delivery" element={<RequireSuperadmin><AdminPrizeDeliveryPage /></RequireSuperadmin>} />
            <Route path="/admin/tests" element={<RequireSuperadmin><AdminTests /></RequireSuperadmin>} />
            <Route path="/admin/partners" element={<RequireSuperadmin><AdminPartners /></RequireSuperadmin>} />
            <Route path="/admin/partner-offers" element={<RequirePermission permission="partner_offers.finance.manage"><AdminPartnerOffers /></RequirePermission>} />
            <Route path="/admin/sales-leads" element={<RequirePermission permission="sales_leads.manage"><AdminSalesLeads /></RequirePermission>} />
            <Route path="/admin/messages" element={<RequirePermission permission="support.messages"><AdminMessages /></RequirePermission>} />
            <Route path="/admin/messages/:userId" element={<RequirePermission permission="support.messages"><AdminMessageThread /></RequirePermission>} />
            <Route path="/admin/audit-logs" element={<RequireSuperadmin><AdminAuditLogs /></RequireSuperadmin>} />
            <Route path="/admin/event-queue" element={<RequireSuperadmin><AdminEventQueue /></RequireSuperadmin>} />
            <Route path="/admin/audit-repair" element={<RequireSuperadmin><AdminAuditRepair /></RequireSuperadmin>} />
            <Route path="/admin/onemil-audit" element={<RequireSuperadmin><OneMilAudit /></RequireSuperadmin>} />
            <Route path="/admin/contest/:contestId" element={<RequireSuperadmin><ContestDetailAdmin /></RequireSuperadmin>} />
            <Route path="/admin/content" element={<RequirePermission permission="content.manage"><AdminContentPages /></RequirePermission>} />
            <Route path="/admin/legal-acceptances" element={<RequireSuperadmin><AdminLegalAcceptances /></RequireSuperadmin>} />
            <Route path="/admin/onboarding-incomplete" element={<RequireSuperadmin><AdminOnboardingIncomplete /></RequireSuperadmin>} />
            <Route path="/admin/partners-portal" element={<RequireSuperadmin><AdminPartnersPortal /></RequireSuperadmin>} />
            <Route path="/admin/invoices" element={<RequireSuperadmin><AdminInvoices /></RequireSuperadmin>} />
            <Route path="/admin/referrals" element={<RequireSuperadmin><AdminReferrals /></RequireSuperadmin>} />
            <Route path="/admin/referral-dashboard" element={<RequireSuperadmin><AdminReferralDashboard /></RequireSuperadmin>} />
            <Route path="/admin/influencers" element={<RequireSuperadmin><AdminInfluencers /></RequireSuperadmin>} />
            <Route path="/admin/affiliate-accounts" element={<RequireSuperadmin><AdminAffiliateAccounts /></RequireSuperadmin>} />
            <Route path="/admin/influencer-commissions" element={<RequireSuperadmin><AdminInfluencerCommissions /></RequireSuperadmin>} />
            <Route path="/admin/influencer-campaigns" element={<RequireSuperadmin><AdminInfluencerCampaigns /></RequireSuperadmin>} />
            <Route path="/admin/company-leads" element={<RequireSuperadmin><AdminCompanyLeads /></RequireSuperadmin>} />
            <Route path="/admin/affiliate-commissions" element={<RequireSuperadmin><AdminAffiliateCommissions /></RequireSuperadmin>} />
            <Route path="/admin/affiliate-payouts" element={<RequireSuperadmin><AdminAffiliatePayouts /></RequireSuperadmin>} />
            <Route path="/admin/affiliate-payouts/:batchId" element={<RequireSuperadmin><AdminAffiliatePayoutDetail /></RequireSuperadmin>} />
            <Route path="/admin/*" element={<AdminNotFound />} />
          </Route>
          <Route path="/partner/login" element={<PartnerLogin />} />
            <Route path="/partner/register" element={<PartnerRegister />} />
            <Route path="/partner/invite" element={<CompanyLeadConfirm />} />
            <Route path="/partner/set-password" element={<PartnerSetPassword />} />
            {/* Legacy /influencer/* routes — /dashboard redirects to Affiliate v2 UI; public pages unchanged */}
            <Route path="/influencer" element={<InfluencerLanding />} />
            <Route path="/influencer/how-to-earn" element={<InfluencerHowToEarn />} />
            <Route path="/influencer/register" element={<InfluencerRegister />} />
            <Route path="/influencer/dashboard" element={<Navigate to="/affiliate/dashboard" replace />} />
            <Route path="/influencer/messages" element={<InfluencerMessages />} />
            <Route path="/affiliate/login" element={<AffiliateLogin />} />
            <Route path="/affiliate/register" element={<AffiliateRegister />} />
            <Route path="/affiliate/dashboard" element={<AffiliateDashboard />} />
          <Route path="/partner/dashboard" element={<PartnerDashboard />} />
          <Route path="/partner/invoices" element={<PartnerInvoices />} />
          <Route path="/partner/messages" element={<PartnerMessages />} />
          <Route path="/unsubscribe/marketing" element={<UnsubscribeMarketing />} />
          <Route path="/delete-account" element={<DeleteAccount />} />
          <Route path="/privacy" element={<Navigate to="/gdpr" replace />} />
          <Route path="/terms" element={<Navigate to="/vop" replace />} />
          <Route path="/kontakt" element={<Kontakt />} />
          <Route path="/vop" element={<SlugContentPage slug="vop" />} />
          <Route path="/gdpr" element={<SlugContentPage slug="gdpr" />} />
          <Route path="/pravidla-souteze" element={<SlugContentPage slug="pravidla-souteze" />} />
          <Route path="/legal/ochrana-osobnich-udaju" element={<Navigate to="/gdpr" replace />} />
          <Route path="/:section/:slug" element={<ContentPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        
        {/* Conditional navigation based on account type */}
        {renderNavigation()}
      </div>
    </DateOfBirthGuard>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <DateOfBirthProvider>
              <AdminRealtimeProvider>
                <TooltipProvider>
                  <BrowserRouter>
                    <AppContent />
                    <Toaster />
                    <Sonner />
                    <CookieConsentBanner />
                  </BrowserRouter>
                </TooltipProvider>
              </AdminRealtimeProvider>
            </DateOfBirthProvider>
          </AuthProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
