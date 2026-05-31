import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { ENABLED_OAUTH_PROVIDERS } from '@/config/socialAuth';

interface SocialAuthButtonsProps {
  mode: 'login' | 'register';
}

export const SocialAuthButtons = ({ mode }: SocialAuthButtonsProps) => {
  const handleOAuth = async (provider: 'google' | 'facebook' | 'apple') => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      toast({
        title: 'Chyba',
        description: error.message || 'Sociální přihlášení selhalo',
        variant: 'destructive',
      });
    }
  };

  // Hide social auth buttons unless explicitly enabled via env flags.
  // Prevents broken "provider is not enabled" buttons from showing.
  if (ENABLED_OAUTH_PROVIDERS.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {ENABLED_OAUTH_PROVIDERS.includes('google') && (
        <Button type="button" variant="outline" className="w-full" onClick={() => handleOAuth('google')}>
          Google
        </Button>
      )}
      {ENABLED_OAUTH_PROVIDERS.includes('facebook') && (
        <Button type="button" variant="outline" className="w-full" onClick={() => handleOAuth('facebook')}>
          Facebook
        </Button>
      )}
      {ENABLED_OAUTH_PROVIDERS.includes('apple') && (
        <Button type="button" variant="outline" className="w-full" onClick={() => handleOAuth('apple')}>
          Apple
        </Button>
      )}
    </div>
  );
};
