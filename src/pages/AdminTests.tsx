import React from 'react';
import { Navigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { AdminMenu } from '@/components/AdminMenu';
import { ComprehensiveAdminTestDashboard } from '@/tests/ComprehensiveAdminTestDashboard';
import { OneSignalDebug } from '@/components/OneSignalDebug';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';

const AdminTests: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin, loading } = useUserRole();

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Načítám...</p>
          </div>
        </div>
        <AdminMenu />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" />;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      <div className="container mx-auto p-4">
        <OneSignalDebug />
        <ComprehensiveAdminTestDashboard />
      </div>
      <AdminMenu />
    </div>
  );
};

export default AdminTests;