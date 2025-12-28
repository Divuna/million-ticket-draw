import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/components/AuthProvider";
import TestAuthProvider from "@/components/TestAuthProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useOneSignal } from "@/hooks/useOneSignal";
import { useAuth } from "@/hooks/useAuth";
import ContestDetailAdmin from "@/components/ContestDetailAdmin";

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
import ContentPage from "@/pages/ContentPage";
import OneMilAudit from "@/pages/OneMilAudit";
import TestLogin from "@/pages/TestLogin";
import Winners from "@/pages/Winners";
import Wins from "@/pages/Wins";
import FavoriteGames from "@/pages/FavoriteGames";
import ShareTicket from "@/pages/ShareTicket";
import NotFound from "@/pages/NotFound";

import { BottomNavigation } from "@/components/BottomNavigation";
import { AdminMenu } from "@/components/AdminMenu";
import { useUserRole } from "@/hooks/useUserRole";

const queryClient = new QueryClient();

function AppContent() {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  useOneSignal();

  return (
    <>
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
        <Route path="/payment/cancel" element={<PaymentCancel />} />
        <Route path="/winners" element={<Winners />} />
        <Route path="/wins" element={<Wins />} />
        <Route path="/share/ticket/:ticketId" element={<ShareTicket />} />
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
        <Route path="/test-login" element={<TestLogin />} />
        <Route path="/:section/:slug" element={<ContentPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      
      {isAdmin && isAdminRoute ? <AdminMenu /> : <BottomNavigation />}
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TestAuthProvider>
              <TooltipProvider>
                <BrowserRouter>
                  <AppContent />
                  <Toaster />
                  <Sonner />
                </BrowserRouter>
              </TooltipProvider>
            </TestAuthProvider>
          </AuthProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
