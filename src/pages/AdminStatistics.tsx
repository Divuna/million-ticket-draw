import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { BarChart3, Users, CreditCard, Trophy, Gift, Ticket, UserX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NavigateToLogin } from '@/components/NavigateToLogin';

interface Statistics {
  totalUsers: number;
  totalContests: number;
  totalTickets: number;
  totalPayments: number;
  totalVouchers: number;
  totalBonusPrizes: number;
  revenueThisMonth: number;
  activeContests: number;
  incompleteOnboarding: number;
}

const AdminStatistics: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Statistics>({
    totalUsers: 0,
    totalContests: 0,
    totalTickets: 0,
    totalPayments: 0,
    totalVouchers: 0,
    totalBonusPrizes: 0,
    revenueThisMonth: 0,
    activeContests: 0,
    incompleteOnboarding: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAdmin) {
      fetchStatistics();
    }
  }, [isAdmin]);

  const fetchStatistics = async () => {
    try {
      // Fetch all statistics in parallel
      const [
        { count: usersCount },
        { count: contestsCount },
        { count: ticketsCount },
        { count: paymentsCount },
        { count: vouchersCount },
        { count: bonusPrizesCount },
        { count: activeContestsCount },
        { data: revenueData },
        { count: incompleteOnboardingCount }
      ] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('contests').select('*', { count: 'exact', head: true }),
        supabase.from('tickets').select('*', { count: 'exact', head: true }),
        supabase.from('payments').select('*', { count: 'exact', head: true }),
        supabase.from('vouchers').select('*', { count: 'exact', head: true }),
        supabase.from('bonus_prizes').select('*', { count: 'exact', head: true }),
        supabase.from('contests').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase
          .from('payments')
          .select('amount')
          .eq('status', 'completed')
          .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .is('date_of_birth', null)
      ]);

      const revenueThisMonth = revenueData?.reduce((sum, payment) => sum + (payment.amount || 0), 0) || 0;

      setStats({
        totalUsers: usersCount || 0,
        totalContests: contestsCount || 0,
        totalTickets: ticketsCount || 0,
        totalPayments: paymentsCount || 0,
        totalVouchers: vouchersCount || 0,
        totalBonusPrizes: bonusPrizesCount || 0,
        revenueThisMonth,
        activeContests: activeContestsCount || 0,
        incompleteOnboarding: incompleteOnboardingCount || 0
      });
    } catch (error) {
      console.error('Error fetching statistics:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se načíst statistiky",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (roleLoading) {
    return <div className="flex items-center justify-center min-h-screen">Načítání...</div>;
  }

  if (authLoading) {
    return null;
  }

  if (!user || !isAdmin) {
    return <NavigateToLogin />;
  }

  const statsCards = [
    {
      title: "Celkem uživatelů",
      value: stats.totalUsers,
      icon: Users,
      description: "Registrovaní uživatelé"
    },
    {
      title: "Aktivní soutěže", 
      value: stats.activeContests,
      icon: Trophy,
      description: "Probíhající soutěže"
    },
    {
      title: "Celkem soutěží",
      value: stats.totalContests,
      icon: Trophy,
      description: "Všechny vytvořené soutěže"
    },
    {
      title: "Prodané tikety",
      value: stats.totalTickets,
      icon: Ticket,
      description: "Celkový počet tiketů"
    },
    {
      title: "Bonusové ceny",
      value: stats.totalBonusPrizes,
      icon: Gift,
      description: "Vytvořené bonusy"
    },
    {
      title: "Vouchery",
      value: stats.totalVouchers,
      icon: Gift,
      description: "Vydané vouchery"
    },
    {
      title: "Platby",
      value: stats.totalPayments,
      icon: CreditCard,
      description: "Celkový počet plateb"
    },
    {
      title: "Příjmy tento měsíc",
      value: `${stats.revenueThisMonth} Kč`,
      icon: CreditCard,
      description: "Dokončené platby"
    },
    {
      title: "Nedokončený onboarding",
      value: stats.incompleteOnboarding,
      icon: UserX,
      description: "Uživatelé bez data narození",
      link: "/admin/onboarding-incomplete",
      highlight: stats.incompleteOnboarding > 0
    }
  ];

  return (
    <div className="container mx-auto px-4 py-6 pb-8">
        <Card className="mb-6 luxury-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <BarChart3 className="h-5 w-5 text-neon-gold" />
              Statistiky aplikace
            </CardTitle>
            <CardDescription>
              Přehled klíčových metrik a výkonnosti aplikace
            </CardDescription>
          </CardHeader>
        </Card>

        {loading ? (
          <div className="text-center py-8">Načítání statistik...</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {statsCards.map((card, index) => {
              const Icon = card.icon;
              const isClickable = 'link' in card && card.link;
              return (
                <Card 
                  key={index} 
                  className={`luxury-card admin-card-hover overflow-hidden ${isClickable ? 'cursor-pointer' : ''} ${card.highlight ? 'ring-2 ring-orange-500/50' : ''}`}
                  onClick={() => isClickable && navigate(card.link)}
                >
                  <div className="absolute top-0 right-0 w-32 h-32 luxury-gradient-bg opacity-30 blur-2xl rounded-full"></div>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                    <CardTitle className="text-sm font-medium">
                      {card.title}
                    </CardTitle>
                    <div className={`luxury-stat-icon p-2 rounded-lg ${card.highlight ? 'bg-orange-500/20' : ''}`}>
                      <Icon className={`h-4 w-4 ${card.highlight ? 'text-orange-500' : 'text-neon-gold'}`} />
                    </div>
                  </CardHeader>
                  <CardContent className="relative z-10">
                    <div className={`text-2xl font-bold ${card.highlight ? 'text-orange-500' : 'text-primary'}`}>{card.value}</div>
                    <p className="text-xs text-muted-foreground">
                      {card.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Card className="mt-6 luxury-card">
          <CardHeader>
            <CardTitle className="text-primary">Rychlé akce</CardTitle>
            <CardDescription>
              Přístup k nejčastějším admin funkcím
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="luxury-card cursor-pointer admin-card-hover" 
                    onClick={() => navigate('/admin/users')}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-neon-gold" />
                    <span className="text-sm font-medium">Správa uživatelů</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">
                    Spravujte uživatele a jejich role
                  </p>
                </CardContent>
              </Card>

              <Card className="luxury-card cursor-pointer admin-card-hover"
                    onClick={() => navigate('/admin/payments')}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-neon-gold" />
                    <span className="text-sm font-medium">Správa plateb</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">
                    Přehled plateb a refundací
                  </p>
                </CardContent>
              </Card>

              <Card className="luxury-card cursor-pointer admin-card-hover"
                    onClick={() => navigate('/admin/vouchers')}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-neon-gold" />
                    <span className="text-sm font-medium">Správa voucherů</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">
                    Vytvářejte a spravujte vouchery
                  </p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
  );
};

export default AdminStatistics;