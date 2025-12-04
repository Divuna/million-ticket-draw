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
    <header className="border-b bg-background">
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        <Link to="/" className="flex items-center">
          <img
            src={logo}
            alt="OneMil logo"
            className="h-10 w-auto object-contain onemil-logo-animated transition-transform duration-200 hover:scale-105"
          />
        </Link>
        
        <nav className="flex items-center space-x-4">
          {user ? (
            <>
              {/* Show different navigation for admin vs regular users */}
              {isAdmin ? (
                <>
                  <Link to="/">
                    <Button variant="ghost">
                      <Home className="mr-2 h-4 w-4" />
                      ÚVODNÍ STRÁNKA
                    </Button>
                  </Link>
                  <Link to="/admin">
                    <Button variant="ghost">Admin</Button>
                  </Link>
                </>
              ) : (
                <Link to="/profile">
                  <Button variant="ghost">Profil</Button>
                </Link>
              )}
              <Button variant="outline" onClick={signOut}>
                Odhlásit se
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost">Přihlásit</Button>
              </Link>
              <Link to="/register">
                <Button variant="default">Registrovat</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};