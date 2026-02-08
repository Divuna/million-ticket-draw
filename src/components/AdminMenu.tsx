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
  Award,
  Image,
  Handshake,
  Wrench,
  MessageSquare,
  BookOpen,
  UserX,
  Receipt,
  Link2,
  Megaphone
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUnreadMessagesCount } from '@/hooks/useUnreadMessagesCount';

export const AdminMenu: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadCount } = useUnreadMessagesCount();

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/admin' },
    { label: 'Výhry', icon: Award, path: '/admin/winners' },
    { label: 'Uživatelé', icon: Users, path: '/admin/users' },
    { label: 'Onboarding', icon: UserX, path: '/admin/onboarding-incomplete' },
    { label: 'Zprávy', icon: MessageSquare, path: '/admin/messages' },
    { label: 'Platby', icon: CreditCard, path: '/admin/payments' },
    { label: 'Vouchery', icon: Gift, path: '/admin/vouchers' },
    { label: 'Bannery', icon: Image, path: '/admin/banners' },
    { label: 'Partneři', icon: Handshake, path: '/admin/partners' },
    { label: 'Faktury', icon: Receipt, path: '/admin/invoices' },
    { label: 'Referraly', icon: Link2, path: '/admin/referrals' },
    { label: 'Ref. Dashboard', icon: BarChart3, path: '/admin/referral-dashboard' },
    { label: 'Influenceři', icon: Megaphone, path: '/admin/influencers' },
    { label: 'Provize', icon: BarChart3, path: '/admin/influencer-commissions' },
    { label: 'Obsah', icon: BookOpen, path: '/admin/content' },
    { label: 'Souhlasy', icon: FileText, path: '/admin/legal-acceptances' },
    { label: 'Notifikace', icon: Bell, path: '/admin/notifications' },
    { label: 'Statistiky', icon: BarChart3, path: '/admin/statistics' },
    { label: 'Audit', icon: FileText, path: '/admin/audit-logs' },
    { label: 'Testy', icon: Trophy, path: '/admin/tests' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-neon-blue/30 z-50 shadow-lg">
      <div className="absolute inset-0 bg-gradient-to-t from-neon-blue/5 to-transparent pointer-events-none"></div>
      <div className="flex justify-around py-2 px-1 relative z-10">
        {navItems.map((item) => {
          const Icon = item.icon;
          const showBadge = item.path === '/admin/messages' && unreadCount > 0;
          return (
            <Button
              key={item.path}
              variant="ghost"
              size="sm"
              className={`flex flex-col items-center gap-0.5 h-auto py-1.5 px-0.5 min-w-0 text-xs transition-all duration-300 relative ${
                isActive(item.path)
                  ? 'text-neon-gold bg-neon-blue/20 shadow-[0_0_12px_hsl(var(--neon-blue)/0.3)]'
                  : 'text-muted-foreground hover:text-primary hover:bg-neon-blue/10'
              }`}
              onClick={() => navigate(item.path)}
            >
              <div className="relative">
                <Icon className={`h-3 w-3 ${isActive(item.path) ? 'text-neon-gold' : ''}`} />
                {showBadge && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[8px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-medium leading-tight text-center">{item.label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
};