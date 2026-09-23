import { useCallback, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildLoginRedirectUrl } from "@/lib/loginRedirect";
import { setPendingPaymentSuccessContext } from "@/lib/paymentSuccessContext";
import { isNativeApp } from "@/lib/nativeApp";
import { logMonitoringEvent, logStripeCheckoutClientFailure } from "@/lib/monitoring";
import { toast } from "sonner";

/**
 * Jediný společný postup pro spuštění Stripe checkoutu na dobití MioCoinů.
 *
 * Vyčleněno 1:1 z `MioCoinTopUpSection` — používá ho dobíjecí panel
 * (Homepage/`/top-up`) i rychlé dobíjení v zákaznické hlavičce. Nikdy
 * nezakládat druhou, odlišnou platební cestu.
 *
 * Pravidla (neměnit):
 * - Nativní aplikace (Apple/Google pravidla) checkout nespustí — detekce
 *   výhradně přes `isNativeApp()` ze `src/lib/nativeApp.ts`.
 * - Nepřihlášený uživatel se pošle na přihlášení s návratovou adresou.
 * - Redirect musí zůstat `window.location.href` ve stejné záložce, jinak se
 *   ztratí `sessionStorage` kontext z `setPendingPaymentSuccessContext`.
 * - Volá se výhradně Edge Function `create-stripe-checkout` s dvojicí
 *   `{ priceInCzk, totalCoins }`; částky ani bonusy se tady nepočítají.
 * - Když server vyžaduje souhlas s okamžitým použitím MIO
 *   (`get_immediate_use_consent_config().required`), checkout se spustí až po
 *   aktivním potvrzení v `ImmediateUseConsentDialog`; volající ho vykreslí
 *   z `consentDialogProps`. Text se nikdy nepíše do kódu.
 */

export interface MioCoinPackage {
  /** Účtovaná částka v Kč. */
  priceInCzk: number;
  /** Celkem připsaných MioCoinů včetně bonusu. */
  totalCoins: number;
  /** Popisek bonusu, pokud balíček nějaký má. */
  bonusLabel: string | null;
}

/** Stejné dvojice částka/MioCoiny jako v dobíjecím panelu. */
export const MIOCOIN_PACKAGES: readonly MioCoinPackage[] = [
  { priceInCzk: 50, totalCoins: 50, bonusLabel: null },
  { priceInCzk: 300, totalCoins: 310, bonusLabel: "+10 navíc" },
  { priceInCzk: 500, totalCoins: 525, bonusLabel: "+25 navíc" },
  { priceInCzk: 1200, totalCoins: 1280, bonusLabel: "+80 navíc" },
] as const;

export interface ImmediateUseConsentConfig {
  required: boolean;
  version: string;
  text: string;
}

interface PendingCheckout {
  priceInCzk: number;
  totalCoins: number;
}

export const useMioCoinCheckout = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingCheckout | null>(null);
  const [consentConfig, setConsentConfig] = useState<ImmediateUseConsentConfig | null>(null);

  const runCheckout = useCallback(
    async (
      priceInCzk: number,
      totalCoins: number,
      immediateUseConsent: { accepted: true; version: string } | null,
    ) => {
      // Ensure clean numbers
      const cleanPrice = Number(priceInCzk);
      const cleanCoins = Number(totalCoins);

      setLoading(true);

      try {
        toast.loading("Otevírám platební bránu...", { id: "topup-loading" });

        // Wait for session to be ready
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session?.user?.id) {
          logMonitoringEvent("warn", "stripe_checkout_no_session", {
            user_id: user?.id ?? null,
            action: "create_stripe_checkout",
            price_czk: cleanPrice,
          });
          toast.dismiss("topup-loading");
          toast.error("Nepodařilo se ověřit uživatele. Zkuste se znovu přihlásit.");
          setLoading(false);
          return;
        }

        console.log("Sending to Stripe:", { priceInCzk: cleanPrice, totalCoins: cleanCoins });

        const { data, error } = await supabase.functions.invoke("create-stripe-checkout", {
          body: {
            priceInCzk: cleanPrice,
            totalCoins: cleanCoins,
            ...(immediateUseConsent ? { immediateUseConsent } : {}),
          },
        });

        if (error) throw error;

        if (data?.checkout_url) {
          setPendingPaymentSuccessContext({ kind: "miocoin" });
          // Redirect to Stripe - page will unload
          window.location.href = data.checkout_url;
          // Don't reset loading state as page is redirecting
        } else {
          throw new Error("Nepodařilo se získat platební odkaz");
        }
      } catch (error) {
        console.error("Error creating checkout:", error);
        if (user) {
          const phase =
            error instanceof Error && error.message.includes("platební odkaz")
              ? "response"
              : "invoke";
          logStripeCheckoutClientFailure({
            userId: user.id,
            priceInCzk: cleanPrice,
            error,
            phase,
          });
        }
        toast.dismiss("topup-loading");
        toast.error("Nepodařilo se otevřít platební bránu");
        setLoading(false);
      }
    },
    [user],
  );

  const startCheckout = useCallback(
    async (priceInCzk: number, totalCoins: number) => {
      // Nativní aplikace nesmí spustit Stripe checkout (Apple/Google pravidla).
      if (isNativeApp()) return;
      if (!user) {
        toast.error("Pro nákup MioCoinů se musíte přihlásit");
        navigate(buildLoginRedirectUrl(location.pathname + location.search));
        return;
      }

      if (loading) return; // Prevent double-clicks

      const cleanPrice = Number(priceInCzk);
      if (isNaN(cleanPrice) || cleanPrice < 50) {
        toast.error("Neplatná částka");
        return;
      }

      // Souhlas s okamžitým použitím MIO — znění a povinnost řídí server.
      const { data: cfgRaw, error: cfgError } = await supabase.rpc(
        "get_immediate_use_consent_config" as never,
      );
      if (cfgError) {
        toast.error("Nepodařilo se otevřít platební bránu");
        return;
      }
      const cfg = (cfgRaw ?? { required: false, version: "", text: "" }) as ImmediateUseConsentConfig;

      if (cfg.required) {
        if (!cfg.version || !cfg.text) {
          toast.error("Dobití je dočasně nedostupné. Zkuste to prosím později.");
          return;
        }
        setConsentConfig(cfg);
        setPending({ priceInCzk: cleanPrice, totalCoins: Number(totalCoins) });
        return;
      }

      await runCheckout(cleanPrice, totalCoins, null);
    },
    [user, navigate, location.pathname, location.search, loading, runCheckout],
  );

  const confirmConsent = useCallback(() => {
    if (!pending || !consentConfig) return;
    const { priceInCzk, totalCoins } = pending;
    const version = consentConfig.version;
    setPending(null);
    void runCheckout(priceInCzk, totalCoins, { accepted: true, version });
  }, [pending, consentConfig, runCheckout]);

  const cancelConsent = useCallback(() => setPending(null), []);

  /** Props pro `<ImmediateUseConsentDialog />` — volající ho vykreslí vedle tlačítek. */
  const consentDialogProps = {
    open: pending !== null,
    text: consentConfig?.text ?? "",
    priceInCzk: pending?.priceInCzk ?? null,
    loading,
    onConfirm: confirmConsent,
    onCancel: cancelConsent,
  };

  return { startCheckout, loading, consentDialogProps };
};
