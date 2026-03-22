import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { NavigateToLogin } from "@/components/NavigateToLogin";
import { AdminPrizeDelivery } from "@/components/AdminPrizeDelivery";

/**
 * Samostatná trasa pro předání bonusových výher (logistika), oddělená od /admin/winners.
 */
const AdminPrizeDeliveryPage: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <NavigateToLogin />;
  }

  if (!isAdmin) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <AdminPrizeDelivery />
    </div>
  );
};

export default AdminPrizeDeliveryPage;
