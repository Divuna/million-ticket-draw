import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import '@/components/ContestCard.css';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "@/hooks/use-toast";
import logo from "@/assets/logo-onemil.png";
import { ENABLED_OAUTH_PROVIDERS, type OAuthProvider } from "@/config/socialAuth";

/** Same-origin path only (open-redirect safe). Lives in this file only. */
function safeRedirectPath(raw: string | null): string | null {
  if (raw == null || typeof raw !== "string") return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw.trim());
  } catch {
    return null;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return null;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(decoded)) return null;
  return decoded;
}

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingEmailLoginNav, setPendingEmailLoginNav] = useState(false);
  const [searchParams] = useSearchParams();
  const redirectRaw = searchParams.get("redirect");
  const { signIn, signInWithOAuth, user, loading: authLoading } = useAuth();
  const {
    isAdmin,
    isPartnerAccount,
    isInfluencerAccount,
    loading: roleLoading,
  } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (!pendingEmailLoginNav) return;
    if (authLoading || !user) return;
    if (roleLoading) return;

    const redirectTarget = safeRedirectPath(redirectRaw);
    if (redirectTarget) {
      navigate(redirectTarget, { replace: true });
    } else if (isAdmin) {
      navigate("/admin", { replace: true });
    } else if (isInfluencerAccount) {
      navigate("/influencer/dashboard", { replace: true });
    } else if (isPartnerAccount) {
      navigate("/partner/dashboard", { replace: true });
    } else {
      navigate("/profile", { replace: true });
    }
    setPendingEmailLoginNav(false);
  }, [
    pendingEmailLoginNav,
    authLoading,
    user,
    roleLoading,
    isAdmin,
    isPartnerAccount,
    isInfluencerAccount,
    redirectRaw,
    navigate,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await signIn(email.trim(), password);

      if (error) {
        const isEmailNotConfirmed =
          error.message?.toLowerCase().includes("email not confirmed") ||
          (error as any)?.code === "email_not_confirmed";
        toast({
          title: "Chyba přihlášení",
          description: isEmailNotConfirmed
            ? "Váš e-mail ještě nebyl potvrzen. Zkontrolujte svou e-mailovou schránku a klikněte na potvrzovací odkaz."
            : error.message,
          variant: "destructive",
        });
      } else {
        setPendingEmailLoginNav(true);
      }
    } catch (error) {
      toast({
        title: "Chyba",
        description: "Něco se pokazilo. Zkuste to znovu.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: OAuthProvider) => {
    try {
      await signInWithOAuth(provider, redirectRaw);
    } catch (error) {
      toast({
        title: "Chyba přihlášení",
        description: "Přihlášení se nezdařilo. Zkuste to znovu.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background via-background to-[hsl(222_40%_8%)] p-4">
      <div className="w-full max-w-md">
        <img
          src={logo}
          alt="OneMil logo"
          className="h-16 w-auto mx-auto mb-4 object-contain onemil-logo-animated"
        />
        <Card className="w-full voucher-card-glow rounded-[20px] bg-gradient-to-b from-[hsl(220_30%_12%)] via-[hsl(220_28%_9%)] to-[hsl(222_35%_7%)] border-[2px] border-[rgba(255,138,0,0.15)] shadow-[0_4px_24px_hsl(222_50%_3%/0.6)]">
        <CardHeader>
          <CardTitle className="text-heading-gold">Přihlášení</CardTitle>
          <CardDescription>Přihlaste se ke svému účtu OneMil</CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                E-mail
              </label>
              <Input
                id="email"
                type="text"
                inputMode="email"
                autoComplete="email"
                placeholder="vas@email.cz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Heslo
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Vaše heslo"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-black shadow-[0_2px_12px_rgba(255,138,0,0.25)] hover:shadow-[0_4px_16px_rgba(255,138,0,0.35)] hover:brightness-110 transition-all" disabled={loading}>
              {loading ? "Přihlašuji..." : "Přihlásit se"}
            </Button>

            {ENABLED_OAUTH_PROVIDERS.length > 0 && (
              <div className="flex flex-col space-y-2 w-full">
                {ENABLED_OAUTH_PROVIDERS.includes("google") && (
                  <Button type="button" variant="outline" className="w-full border-[rgba(255,138,0,0.2)] hover:border-[rgba(255,138,0,0.4)] hover:bg-[rgba(255,138,0,0.08)]" onClick={() => handleOAuthSignIn("google")}>
                    Přihlásit se přes Google
                  </Button>
                )}

                {ENABLED_OAUTH_PROVIDERS.includes("apple") && (
                  <Button type="button" variant="outline" className="w-full border-[rgba(255,138,0,0.2)] hover:border-[rgba(255,138,0,0.4)] hover:bg-[rgba(255,138,0,0.08)]" onClick={() => handleOAuthSignIn("apple")}>
                    Přihlásit se přes Apple
                  </Button>
                )}

                {ENABLED_OAUTH_PROVIDERS.includes("facebook") && (
                  <Button type="button" variant="outline" className="w-full border-[rgba(255,138,0,0.2)] hover:border-[rgba(255,138,0,0.4)] hover:bg-[rgba(255,138,0,0.08)]" onClick={() => handleOAuthSignIn("facebook")}>
                    Přihlásit se přes Facebook
                  </Button>
                )}
              </div>
            )}

            <p className="text-sm text-muted-foreground text-center">
              Nemáte účet?{" "}
              <Link to="/register" className="text-primary hover:underline">
                Zaregistrujte se
              </Link>
            </p>
          </CardFooter>
        </form>
        </Card>
      </div>
    </div>
  );
};

export default Login;
