import React from 'react';
import { Navigate } from 'react-router-dom';
import { NavigateToLogin } from '@/components/NavigateToLogin';
import { ComprehensiveAdminTestDashboard } from '@/tests/ComprehensiveAdminTestDashboard';
import { OneSignalDebug } from '@/components/OneSignalDebug';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';

const AdminTests: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin, loading } = useUserRole();

  if (!user) {
    return <NavigateToLogin />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Načítám...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" />;
  }

  return (
    <div className="container mx-auto p-4">
      <OneSignalDebug />
      <ComprehensiveAdminTestDashboard />
    </div>
  );
};

export default AdminTests;