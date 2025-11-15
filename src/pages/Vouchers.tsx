import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { AdminMenu } from '@/components/AdminMenu';
import { BottomNavigation } from '@/components/BottomNavigation';
import { VoucherCarousel } from '@/components/VoucherCarousel';

const Vouchers: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center p-8">
          <h2 className="text-2xl font-bold mb-4">Přihlaste se</h2>
          <p className="text-muted-foreground mb-4">Pro zobrazení voucherů se musíte přihlásit</p>
          <button 
            onClick={() => window.location.href = '/login'}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Přihlásit se
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <VoucherCarousel />
      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default Vouchers;