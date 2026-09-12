import * as React from "react";

import { cn } from "@/lib/utils";

// The register's field: no border, a warm #f4efec box, 44 tall, a 4px corner,
// padding 11 14, 13px ink. Placeholders are the quiet ink (4.8:1 on the field).
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-[var(--rg-radius)] border-0 bg-[var(--rg-field)] px-[14px] py-[11px] text-[13px] leading-[19.5px] tracking-[-0.176px] text-[var(--rg-ink)] ring-offset-background file:border-0 file:bg-transparent file:text-[13px] file:font-medium file:text-foreground placeholder:text-[var(--rg-ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:text-[var(--rg-ink-3)]",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
