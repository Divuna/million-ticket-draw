import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/components/AuthProvider";
import TestAuthProvider from "@/components/TestAuthProvider";
import Homepage from "./pages/Homepage";
import Games from "./pages/Games";
import Login from "./pages/Login";
import TestLogin from "./pages/TestLogin";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import MyContests from "./pages/MyContests";
import ContestDetail from "./pages/ContestDetail";
import BonusDetail from "./pages/BonusDetail";
import Messages from "./pages/Messages";
import Vouchers from "./pages/Vouchers";
import AdminDashboard from "./pages/AdminDashboard";
import AdminWinners from "./pages/AdminWinners";
import AdminUsers from "./pages/AdminUsers";
import AdminPayments from "./pages/AdminPayments";
import AdminVouchers from "./pages/AdminVouchers";
import AdminNotifications from "./pages/AdminNotifications";
import AdminStatistics from "./pages/AdminStatistics";
import AdminAuditLogs from "./pages/AdminAuditLogs";
import ContestDetailAdmin from "@/components/ContestDetailAdmin";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancel from "./pages/PaymentCancel";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TestAuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Homepage />} />
            <Route path="/games" element={<Games />} />
            <Route path="/login" element={<Login />} />
            <Route path="/test-login" element={<TestLogin />} />
            <Route path="/register" element={<Register />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/vouchers" element={<Vouchers />} />
            <Route path="/my-contests" element={<MyContests />} />
            <Route path="/contest/:id" element={<ContestDetail />} />
            <Route path="/contest/:id/bonus" element={<BonusDetail />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/winners" element={<AdminWinners />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/payments" element={<AdminPayments />} />
            <Route path="/admin/vouchers" element={<AdminVouchers />} />
            <Route path="/admin/notifications" element={<AdminNotifications />} />
            <Route path="/admin/statistics" element={<AdminStatistics />} />
            <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
            <Route path="/admin/contest/:contestId" element={<ContestDetailAdmin />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/payment-cancel" element={<PaymentCancel />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TestAuthProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;