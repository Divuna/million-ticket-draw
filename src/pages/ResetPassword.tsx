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
      const message = error instanceof Error ? error.message : "Zkuste to prosím znovu.";
      toast.error("Heslo se nepodařilo změnit", { description: message });
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
                <CardTitle className="text-heading-gold">Obnovení hesla</CardTitle>
                <CardDescription>
                  Zadejte e-mail k vašemu zákaznickému účtu. Pošleme vám odkaz pro nastavení nového hesla.
                </CardDescription>
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
                <CardTitle className="text-heading-gold">Zkontrolujte e-mail</CardTitle>
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
                <CardTitle className="text-heading-gold">Nastavte nové heslo</CardTitle>
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
