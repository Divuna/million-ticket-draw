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
        destructive:
          "border-red-500/35 bg-red-500/15 text-red-200 hover:bg-red-500/20 dark:border-red-500/40 dark:bg-red-950/50 dark:text-red-100",
        outline: "border-border/60 bg-transparent text-foreground hover:bg-muted/40",
        /** Dokončeno / úspěch / aktivní */
        success:
          "border-emerald-500/40 bg-emerald-500/[0.12] text-emerald-200 hover:bg-emerald-500/[0.18] dark:text-emerald-100",
        /** Varování / zpracování */
        warning:
          "border-amber-500/40 bg-amber-500/[0.12] text-amber-100 hover:bg-amber-500/[0.18] dark:text-amber-50",
        /** Čekající / ve frontě / naplánováno */
        pending:
          "border-sky-500/35 bg-sky-500/[0.1] text-sky-100 hover:bg-sky-500/[0.16] dark:text-sky-50",
        /** Informační stav */
        info: "border-blue-500/35 bg-blue-500/[0.1] text-blue-100 hover:bg-blue-500/[0.16] dark:text-blue-50",
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
