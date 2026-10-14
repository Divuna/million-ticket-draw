import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, KeyRound, Loader2, Mail } from "lucide-react";
import logo from "@/assets/logo-onemil.png";

type PageMode = "request" | "update" | "success";

function resetRedirectUrl() {
  const base = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/+$/, "");
  return `${base}/reset-password`;
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const { session, isPasswordRecovery } = useAuth();
  const [mode, setMode] = useState<PageMode>("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Detect an expired / already-used recovery link. Supabase returns the failure
  // in the URL hash (or query) as error / error_code / error_description — e.g. a
  // one-time link pre-fetched by an email scanner arrives already consumed. Without
  // this, the page could fall through to "update" mode on a stale session and then
  // updateUser fails with an opaque error.
  useEffect(() => {
    const parse = (raw: string) =>
      new URLSearchParams(raw.startsWith("#") || raw.startsWith("?") ? raw.slice(1) : raw);
    const hp = parse(window.location.hash || "");
    const sp = parse(window.location.search || "");
    const err = hp.get("error") || sp.get("error");
    const errCode = hp.get("error_code") || sp.get("error_code");
    const errDesc = hp.get("error_description") || sp.get("error_description");
    if (err || errCode) {
      // Log the exact Supabase error so the cause is diagnosable.
      console.error("ResetPassword: recovery link error", { err, errCode, errDesc });
      setLinkError(
        "Odkaz pro nastavení hesla vypršel nebo už byl použit. Vyžádejte si prosím nový odkaz níže.",
      );
      setMode("request");
    }
  }, []);

  useEffect(() => {
    if (isPasswordRecovery || session?.user) {
      setEmail(session?.user?.email ?? "");
      setMode("update");
    }
  }, [isPasswordRecovery, session?.user]);

  const handleRequestReset = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      toast.error("Zadejte e-mail");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: resetRedirectUrl(),
      });

      if (error) throw error;

      toast.success("E-mail pro obnovení hesla byl odeslán", {
        description: "Pokud u nás máte účet, najdete ve schránce odkaz pro nastavení nového hesla.",
      });
      setMode("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Zkuste to prosím znovu.";
      toast.error("Reset hesla se nepodařilo odeslat", { description: message });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!password.trim()) {
      toast.error("Zadejte nové heslo");
      return;
    }

    if (password.length < 8) {
      toast.error("Heslo musí mít alespoň 8 znaků");
      return;
    }

    if (password !== confirm) {
      toast.error("Hesla se neshodují", {
        description: "Ujistěte se, že obě hesla jsou stejná.",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast.success("Heslo bylo změněno", {
        description: "Teď se můžete přihlásit novým heslem.",
      });
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      // Log the exact Supabase auth error so the failure is diagnosable.
      console.error("ResetPassword: updateUser failed", error);
      const raw = error instanceof Error ? error.message : "";
      const lower = raw.toLowerCase();
      let description = raw || "Zkuste to prosím znovu.";
      if (
        lower.includes("session") ||
        lower.includes("jwt") ||
        lower.includes("token") ||
        lower.includes("expired") ||
        lower.includes("invalid")
      ) {
        // Most common real cause: the one-time recovery link expired or was already
        // used (e.g. pre-fetched by an email scanner), so there is no valid session.
        description =
          "Odkaz pro nastavení hesla vypršel nebo už byl použit. Vyžádejte si prosím nový odkaz.";
      } else if (lower.includes("weak") || lower.includes("at least") || lower.includes("should be at least")) {
        description = "Heslo je příliš slabé. Zvolte silnější heslo (alespoň 8 znaků).";
      } else if (lower.includes("different from the old")) {
        description = "Nové heslo musí být jiné než to staré.";
      }
      toast.error("Heslo se nepodařilo změnit", { description });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background via-background to-[hsl(222_40%_8%)] p-4">
      <div className="w-full max-w-md">
        <Link to="/" aria-label="OneMil domů">
          <img
            src={logo}
            alt="OneMil logo"
            className="h-16 w-auto mx-auto mb-4 object-contain onemil-logo-animated"
          />
        </Link>

        <Card className="w-full voucher-card-glow rounded-[20px] bg-gradient-to-b from-[hsl(220_30%_12%)] via-[hsl(220_28%_9%)] to-[hsl(222_35%_7%)] border-[2px] border-[rgba(255,138,0,0.15)] shadow-[0_4px_24px_hsl(222_50%_3%/0.6)]">
          {mode === "request" && (
            <form onSubmit={handleRequestReset}>
              <CardHeader>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="customer-premium-orange-heading text-heading-gold">Obnovení hesla</CardTitle>
                <CardDescription>
                  Zadejte e-mail k vašemu účtu. Pošleme vám odkaz pro nastavení nového hesla.
                </CardDescription>
                {linkError && (
                  <p className="mt-2 text-sm rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">
                    {linkError}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="reset-email">E-mail</Label>
                  <Input
                    id="reset-email"
                    data-testid="reset-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="vas@email.cz"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button
                  type="submit"
                  data-testid="reset-request-submit"
                  className="w-full rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-black"
                  disabled={loading}
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Poslat odkaz pro obnovení
                </Button>
                <Link to="/login" className="text-sm text-muted-foreground hover:text-primary">
                  Zpět na přihlášení
                </Link>
              </CardFooter>
            </form>
          )}

          {mode === "success" && (
            <>
              <CardHeader>
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-2">
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                </div>
                <CardTitle className="customer-premium-orange-heading text-heading-gold">Zkontrolujte e-mail</CardTitle>
                <CardDescription>
                  Pokud u nás máte účet, poslali jsme vám odkaz pro nastavení nového hesla.
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/login">Zpět na přihlášení</Link>
                </Button>
              </CardFooter>
            </>
          )}

          {mode === "update" && (
            <form onSubmit={handleUpdatePassword}>
              <CardHeader>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <KeyRound className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="customer-premium-orange-heading text-heading-gold">Nastavte nové heslo</CardTitle>
                <CardDescription>
                  Zvolte nové heslo pro svůj zákaznický účet OneMil.
                </CardDescription>
                {email && (
                  <p className="text-sm text-muted-foreground">
                    Účet: <span className="font-medium text-foreground">{email}</span>
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-password">Nové heslo</Label>
                  <Input
                    id="reset-password"
                    data-testid="reset-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Alespoň 8 znaků"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-confirm">Potvrďte heslo</Label>
                  <Input
                    id="reset-confirm"
                    data-testid="reset-confirm"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Zopakujte heslo"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button
                  type="submit"
                  data-testid="reset-update-submit"
                  className="w-full rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-black"
                  disabled={loading}
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Změnit heslo
                </Button>
                <Link to="/login" className="text-sm text-muted-foreground hover:text-primary">
                  Zpět na přihlášení
                </Link>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
