import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[0.625rem] text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_2px_8px_hsl(var(--primary)/0.3)] hover:bg-primary/90 hover:shadow-[0_4px_12px_hsl(var(--primary)/0.4)]",
        destructive: "bg-destructive text-destructive-foreground shadow-[0_2px_8px_hsl(var(--destructive)/0.3)] hover:bg-destructive/90",
        outline: "border border-border/60 bg-card/50 backdrop-blur-sm hover:bg-muted/50 hover:border-border",
        secondary: "bg-secondary text-secondary-foreground shadow-[0_2px_8px_hsl(var(--secondary)/0.2)] hover:bg-secondary/80",
        ghost: "hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        premium: "bg-card text-secondary border border-secondary/30 shadow-[0_0_12px_hsl(var(--secondary)/0.15)] hover:shadow-[0_0_20px_hsl(var(--secondary)/0.25)] hover:border-secondary/50 hover:brightness-110",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
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
