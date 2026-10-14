import { Link } from "react-router-dom";
import logo from "@/assets/redesign/onemil-logo.png";
import avatarWave from "@/assets/redesign/avatar/avatar-mava.png";

/**
 * Tmavý úvodní pruh přihlášení / registrace / obnovy hesla (nový vizuál, deska 16).
 * Jen vzhled – logo vede na Domů jako dosud.
 */
interface AuthHeroProps {
  title: string;
  subtitle: string;
}

export function AuthHero({ title, subtitle }: AuthHeroProps) {
  return (
    <div className="om-auth-hero relative mb-5 w-full overflow-hidden rounded-[24px] px-5 pt-5 pb-6">
      <span aria-hidden="true" className="om-auth-hero-sweep" />
      <Link to="/" aria-label="Zpět na OneMil" className="relative z-[1] inline-block">
        <img src={logo} alt="OneMil" className="h-10 w-auto object-contain" />
      </Link>
      <div className="relative z-[1] mt-4 max-w-[62%]">
        <p className="om-auth-hero-title">{title}</p>
        <p className="mt-1.5 text-sm leading-snug text-[#C9CDD4]">{subtitle}</p>
      </div>
      <img
        src={avatarWave}
        alt=""
        aria-hidden="true"
        className="om-float absolute bottom-[-6px] right-2 z-[1] h-[150px] w-auto object-contain"
        style={{ filter: "drop-shadow(0 12px 16px rgba(0,0,0,0.5))" }}
      />
    </div>
  );
}

export default AuthHero;
