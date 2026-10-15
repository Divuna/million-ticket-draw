import { useId } from "react";

/**
 * MIO štítek (měna OneMil) – plaketa se zářezy a korunkou, stříbrné M a zlaté IO.
 *
 * Pravidlo nového vizuálu: MIO se v každé velikosti kreslí jen touto kartičkou
 * s korunou, nikdy jako kulatá mince ani zjednodušený obdélník bez koruny.
 * Varianty (`tier`) odpovídají balíčkům dobití: základní (grafit/stříbro),
 * karmínový, korunní (černozlatý, výchozí) a hologram.
 */
export type MioBadgeTier = "crown" | "graphite" | "crimson" | "holo";

interface MioBadgeProps {
  /** Šířka v px; výška se dopočítá z poměru štítku. */
  width?: number;
  tier?: MioBadgeTier;
  className?: string;
  /** Text pro čtečky obrazovky. Bez něj je štítek jen ozdoba (aria-hidden). */
  title?: string;
}

const PLATE =
  "M22 44 H338 L350 56 V88 L342 96 L350 104 V164 L338 176 H22 L10 164 V132 L18 124 L10 116 V56 Z";
const CROWN = "M140 52 L146 18 L164 34 L180 6 L196 34 L214 18 L220 52 Z";

export function MioBadge({ width = 40, tier = "crown", className, title }: MioBadgeProps) {
  const uid = useId().replace(/:/g, "");
  const gold = `mio-g-${uid}`;
  const silver = `mio-s-${uid}`;
  const holo = `mio-h-${uid}`;
  const plate = `mio-p-${uid}`;
  const height = Math.round((width * 212) / 372);

  const plateFill =
    tier === "graphite" ? "#2A2A30" : tier === "crimson" ? "#7A0F1F" : `url(#${plate})`;
  const ring =
    tier === "holo" ? `url(#${holo})` : tier === "crown" ? `url(#${gold})` : `url(#${silver})`;
  const ioFill = tier === "holo" ? `url(#${holo})` : tier === "crown" ? `url(#${gold})` : `url(#${silver})`;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 -12 372 212"
      className={className}
      style={{ flex: "none", overflow: "visible" }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF3B0" />
          <stop offset=".4" stopColor="#F2C14E" />
          <stop offset=".6" stopColor="#B8862B" />
          <stop offset="1" stopColor="#FFE08A" />
        </linearGradient>
        <linearGradient id={silver} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".5" stopColor="#B9BDC5" />
          <stop offset="1" stopColor="#F2F3F5" />
        </linearGradient>
        <linearGradient id={holo} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7EE0FF" />
          <stop offset=".35" stopColor="#B98CFF" />
          <stop offset=".7" stopColor="#FF8AD8" />
          <stop offset="1" stopColor="#FFE08A" />
        </linearGradient>
        <radialGradient id={plate} cx="40%" cy="25%" r="85%">
          <stop offset="0" stopColor="#2E2E35" />
          <stop offset=".6" stopColor="#111114" />
          <stop offset="1" stopColor="#050506" />
        </radialGradient>
      </defs>
      <path d={PLATE} fill={plateFill} stroke="#050505" strokeWidth={12} strokeLinejoin="round" />
      <path d={PLATE} fill="none" stroke={ring} strokeWidth={6} strokeLinejoin="round" />
      <path d={CROWN} fill="#0B0B0D" stroke={ring} strokeWidth={6} strokeLinejoin="round" />
      <text
        x="180"
        y="146"
        textAnchor="middle"
        fontFamily="'Exo 2', sans-serif"
        fontWeight={900}
        fontStyle="italic"
        fontSize={96}
        stroke="#000"
        strokeWidth={2}
      >
        <tspan fill={`url(#${silver})`}>M</tspan>
        <tspan fill={ioFill}>IO</tspan>
      </text>
    </svg>
  );
}

export default MioBadge;
