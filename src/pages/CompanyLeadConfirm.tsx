import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type PageState =
  | { kind: "loading" }
  | { kind: "ready"; companyName: string; salesRepName: string | null; expiresAt: string | null; token: string }
  | { kind: "success"; action: "confirm" | "reject"; companyName: string }
  | { kind: "error"; reason: "invalid" | "expired" | "already_processed" | "unknown" };

function getEfUrl(): string {
  const base = (
    import.meta.env.VITE_SUPABASE_URL ?? ""
  ).replace(/\/$/, "");
  return `${base}/functions/v1/confirm-affiliate-company-lead`;
}

function getAnonKey(): string {
  return import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
}

async function fetchTokenInfo(token: string): Promise<PageState> {
  const efUrl = getEfUrl();
  const res = await fetch(`${efUrl}?token=${encodeURIComponent(token)}`, {
    method: "GET",
    headers: {
      apikey: getAnonKey(),
      "Content-Type": "application/json",
    },
  });

  if (res.status === 404) return { kind: "error", reason: "invalid" };
  if (res.status === 410) return { kind: "error", reason: "expired" };
  if (res.status === 409) return { kind: "error", reason: "already_processed" };
  if (!res.ok) return { kind: "error", reason: "unknown" };

  const body = (await res.json()) as { success: boolean; company_name?: string; sales_rep_name?: string | null; expires_at?: string | null };
  if (!body.success || !body.company_name) return { kind: "error", reason: "unknown" };

  return {
    kind: "ready",
    companyName: body.company_name,
    salesRepName: body.sales_rep_name ?? null,
    expiresAt: body.expires_at ?? null,
    token,
  };
}

async function postAction(
  token: string,
  action: "confirm" | "reject",
  rejectionReason?: string,
): Promise<{ success: boolean; companyName?: string; errorReason?: "invalid" | "expired" | "already_processed" | "unknown" }> {
  const efUrl = getEfUrl();
  const res = await fetch(efUrl, {
    method: "POST",
    headers: {
      apikey: getAnonKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token, action, rejection_reason: rejectionReason ?? null }),
  });

  if (res.status === 404) return { success: false, errorReason: "invalid" };
  if (res.status === 410) return { success: false, errorReason: "expired" };
  if (res.status === 409) return { success: false, errorReason: "already_processed" };
  if (!res.ok) return { success: false, errorReason: "unknown" };

  const body = (await res.json()) as { success: boolean; company_name?: string };
  if (!body.success) return { success: false, errorReason: "unknown" };
  return { success: true, companyName: body.company_name };
}

export default function CompanyLeadConfirm() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const actionParam = params.get("action");

  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [acting, setActing] = useState(false);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    if (!token) {
      setState({ kind: "error", reason: "invalid" });
      return;
    }
    fetchTokenInfo(token).then(setState);
  }, [token]);

  async function handleAction(action: "confirm" | "reject") {
    if (state.kind !== "ready" || acting) return;
    setActing(true);
    const result = await postAction(state.token, action, action === "reject" ? rejectionReason : undefined);
    setActing(false);
    if (result.success) {
      setState({ kind: "success", action, companyName: result.companyName ?? state.companyName });
    } else {
      setState({ kind: "error", reason: result.errorReason ?? "unknown" });
    }
  }

  function handleRejectClick() {
    setShowRejectReason(true);
  }

  function handleRejectConfirm() {
    handleAction("reject");
  }

  return (
    <div className="min-h-screen bg-[#0A0B0F] flex flex-col items-center justify-center p-4">
      {/* Logo area */}
      <div className="mb-8 flex items-center gap-2">
        <Building2 className="w-6 h-6 text-[#FF8A00]" />
        <span className="text-xl font-semibold text-[#E7EBF0] tracking-tight">OneMil</span>
      </div>

      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-[#101722] p-8 shadow-2xl">

          {/* Loading */}
          {state.kind === "loading" && (
            <div className="flex flex-col items-center gap-4 py-8" data-testid="clc-loading">
              <Loader2 className="w-8 h-8 text-[#FF8A00] animate-spin" />
              <p className="text-[#BFC6CF] text-sm">Načítám žádost…</p>
            </div>
          )}

          {/* Ready — show summary + CTA buttons */}
          {state.kind === "ready" && (
            <div data-testid="clc-ready">
              <h1 className="text-xl font-bold text-[#E7EBF0] mb-2">Žádost o registraci firmy</h1>
              <p className="text-[#8E98A6] text-sm mb-6">
                Zkontrolujte níže uvedené informace a rozhodněte, zda žádost potvrdíte.
              </p>

              <div className="space-y-3 mb-8">
                <div className="rounded-lg bg-[#1D2128] px-4 py-3">
                  <p className="text-xs text-[#8E98A6] uppercase tracking-wide mb-1">Firma</p>
                  <p className="text-[#E7EBF0] font-semibold" data-testid="clc-company-name">
                    {state.companyName}
                  </p>
                </div>
                {state.salesRepName && (
                  <div className="rounded-lg bg-[#1D2128] px-4 py-3">
                    <p className="text-xs text-[#8E98A6] uppercase tracking-wide mb-1">Žádost odeslal/a</p>
                    <p className="text-[#E7EBF0]" data-testid="clc-sales-rep-name">{state.salesRepName}</p>
                  </div>
                )}
                {state.expiresAt && (
                  <div className="rounded-lg bg-[#1D2128] px-4 py-3">
                    <p className="text-xs text-[#8E98A6] uppercase tracking-wide mb-1">Platnost odkazu do</p>
                    <p className="text-[#BFC6CF] text-sm">
                      {new Date(state.expiresAt).toLocaleDateString("cs-CZ", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                )}
              </div>

              {!showRejectReason ? (
                <div className="flex flex-col gap-3">
                  <Button
                    data-testid="clc-confirm-btn"
                    disabled={acting}
                    onClick={() => handleAction("confirm")}
                    className="w-full bg-[#FF8A00] hover:bg-[#FFB547] text-[#0A0B0F] font-bold h-12 text-base"
                  >
                    {acting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Potvrzuji žádost
                  </Button>
                  <Button
                    data-testid="clc-reject-btn"
                    variant="outline"
                    disabled={acting}
                    onClick={handleRejectClick}
                    className="w-full border-white/20 text-[#BFC6CF] hover:text-[#E7EBF0] hover:bg-white/5 h-12 text-base"
                  >
                    Zamítnout žádost
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <label className="text-sm text-[#BFC6CF]">
                    Důvod zamítnutí (volitelné)
                  </label>
                  <textarea
                    data-testid="clc-reject-reason"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Popište prosím důvod zamítnutí…"
                    className="w-full rounded-lg bg-[#1D2128] border border-white/10 text-[#E7EBF0] placeholder:text-[#8E98A6] px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#FF8A00]/50"
                  />
                  <Button
                    data-testid="clc-reject-confirm-btn"
                    disabled={acting}
                    onClick={handleRejectConfirm}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-12 text-base"
                  >
                    {acting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Potvrdit zamítnutí
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={acting}
                    onClick={() => setShowRejectReason(false)}
                    className="w-full text-[#8E98A6] hover:text-[#BFC6CF] text-sm"
                  >
                    Zpět
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Success */}
          {state.kind === "success" && (
            <div className="flex flex-col items-center text-center gap-4 py-4" data-testid="clc-success">
              {state.action === "confirm" ? (
                <>
                  <CheckCircle2 className="w-12 h-12 text-green-500" />
                  <h1 className="text-xl font-bold text-[#E7EBF0]">Žádost potvrzena</h1>
                  <p className="text-[#BFC6CF] text-sm leading-relaxed">
                    Děkujeme. Žádost firmy <strong className="text-[#E7EBF0]">{state.companyName}</strong>{" "}
                    nyní čeká na schválení týmem OneMil.
                  </p>
                  <p className="text-[#8E98A6] text-xs">Budete informováni e-mailem o dalším průběhu.</p>
                </>
              ) : (
                <>
                  <XCircle className="w-12 h-12 text-red-500" />
                  <h1 className="text-xl font-bold text-[#E7EBF0]">Žádost zamítnuta</h1>
                  <p className="text-[#BFC6CF] text-sm leading-relaxed">
                    Žádost firmy <strong className="text-[#E7EBF0]">{state.companyName}</strong> byla zamítnuta.
                    Obchodník, který žádost odeslal, bude o tomto informován.
                  </p>
                </>
              )}
            </div>
          )}

          {/* Error */}
          {state.kind === "error" && (
            <div className="flex flex-col items-center text-center gap-4 py-4" data-testid="clc-error">
              <AlertTriangle className="w-12 h-12 text-amber-500" />
              {state.reason === "expired" ? (
                <>
                  <h1 className="text-xl font-bold text-[#E7EBF0]">Platnost odkazu vypršela</h1>
                  <p className="text-[#BFC6CF] text-sm leading-relaxed" data-testid="clc-error-expired">
                    Tento odkaz již není platný. Kontaktujte prosím obchodníka, který vám žádost zaslal.
                  </p>
                </>
              ) : state.reason === "already_processed" ? (
                <>
                  <h1 className="text-xl font-bold text-[#E7EBF0]">Žádost již byla zpracována</h1>
                  <p className="text-[#BFC6CF] text-sm leading-relaxed" data-testid="clc-error-processed">
                    Tato žádost byla již dříve potvrzena nebo zamítnuta.
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-xl font-bold text-[#E7EBF0]">Neplatný odkaz</h1>
                  <p className="text-[#BFC6CF] text-sm leading-relaxed" data-testid="clc-error-invalid">
                    Tento odkaz je neplatný nebo byl odstraněn. Zkontrolujte odkaz v e-mailu.
                  </p>
                </>
              )}
            </div>
          )}

        </div>

        <p className="text-center text-[#8E98A6] text-xs mt-6">
          OneMil — Luxusní soutěže. Skutečné výhry.
        </p>
      </div>
    </div>
  );
}
