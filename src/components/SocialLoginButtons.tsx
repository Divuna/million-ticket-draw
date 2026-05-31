import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ENABLED_OAUTH_PROVIDERS } from "@/config/socialAuth";

interface SocialLoginButtonsProps {
  redirectTo?: string;
}

export const SocialLoginButtons = ({ redirectTo }: SocialLoginButtonsProps) => {
  const handleSocialLogin = async (provider: "google" | "facebook" | "apple") => {
    try {
      const redirectUrl = redirectTo
        ? `${window.location.origin}${redirectTo}`
        : `${window.location.origin}/`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
        },
      });

      if (error) throw error;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Přihlášení selhalo";
      toast.error(message);
    }
  };

  // Hide social login buttons unless explicitly enabled via env flags.
  // Prevents broken "provider is not enabled" buttons from showing.
  if (ENABLED_OAUTH_PROVIDERS.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {ENABLED_OAUTH_PROVIDERS.includes("google") && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => handleSocialLogin("google")}
        >
          Přihlásit se přes Google
        </Button>
      )}
      {ENABLED_OAUTH_PROVIDERS.includes("facebook") && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => handleSocialLogin("facebook")}
        >
          Přihlásit se přes Facebook
        </Button>
      )}
      {ENABLED_OAUTH_PROVIDERS.includes("apple") && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => handleSocialLogin("apple")}
        >
          Přihlásit se přes Apple
        </Button>
      )}
    </div>
  );
};
