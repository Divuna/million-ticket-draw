import { useCallback, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

import logo from "@/assets/logo-onemil.png";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase, supabaseUrl } from "@/integrations/supabase/client";
import { buildLoginRedirectUrl } from "@/lib/loginRedirect";

const STAGING_PROJECT_REF = "dxmowysntemfqfnanxua";

type AuthorizationDetails = {
  authorization_id: string;
  redirect_uri?: string;
  client: {
    client_id: string;
    client_name: string;
    client_uri: string;
    logo_uri: string;
  };
  scope: string;
};

function isStagingAuthProject(): boolean {
  try {
    return new URL(supabaseUrl).hostname === `${STAGING_PROJECT_REF}.supabase.co`;
  } catch {
    return false;
  }
}

const scopeLabels: Record<string, string> = {
  openid: "Ověřit identitu přihlášeného uživatele",
  email: "Přečíst e-mail přihlášeného uživatele",
  offline_access: "Udržet připojení aktivní pomocí obnovovacího tokenu",
};

export default function OAuthConsent() {
  const { user } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const authorizationId = searchParams.get("authorization_id")?.trim() ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAuthorization = useCallback(async () => {
    if (!isStagingAuthProject()) {
      setError("OAuth consent je dostupný pouze ve staging prostředí.");
      setLoading(false);
      return;
    }

    if (!authorizationId) {
      setError("Chybí authorization_id. Zahajte připojení z ChatGPT znovu.");
      setLoading(false);
      return;
    }

    if (!user) {
      navigate(buildLoginRedirectUrl(`${location.pathname}${location.search}`), { replace: true });
      return;
    }

    if (roleLoading) return;
    if (!isSuperAdmin) {
      setError("Toto stagingové připojení může povolit pouze schválený superadmin.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (detailsError || !data) {
      setError(detailsError?.message ?? "Autorizační požadavek není platný nebo už vypršel.");
      setLoading(false);
      return;
    }

    const authorization = data as AuthorizationDetails;
    if (authorization.redirect_uri) {
      window.location.assign(authorization.redirect_uri);
      return;
    }

    setDetails(authorization);
    setLoading(false);
  }, [authorizationId, isSuperAdmin, location.pathname, location.search, navigate, roleLoading, user]);

  useEffect(() => {
    void loadAuthorization();
  }, [loadAuthorization]);

  const decide = async (decision: "approve" | "deny") => {
    if (!authorizationId || submitting) return;
    setSubmitting(decision);
    setError(null);

    const response = decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });

    if (response.error || !response.data?.redirect_url) {
      setError(response.error?.message ?? "Autorizační rozhodnutí se nepodařilo dokončit.");
      setSubmitting(null);
      return;
    }

    window.location.assign(response.data.redirect_url);
  };

  if (!isStagingAuthProject()) {
    return <Navigate to="/" replace />;
  }

  const scopes = details?.scope.split(/\s+/).filter(Boolean) ?? [];

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <img src={logo} alt="OneMil" className="mx-auto mb-6 h-14 w-auto object-contain" />
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <CardTitle>Povolit stagingový Work connector</CardTitle>
            <CardDescription>
              {details?.client.client_name || "ChatGPT Work"} žádá o propojení s OneMil stagingem.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {loading && <p className="text-center text-sm text-muted-foreground">Načítám autorizační požadavek…</p>}
            {error && (
              <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {details && !error && (
              <>
                <div className="rounded-md border bg-muted/30 p-4 text-sm">
                  <p className="font-medium">Požadovaný přístup</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    {scopes.map((scope) => <li key={scope}>{scopeLabels[scope] ?? scope}</li>)}
                  </ul>
                </div>
                <p className="text-sm text-muted-foreground">
                  Connector bude moci odeslat schválené dávky e-shopů do stagingového intake a číst stav jejich zpracování.
                  Nemá přímý přístup k databázi a neumí odesílat e-maily.
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  Návratová adresa: {details.redirect_uri || "bude ověřena Supabase Auth při dokončení"}
                </p>
              </>
            )}
          </CardContent>

          <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={!details || Boolean(submitting)} onClick={() => void decide("deny")}>
              {submitting === "deny" ? "Zamítám…" : "Zamítnout"}
            </Button>
            <Button disabled={!details || Boolean(submitting)} onClick={() => void decide("approve")}>
              {submitting === "approve" ? "Povoluji…" : "Povolit"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
