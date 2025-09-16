import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, User, Gift, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const BottomNavigation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { label: 'Domů', icon: Home, path: '/' },
    { label: 'Můj profil', icon: User, path: '/profile' },
    { label: 'Vouchery', icon: Gift, path: '/my-contests' },
    { label: 'Zprávy', icon: MessageCircle, path: '/messages' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
      <div className="flex items-center justify-around py-2 px-4 max-w-md mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.path}
              variant="ghost"
              size="sm"
              className={`flex flex-col items-center gap-1 h-auto py-2 px-3 ${
                isActive(item.path)
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => navigate(item.path)}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{item.label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
};