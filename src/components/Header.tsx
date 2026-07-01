import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { buildLoginRedirectUrl } from '@/lib/loginRedirect';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useAdminRealtimeContext } from '@/components/AdminRealtimeProvider';
import { AdminSoundIndicator } from '@/components/AdminSoundIndicator';
import logo from '@/assets/logo-onemil.png';

export const Header: React.FC = () => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const { soundEnabled, toggleSound, realtimeConnected, lastRealtimeEvent } = useAdminRealtimeContext();

  return (
    <>
    <header className="public-customer-header sticky top-0 z-50 h-16 md:h-20 bg-background/70 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-4">
      <div className="container mx-auto flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={logo}
              alt="OneMil logo"
              className="h-12 md:h-20 w-auto object-contain"
            />
          </Link>
          
          {/* Admin sound indicator next to logo */}
          {isAdmin && (
            <AdminSoundIndicator
              soundEnabled={soundEnabled}
              realtimeConnected={realtimeConnected}
              lastRealtimeEvent={lastRealtimeEvent}
              onToggleSound={toggleSound}
            />
          )}
        </div>
        
        <nav className="flex items-center space-x-4">
          {user ? (
            <>
              {/* All users see profile link, admins also see admin dashboard link */}
              <Link to="/profile">
                <Button variant="ghost" className="public-customer-header-link">Profil</Button>
              </Link>
              {isAdmin && (
                <Link to="/admin">
                  <Button variant="ghost" className="public-customer-header-link">Admin</Button>
                </Link>
              )}
              <Button variant="outline" className="public-customer-header-outline" onClick={signOut}>
                Odhlásit se
              </Button>
            </>
          ) : (
            <>
              <Link to={buildLoginRedirectUrl(location.pathname + location.search)}>
                <Button variant="ghost" className="public-customer-header-link">Přihlásit</Button>
              </Link>
              <Link to="/register">
                <Button variant="default" className="public-customer-header-primary">Registrovat</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
    </>
  );
};
