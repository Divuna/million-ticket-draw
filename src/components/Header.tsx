import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Home } from 'lucide-react';
import logo from '@/assets/logo-onemil.png';

export const Header: React.FC = () => {
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRole();

  return (
    <header className="sticky top-0 z-50 h-24 md:h-32 bg-background/70 backdrop-blur-xl border-b border-white/10 shadow-[0_4px_25px_rgba(0,0,0,0.4)] flex items-center">
      <div className="container mx-auto flex items-center justify-between px-4">
        <Link to="/" className="flex items-center">
          <img
            src={logo}
            alt="OneMil logo"
            className="h-16 md:h-24 w-auto object-contain transition-all duration-300 onemil-logo-hover drop-shadow-[0_0_18px_rgba(255,220,100,0.45)] animate-pulse-slow"
          />
        </Link>
        
        <nav className="flex items-center space-x-4">
          {user ? (
            <>
              {/* Show different navigation for admin vs regular users */}
              {isAdmin ? (
                <>
                  <Link to="/">
                    <Button variant="ghost" className="transition-all duration-200 hover:scale-105 hover:text-primary">
                      <Home className="mr-2 h-4 w-4" />
                      ÚVODNÍ STRÁNKA
                    </Button>
                  </Link>
                  <Link to="/admin">
                    <Button variant="ghost" className="transition-all duration-200 hover:scale-105 hover:text-primary">Admin</Button>
                  </Link>
                </>
              ) : (
                <Link to="/profile">
                  <Button variant="ghost" className="transition-all duration-200 hover:scale-105 hover:text-primary">Profil</Button>
                </Link>
              )}
              <Button variant="outline" onClick={signOut} className="transition-all duration-200 hover:scale-105">
                Odhlásit se
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" className="transition-all duration-200 hover:scale-105 hover:text-primary">Přihlásit</Button>
              </Link>
              <Link to="/register">
                <Button variant="default" className="transition-all duration-200 hover:scale-105">Registrovat</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};