import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "cartoon-button text-primary-foreground",
        destructive: "bg-gradient-to-br from-destructive to-red-500 text-destructive-foreground hover:shadow-lg hover:-translate-y-0.5 rounded-2xl border-2 border-red-300/30",
        outline: "border-2 border-primary/30 bg-background/80 backdrop-blur-sm hover:bg-primary/10 hover:border-primary/50 text-primary rounded-2xl transition-all duration-200",
        secondary: "bg-gradient-to-br from-secondary to-orange-200 text-secondary-foreground hover:shadow-lg hover:-translate-y-0.5 rounded-2xl border-2 border-orange-300/30",
        ghost: "hover:bg-accent/20 hover:text-accent-foreground rounded-2xl",
        link: "text-primary underline-offset-4 hover:underline",
        liquid: "liquid-glass text-primary hover:shadow-2xl hover:-translate-y-1 transition-all duration-300",
        cartoon: "bg-gradient-to-br from-accent to-yellow-400 text-accent-foreground hover:shadow-xl hover:-translate-y-1 rounded-3xl border-2 border-yellow-300/40 font-bold",
      },
      size: {
        default: "h-12 px-6 py-3 rounded-2xl",
        sm: "h-10 px-4 py-2 rounded-xl",
        lg: "h-14 px-10 py-4 rounded-3xl text-base",
        icon: "h-12 w-12 rounded-2xl",
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
