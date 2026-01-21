import React, { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Link } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/components/AuthProvider";
import TestAuthProvider from "@/components/TestAuthProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DateOfBirthGuard } from "@/components/DateOfBirthGuard";
import { DateOfBirthProvider } from "@/hooks/useDateOfBirthCheck";
import { useOneSignal } from "@/hooks/useOneSignal";
import { useAuth } from "@/hooks/useAuth";
import { AdminRealtimeProvider } from "@/components/AdminRealtimeProvider";
import ContestDetailAdmin from "@/components/ContestDetailAdmin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Key, LogOut } from "lucide-react";

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
import AdminBanners from "@/pages/AdminBanners";
import AdminVouchers from "@/pages/AdminVouchers";
import AdminPayments from "@/pages/AdminPayments";
import AdminStatistics from "@/pages/AdminStatistics";
import AdminNotifications from "@/pages/AdminNotifications";
import AdminWinners from "@/pages/AdminWinners";
import AdminTests from "@/pages/AdminTests";
import AdminPartners from "@/pages/AdminPartners";
import AdminAuditLogs from "@/pages/AdminAuditLogs";
import AdminAuditRepair from "@/pages/AdminAuditRepair";
import AdminMessages from "@/pages/AdminMessages";
import AdminMessageThread from "@/pages/AdminMessageThread";
import AdminContentPages from "@/pages/AdminContentPages";
import AdminLegalAcceptances from "@/pages/AdminLegalAcceptances";
import AdminOnboardingIncomplete from "@/pages/AdminOnboardingIncomplete";
import ContentPage from "@/pages/ContentPage";
import OneMilAudit from "@/pages/OneMilAudit";
import TestLogin from "@/pages/TestLogin";
import Winners from "@/pages/Winners";
import Wins from "@/pages/Wins";
import FavoriteGames from "@/pages/FavoriteGames";
import ShareTicket from "@/pages/ShareTicket";
import UnsubscribeMarketing from "@/pages/UnsubscribeMarketing";
import OnboardingDateOfBirth from "@/pages/OnboardingDateOfBirth";
import DeleteAccount from "@/pages/DeleteAccount";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsConditions from "@/pages/TermsConditions";
import Kontakt from "@/pages/Kontakt";
import PartnerLogin from "@/pages/PartnerLogin";
import PartnerRegister from "@/pages/PartnerRegister";
import PartnerDashboard from "@/pages/PartnerDashboard";
import AdminPartnersPortal from "@/pages/AdminPartnersPortal";
import NotFound from "@/pages/NotFound";

import { BottomNavigation } from "@/components/BottomNavigation";
import { AdminMenu } from "@/components/AdminMenu";
import { useUserRole } from "@/hooks/useUserRole";

// Partner Header Component (inline to avoid new files)
interface PartnerHeaderProps {
  partnerName: string | null;
}

function PartnerHeader({ partnerName }: PartnerHeaderProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success('Odhlášeno');
    navigate('/partner/login');
  };

  return (
    <header className="border-b border-border/50 bg-card/50 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground text-sm">
                {partnerName || 'Partner'}
              </span>
              <Badge variant="outline" className="text-xs hidden sm:inline-flex">
                Partnerský portál
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground sm:hidden">Partnerský portál</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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

// Hook to get partner name for header
function usePartnerName(userId: string | undefined) {
  const [partnerName, setPartnerName] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setPartnerName(null);
      return;
    }

    const fetchPartnerName = async () => {
      const { data } = await supabase
        .from('partners')
        .select('name, company_name')
        .eq('auth_user_id', userId)
        .single();
      
      if (data) {
        setPartnerName(data.company_name || data.name);
      }
    };

    fetchPartnerName();
  }, [userId]);

  return partnerName;
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

function AppContent() {
  const { user } = useAuth();
  const { isAdmin, isPartnerAccount, loading: roleLoading } = useUserRole();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isPartnerRoute = location.pathname.startsWith('/partner');
  
  // Fetch partner name for header (only when partner account)
  const partnerName = usePartnerName(isPartnerAccount ? user?.id : undefined);

  useOneSignal();

  // Hard-block: Redirect partner accounts away from customer routes (works on direct URL access)
  React.useEffect(() => {
    if (roleLoading) return;
    
    if (isPartnerAccount && user && isCustomerBlockedRoute(location.pathname)) {
      navigate('/partner/dashboard', { replace: true });
    }
  }, [isPartnerAccount, user, location.pathname, navigate, roleLoading]);

  // Block rendering of customer routes while checking account type (prevents flash)
  if (user && roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Hard-block: If partner tries to access customer route, show nothing (redirect in effect)
  if (isPartnerAccount && user && isCustomerBlockedRoute(location.pathname)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Render partner header for partner accounts on partner routes
  const renderPartnerHeader = () => {
    if (isPartnerAccount && isPartnerRoute && location.pathname !== '/partner/login' && location.pathname !== '/partner/register') {
      return <PartnerHeader partnerName={partnerName} />;
    }
    return null;
  };

  // Layout wrapper based on account type
  const renderNavigation = () => {
    // Partners see no navigation - they're confined to partner portal
    if (isPartnerAccount) return null;
    
    // Admins on admin routes see AdminMenu
    if (isAdmin && isAdminRoute) return <AdminMenu />;
    
    // Customers see BottomNavigation
    return <BottomNavigation />;
  };

  return (
    <DateOfBirthGuard>
      {/* Main app layout wrapper - applies different UI based on accountType */}
      <div className={isPartnerAccount ? 'partner-layout' : 'customer-layout'}>
        {/* Partner header - only visible for partner accounts on partner routes */}
        {renderPartnerHeader()}
        
        <Routes>
          <Route path="/" element={<Homepage />} />
          <Route path="/login" element={<Login />} />
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
          <Route path="/onboarding/date-of-birth" element={<OnboardingDateOfBirth />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/banners" element={<AdminBanners />} />
          <Route path="/admin/vouchers" element={<AdminVouchers />} />
          <Route path="/admin/payments" element={<AdminPayments />} />
          <Route path="/admin/statistics" element={<AdminStatistics />} />
          <Route path="/admin/notifications" element={<AdminNotifications />} />
          <Route path="/admin/winners" element={<AdminWinners />} />
          <Route path="/admin/tests" element={<AdminTests />} />
          <Route path="/admin/partners" element={<AdminPartners />} />
          <Route path="/admin/messages" element={<AdminMessages />} />
          <Route path="/admin/messages/:userId" element={<AdminMessageThread />} />
          <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
          <Route path="/admin/audit-repair" element={<AdminAuditRepair />} />
          <Route path="/admin/onemil-audit" element={<OneMilAudit />} />
          <Route path="/admin/contest/:contestId" element={<ContestDetailAdmin />} />
          <Route path="/admin/content" element={<AdminContentPages />} />
          <Route path="/admin/legal-acceptances" element={<AdminLegalAcceptances />} />
          <Route path="/admin/onboarding-incomplete" element={<AdminOnboardingIncomplete />} />
          <Route path="/admin/partners-portal" element={<AdminPartnersPortal />} />
          <Route path="/partner/login" element={<PartnerLogin />} />
          <Route path="/partner/register" element={<PartnerRegister />} />
          <Route path="/partner/dashboard" element={<PartnerDashboard />} />
          <Route path="/unsubscribe/marketing" element={<UnsubscribeMarketing />} />
          <Route path="/delete-account" element={<DeleteAccount />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsConditions />} />
          <Route path="/kontakt" element={<Kontakt />} />
          <Route path="/test-login" element={<TestLogin />} />
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
              <TestAuthProvider>
                <AdminRealtimeProvider>
                  <TooltipProvider>
                    <BrowserRouter>
                      <AppContent />
                      <Toaster />
                      <Sonner />
                    </BrowserRouter>
                  </TooltipProvider>
                </AdminRealtimeProvider>
              </TestAuthProvider>
            </DateOfBirthProvider>
          </AuthProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
