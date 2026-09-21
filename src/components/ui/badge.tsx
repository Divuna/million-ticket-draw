import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        /* The five semantic variants below read CSS custom properties
           (--badge-<variant>-fg/bg/border/bg-hover) instead of hardcoded
           Tailwind colors, so they can be re-themed per scope (see
           .admin-theme in index.css) without touching this file again. The
           :root defaults reproduce these variants' previous literal colors
           byte-for-byte, so every non-admin consumer (customer/partner/
           affiliate) renders unchanged. */
        destructive:
          "border-[var(--badge-destructive-border)] bg-[var(--badge-destructive-bg)] text-[var(--badge-destructive-fg)] hover:bg-[var(--badge-destructive-bg-hover)]",
        outline: "border-border/60 bg-transparent text-foreground hover:bg-muted/40",
        /** Dokončeno / úspěch / aktivní */
        success:
          "border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] text-[var(--badge-success-fg)] hover:bg-[var(--badge-success-bg-hover)]",
        /** Varování / zpracování */
        warning:
          "border-[var(--badge-warning-border)] bg-[var(--badge-warning-bg)] text-[var(--badge-warning-fg)] hover:bg-[var(--badge-warning-bg-hover)]",
        /** Čekající / ve frontě / naplánováno */
        pending:
          "border-[var(--badge-pending-border)] bg-[var(--badge-pending-bg)] text-[var(--badge-pending-fg)] hover:bg-[var(--badge-pending-bg-hover)]",
        /** Informační stav */
        info: "border-[var(--badge-info-border)] bg-[var(--badge-info-bg)] text-[var(--badge-info-fg)] hover:bg-[var(--badge-info-bg-hover)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
