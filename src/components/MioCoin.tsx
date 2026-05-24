import React from "react";
import { supabaseUrl } from "@/integrations/supabase/client";

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
      <div
        className="relative flex items-center justify-center rounded-full bg-gradient-to-br from-[rgba(255,138,0,0.4)] via-[rgba(255,181,71,0.1)] to-black/80 p-[2px] shadow-[0_0_12px_rgba(255,138,0,0.35)]"
        style={{ width: px + 6, height: px + 6 }}
      >
        <div className="relative flex items-center justify-center rounded-full bg-black/80">
          <img
            src={MIOCOIN_IMAGE_URL}
            alt="MioCoin"
            style={{
              width: px,
              height: px,
              objectFit: "contain",
            }}
          />
        </div>
      </div>

      {showAmount && formattedAmount && <span className="font-medium tracking-wide">{formattedAmount} MioCoin</span>}
    </div>
  );
};

export default MioCoin;
