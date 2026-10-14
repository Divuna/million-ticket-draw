import React from "react";
import { supabaseUrl } from "@/integrations/supabase/client";
import { MioBadge } from "@/components/brand/MioBadge";

type MioCoinSize = "sm" | "md" | "lg";

export interface MioCoinProps {
  amount?: number | string;
  size?: MioCoinSize;
  showAmount?: boolean;
  className?: string;
}

export const MIOCOIN_IMAGE_URL =
  `${supabaseUrl}/storage/v1/object/public/assets/ChatGPT%20Image%204.%2012.%202025%2018_44_44.png`;

const sizeMap: Record<MioCoinSize, number> = {
  sm: 20,
  md: 32,
  lg: 48,
};

const MioCoin: React.FC<MioCoinProps> = ({ amount, size = "md", showAmount = true, className = "" }) => {
  const px = sizeMap[size] ?? sizeMap.md;

  const formattedAmount = typeof amount === "number" ? amount.toLocaleString("cs-CZ") : (amount ?? "");

  return (
    <div className={`inline-flex items-center gap-2 text-sm text-zinc-100 ${className}`}>
      <MioBadge width={Math.round(px * 1.8)} title="MIO" />

      {showAmount && formattedAmount && <span className="font-medium tracking-wide">{formattedAmount} MIO</span>}
    </div>
  );
};

export default MioCoin;
