import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Home } from 'lucide-react';
import { useTestAuth } from '@/hooks/useTestAuth';

export const Header: React.FC = () => {
  const { user, signOut, loading } = useAuth();
  const { isAdmin } = useUserRole();
  const { testSignOut } = useTestAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) {
      console.log('⚠️ Sign out already in progress');
      return;
    }

    console.log('👋 Header: Initiating sign out...');
    setIsSigningOut(true);

    try {
      // Sign out from main auth
      await signOut();
      
      // Also clear test auth if present
      try {
        testSignOut();
        console.log('✅ Test auth cleared');
      } catch (err) {
        console.log('ℹ️ No test auth to clear');
      }

      console.log('✅ Sign out complete, redirecting to login');
      
      // Navigate to login page
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('❌ Sign out error in Header:', error);
      // Still redirect even on error
      navigate('/login', { replace: true });
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <header className="border-b bg-background">
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        <Link to="/" className="text-xl font-bold">
          OneMil
        </Link>
        
        <nav className="flex items-center space-x-4">
          {loading ? (
            <span className="text-sm text-muted-foreground">Načítám...</span>
          ) : user ? (
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
              <Button 
                variant="outline" 
                onClick={handleSignOut}
                disabled={isSigningOut}
              >
                {isSigningOut ? 'Odhlašuji...' : 'Odhlásit se'}
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