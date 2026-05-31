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

const GoogleIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
  </svg>
);

const FacebookIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
    <circle cx="12" cy="12" r="11" fill="#1877F2" />
    <path fill="#FFFFFF" d="M15.25 12.65l.35-2.29h-2.2V8.88c0-.63.31-1.24 1.29-1.24h1V5.69s-.91-.16-1.78-.16c-1.82 0-3.01 1.1-3.01 3.1v1.73H8.88v2.29h2.02v5.53h2.5v-5.53h1.85z" />
  </svg>
);

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
                  <Button type="button" variant="outline" className="relative w-full border-[rgba(255,138,0,0.2)] hover:border-[rgba(255,138,0,0.4)] hover:bg-[rgba(255,138,0,0.08)]" onClick={() => handleOAuthSignIn("google")}>
                    <span className="absolute left-4 top-1/2 -translate-y-1/2"><GoogleIcon /></span>
                    <span>Přihlásit se přes Google</span>
                  </Button>
                )}

                {ENABLED_OAUTH_PROVIDERS.includes("apple") && (
                  <Button type="button" variant="outline" className="w-full border-[rgba(255,138,0,0.2)] hover:border-[rgba(255,138,0,0.4)] hover:bg-[rgba(255,138,0,0.08)]" onClick={() => handleOAuthSignIn("apple")}>
                    Přihlásit se přes Apple
                  </Button>
                )}

                {ENABLED_OAUTH_PROVIDERS.includes("facebook") && (
                  <Button type="button" variant="outline" className="relative w-full border-[rgba(255,138,0,0.2)] hover:border-[rgba(255,138,0,0.4)] hover:bg-[rgba(255,138,0,0.08)]" onClick={() => handleOAuthSignIn("facebook")}>
                    <span className="absolute left-4 top-1/2 -translate-y-1/2"><FacebookIcon /></span>
                    <span>Přihlásit se přes Facebook</span>
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
