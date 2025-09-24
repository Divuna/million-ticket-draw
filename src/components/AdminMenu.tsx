import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Trophy, 
  Gift, 
  Users, 
  BarChart3, 
  Bell,
  CreditCard,
  FileText,
  Award
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export const AdminMenu: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/admin' },
    { label: 'Výhry', icon: Award, path: '/admin/winners' },
    { label: 'Uživatelé', icon: Users, path: '/admin/users' },
    { label: 'Platby', icon: CreditCard, path: '/admin/payments' },
    { label: 'Vouchery', icon: Gift, path: '/admin/vouchers' },
    { label: 'Bannery', icon: LayoutDashboard, path: '/admin/banners' },
    { label: 'Notifikace', icon: Bell, path: '/admin/notifications' },
    { label: 'Statistiky', icon: BarChart3, path: '/admin/statistics' },
    { label: 'Audit', icon: FileText, path: '/admin/audit-logs' },
    { label: 'Testy', icon: Trophy, path: '/admin/tests' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
      <div className="flex justify-around py-2 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.path}
              variant="ghost"
              size="sm"
              className={`flex flex-col items-center gap-0.5 h-auto py-1.5 px-0.5 min-w-0 text-xs ${
                isActive(item.path)
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => navigate(item.path)}
            >
              <Icon className="h-3 w-3" />
              <span className="text-[9px] font-medium leading-tight text-center">{item.label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
};