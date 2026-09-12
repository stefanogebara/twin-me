import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// The register's buttons (2026-09-12): 32 tall, padding 0 16, a 4px corner, 13px.
// Primary is ink with page-colour text, once a screen. The secondary is white with
// a hairline. Danger is white with the pink line and red text, never a red fill.
// size="lg" is the one exception: the main call to action of a marketing or
// sign-in page, at 48 tall with a 12px corner and 15px 500.
// `liquid` and `cartoon` are legacy names kept for their callers; they read as the
// secondary and the primary.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap border rounded-[var(--rg-radius)] text-[13px] font-normal leading-none tracking-[-0.176px] ring-offset-background transition-[opacity,background-color,border-color,color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-[var(--rg-ink)] bg-[var(--rg-ink)] text-[var(--rg-page)] font-medium hover:opacity-[0.86]",
        destructive: "border-[var(--rg-danger-line)] bg-[var(--rg-white)] text-[var(--rg-danger)] hover:border-[var(--rg-danger)]",
        outline: "border-[var(--rg-rule)] bg-[var(--rg-white)] text-[var(--rg-ink)] hover:border-[var(--rg-quiet)]",
        secondary: "border-[var(--rg-rule)] bg-[var(--rg-white)] text-[var(--rg-ink)] hover:border-[var(--rg-quiet)]",
        ghost: "border-transparent bg-transparent text-[var(--rg-ink)] hover:bg-[var(--rg-hover)]",
        link: "border-transparent bg-transparent text-[var(--rg-ink)] underline-offset-4 hover:underline",
        liquid: "border-[var(--rg-rule)] bg-[var(--rg-white)] text-[var(--rg-ink)] hover:border-[var(--rg-quiet)]",
        cartoon: "border-[var(--rg-ink)] bg-[var(--rg-ink)] text-[var(--rg-page)] font-medium hover:opacity-[0.86]",
      },
      size: {
        default: "h-8 px-4",
        sm: "h-8 px-3",
        lg: "h-12 px-[22px] rounded-[var(--rg-radius-cta)] text-[15px] font-medium tracking-[-0.011em]",
        icon: "h-8 w-8",
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
