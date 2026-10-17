import { Link } from "react-router-dom";
import { Gift, Ticket, Zap } from "lucide-react";
import emblem from "@/assets/redesign/onemil-emblem.png";

/**
 * Partnerská upoutávka na Homepage (deska 4/9 plátna: tmavá karta s rudou září).
 *
 * Záměrně je to **teaser, ne seznam podmínek** — má jen zaujmout a poslat
 * návštěvníka na stránku partnerství. Detailní podmínky patří tam, ne sem.
 *
 * Pravidla (neměnit):
 * - Žádné zmínky o provizi, placených dobitích, cenách ani o aktivovaných či
 *   použitých MIO. Obchodní podmínky se na Homepage neslibují.
 * - Blok je čistě odkaz na stránku partnerství. Nevolá Stripe, Supabase ani
 *   žádné platby, proto je viditelný i v nativní aplikaci (bez `isNativeApp()`).
 * - Žádné nové logo ani cizí grafika; jen schválený emblém OneMil.
 */

const PARTNER_TEASERS = [
  { icon: Gift, text: "Odměna navíc ke každému nákupu" },
  { icon: Ticket, text: "Vlastní vouchery a nabídky" },
  { icon: Zap, text: "Jednoduché zapojení pro váš obchod" },
] as const;

export const PartnerRecruitmentCard = () => {
  return (
    <section className="om-home-partner h-full" aria-labelledby="om-home-partner-title">
      <div className="om-home-partner-glow" aria-hidden="true" />
      <img src={emblem} alt="" aria-hidden="true" className="om-home-partner-crown" />

      <span className="om-home-partner-kicker">Pro obchody a e-shopy</span>
      <div className="om-home-partner-copy">
        <h2 id="om-home-partner-title" className="om-home-partner-title">Staňte se partnerem OneMil</h2>
        <strong className="om-home-partner-lead">Nabídněte zákazníkům víc než ostatní.</strong>
        <p className="om-home-partner-sub">Proměňte každý nákup v důvod, proč se k vám zákazníci vrátí.</p>
      </div>

      <ul className="om-home-partner-list">
        {PARTNER_TEASERS.map(({ icon: Icon, text }) => (
          <li key={text}>
            <span className="om-home-partner-ic"><Icon aria-hidden="true" /></span>
            <span>{text}</span>
          </li>
        ))}
      </ul>

      <Link to="/partnerstvi" className="om-home-partner-cta">Zjistit více o partnerství</Link>
    </section>
  );
};

export default PartnerRecruitmentCard;
