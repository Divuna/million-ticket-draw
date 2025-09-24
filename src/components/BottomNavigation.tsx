import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, User, Gift, MessageCircle, GamepadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const BottomNavigation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { label: 'Domů', icon: Home, path: '/' },
    { label: 'Můj profil', icon: User, path: '/profile' },
    { label: 'Vouchery', icon: Gift, path: '/vouchers' },
    { label: 'Moje hry', icon: GamepadIcon, path: '/my-contests' },
    { label: 'Zprávy', icon: MessageCircle, path: '/messages' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 h-16">
      <div className="flex items-center justify-around py-3 px-2 max-w-md mx-auto h-full">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.path}
              variant="ghost"
              size="sm"
              className={`flex flex-col items-center gap-1 h-auto py-2 px-2 min-w-[60px] ${
                isActive(item.path)
                  ? 'text-primary bg-primary/15 scale-105'
                  : 'text-muted-foreground hover:text-foreground hover:scale-105'
              } transition-all duration-200`}
              onClick={() => navigate(item.path)}
            >
              <Icon className="h-6 w-6" />
              <span className="text-xs font-medium leading-tight text-center">{item.label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
};