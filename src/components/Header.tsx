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
    <header className="sticky top-0 z-50 backdrop-blur-md bg-background/70 shadow-lg h-20 md:h-28 flex items-center border-b border-white/5">
      <div className="container mx-auto flex items-center justify-between px-4">
        <Link to="/" className="flex items-center">
          <img
            src={logo}
            alt="OneMil logo"
            className="h-12 md:h-20 w-auto object-contain onemil-logo-animated onemil-logo-hover drop-shadow-[0_0_12px_rgba(255,215,0,0.25)]"
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