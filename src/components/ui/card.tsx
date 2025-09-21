import * as React from "react";

import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />
));

const TicketCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { 
  variant?: 'pink' | 'cyan' | 'purple' | 'green' | 'orange' | 'gold' 
}>(({ className, variant = 'pink', ...props }, ref) => {
  const variantClasses = {
    pink: "border-neon-pink glow-pink text-neon-pink",
    cyan: "border-neon-cyan glow-cyan text-neon-cyan", 
    purple: "border-neon-purple glow-purple text-neon-purple",
    green: "border-neon-green glow-green text-neon-green",
    orange: "border-neon-orange glow-orange text-neon-orange",
    gold: "border-neon-gold glow-gold text-neon-gold",
  };
  
  return (
    <div 
      ref={ref} 
      className={cn("retro-ticket", variantClasses[variant], className)} 
      {...props} 
    />
  );
});
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

TicketCard.displayName = "TicketCard";

export { Card, TicketCard, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
