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
    { label: 'Notifikace', icon: Bell, path: '/admin/notifications' },
    { label: 'Statistiky', icon: BarChart3, path: '/admin/statistics' },
    { label: 'Audit', icon: FileText, path: '/admin/audit-logs' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
      <div className="grid grid-cols-4 gap-1 py-2 px-2 max-w-4xl mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.path}
              variant="ghost"
              size="sm"
              className={`flex flex-col items-center gap-1 h-auto py-2 px-1 ${
                isActive(item.path)
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => navigate(item.path)}
            >
              <Icon className="h-4 w-4" />
              <span className="text-xs font-medium">{item.label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
};