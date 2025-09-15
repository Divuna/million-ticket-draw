import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

export const Header: React.FC = () => {
  const { user, signOut } = useAuth();

  return (
    <header className="border-b bg-background">
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        <Link to="/" className="text-xl font-bold">
          OneMil
        </Link>
        
        <nav className="flex items-center space-x-4">
          {user ? (
            <>
              {/* Show different navigation for admin vs regular users */}
              {user.email === 'divispavel2@gmail.com' ? (
                <>
                  <Link to="/">
                    <Button variant="ghost">ÚVODNÍ STRÁNKA</Button>
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