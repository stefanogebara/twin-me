import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Claura: the bone button — warm gradient rounded-rect, never a stark white pill.
        // Pills (100px) are reserved for chips, nav items and avatars.
        default: "bg-[image:var(--claura-bone)] text-[var(--claura-bone-ink)] hover:shadow-lg hover:-translate-y-0.5 hover:brightness-105 rounded-[var(--claura-r-btn)]",
        destructive: "bg-[rgba(220,38,38,0.10)] text-[var(--claura-danger-ink)] border border-[rgba(220,38,38,0.35)] hover:bg-[rgba(220,38,38,0.16)] hover:-translate-y-0.5 rounded-[10px]",
        outline: "border border-[var(--glass-surface-border)] bg-[var(--glass-surface-bg)] backdrop-blur-[42px] hover:bg-[rgba(255,255,255,0.10)] text-foreground rounded-[var(--claura-r-btn)] transition-all duration-200",
        secondary: "bg-[rgba(255,255,255,0.09)] text-secondary-foreground hover:bg-[rgba(255,255,255,0.12)] rounded-[var(--claura-r-btn)]",
        ghost: "hover:bg-[rgba(255,255,255,0.06)] hover:text-accent-foreground rounded-[var(--claura-r-btn)]",
        link: "text-primary underline-offset-4 hover:underline",
        liquid: "bg-[var(--glass-surface-bg)] border border-[var(--glass-surface-border)] text-foreground hover:bg-[rgba(255,255,255,0.10)] backdrop-blur-[42px] hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 rounded-[var(--claura-r-btn)]",
        cartoon: "bg-gradient-to-br from-accent to-yellow-400 text-accent-foreground hover:shadow-xl hover:-translate-y-1 rounded-[var(--claura-r-btn)] border-2 border-yellow-300/40 font-bold",
      },
      size: {
        default: "h-12 px-6 py-3",
        sm: "h-10 px-4 py-2",
        lg: "h-14 px-10 py-4 text-base",
        icon: "h-12 w-12 rounded-[var(--claura-r-btn)]",
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
