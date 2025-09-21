import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Neon button variants
        "neon-pink": "bg-gradient-to-r from-pink-600 to-pink-500 text-white border-2 border-[hsl(var(--neon-pink))] shadow-[0_0_20px_hsl(var(--neon-pink)/0.5)] hover:shadow-[0_0_30px_hsl(var(--neon-pink)/0.7)] hover:scale-105",
        "neon-orange": "bg-gradient-to-r from-orange-600 to-orange-500 text-white border-2 border-[hsl(var(--neon-orange))] shadow-[0_0_20px_hsl(var(--neon-orange)/0.5)] hover:shadow-[0_0_30px_hsl(var(--neon-orange)/0.7)] hover:scale-105",
        "neon-green": "bg-gradient-to-r from-green-600 to-green-500 text-white border-2 border-[hsl(var(--neon-green))] shadow-[0_0_20px_hsl(var(--neon-green)/0.5)] hover:shadow-[0_0_30px_hsl(var(--neon-green)/0.7)] hover:scale-105",
        "neon-blue": "bg-gradient-to-r from-blue-600 to-blue-500 text-white border-2 border-[hsl(var(--neon-blue))] shadow-[0_0_20px_hsl(var(--neon-blue)/0.5)] hover:shadow-[0_0_30px_hsl(var(--neon-blue)/0.7)] hover:scale-105",
        "neon-gold": "bg-gradient-to-r from-yellow-600 to-yellow-500 text-black border-2 border-[hsl(var(--neon-gold))] shadow-[0_0_20px_hsl(var(--neon-gold)/0.5)] hover:shadow-[0_0_30px_hsl(var(--neon-gold)/0.7)] hover:scale-105",
        "neon-cyan": "bg-gradient-to-r from-cyan-600 to-cyan-500 text-white border-2 border-[hsl(var(--neon-cyan))] shadow-[0_0_20px_hsl(var(--neon-cyan)/0.5)] hover:shadow-[0_0_30px_hsl(var(--neon-cyan)/0.7)] hover:scale-105",
        "neon-purple": "bg-gradient-to-r from-purple-600 to-purple-500 text-white border-2 border-[hsl(var(--neon-purple))] shadow-[0_0_20px_hsl(var(--neon-purple)/0.5)] hover:shadow-[0_0_30px_hsl(var(--neon-purple)/0.7)] hover:scale-105",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
