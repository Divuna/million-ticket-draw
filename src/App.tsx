import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AuthProvider, useAuth } from "@/components/AuthProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import TestAuthProvider from "@/components/TestAuthProvider";

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
import OneMilAudit from "@/pages/OneMilAudit";
import TestLogin from "@/pages/TestLogin";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function AppContent() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Načítání...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Homepage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="/games" element={<Games />} />
      <Route path="/contest/:id" element={<ContestDetail />} />
      <Route path="/my-contests" element={<ProtectedRoute><MyContests /></ProtectedRoute>} />
      <Route path="/my-contest/:id" element={<ProtectedRoute><MyContestDetail /></ProtectedRoute>} />
      <Route path="/bonus/:id" element={<ProtectedRoute><BonusDetail /></ProtectedRoute>} />
      <Route path="/vouchers" element={<ProtectedRoute><Vouchers /></ProtectedRoute>} />
      <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
      <Route path="/messages/:id" element={<ProtectedRoute><MessageDetail /></ProtectedRoute>} />
      <Route path="/payment/success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
      <Route path="/payment/cancel" element={<ProtectedRoute><PaymentCancel /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
      <Route path="/admin/banners" element={<ProtectedRoute><AdminBanners /></ProtectedRoute>} />
      <Route path="/admin/vouchers" element={<ProtectedRoute><AdminVouchers /></ProtectedRoute>} />
      <Route path="/admin/payments" element={<ProtectedRoute><AdminPayments /></ProtectedRoute>} />
      <Route path="/admin/statistics" element={<ProtectedRoute><AdminStatistics /></ProtectedRoute>} />
      <Route path="/admin/notifications" element={<ProtectedRoute><AdminNotifications /></ProtectedRoute>} />
      <Route path="/admin/winners" element={<ProtectedRoute><AdminWinners /></ProtectedRoute>} />
      <Route path="/admin/tests" element={<ProtectedRoute><AdminTests /></ProtectedRoute>} />
      <Route path="/admin/partners" element={<ProtectedRoute><AdminPartners /></ProtectedRoute>} />
      <Route path="/admin/messages" element={<ProtectedRoute><AdminMessages /></ProtectedRoute>} />
      <Route path="/admin/messages/:userId" element={<ProtectedRoute><AdminMessageThread /></ProtectedRoute>} />
      <Route path="/admin/audit-logs" element={<ProtectedRoute><AdminAuditLogs /></ProtectedRoute>} />
      <Route path="/admin/audit-repair" element={<ProtectedRoute><AdminAuditRepair /></ProtectedRoute>} />
      <Route path="/admin/onemil-audit" element={<ProtectedRoute><OneMilAudit /></ProtectedRoute>} />
      <Route path="/test-login" element={<TestLogin />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
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
  );
}
