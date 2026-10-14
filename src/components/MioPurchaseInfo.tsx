import { Link } from "react-router-dom";

/**
 * Spotřebitelská informace před Stripe checkoutem MIO (schváleno Pavlem 25. 9. 2026).
 *
 * Jen informace, ŽÁDNÝ povinný checkbox ani vzdání se práva na odstoupení —
 * souhlas s okamžitým použitím (`immediate_use_consent_required`) zůstává vypnutý.
 * Znění se nemění bez nového schválení; musí odpovídat bodu 8 VOP
 * (`docs/pravni-dokumenty/VSEOBECNE_OBCHODNI_PODMINKY/`).
 */
export const MIO_PURCHASE_INFO_LEAD =
  "Zakoupené MIO můžete používat ihned. U nevyužité placené části MIO můžete do 14 dnů od nákupu požádat o vrácení odpovídající zaplacené částky. Bonusová MIO se peněžně neproplácejí. Podrobnosti najdete ve";
export const MIO_PURCHASE_INFO_LINK = "Všeobecných obchodních podmínkách";
export const MIO_PURCHASE_INFO_TEXT = `${MIO_PURCHASE_INFO_LEAD} ${MIO_PURCHASE_INFO_LINK}.`;

export function MioPurchaseInfo({ className = "" }: { className?: string }) {
  return (
    <p data-testid="mio-purchase-info" className={`text-xs leading-snug text-muted-foreground ${className}`}>
      {MIO_PURCHASE_INFO_LEAD}{" "}
      <Link to="/vop" className="underline underline-offset-2 hover:text-foreground">
        {MIO_PURCHASE_INFO_LINK}
      </Link>
      .
    </p>
  );
}
