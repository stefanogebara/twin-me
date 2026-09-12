import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-[var(--rg-radius)] border-0 bg-[var(--rg-field)] px-[14px] py-[11px] text-[13px] leading-[19.5px] tracking-[-0.176px] text-[var(--rg-ink)] ring-offset-background placeholder:text-[var(--rg-ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:text-[var(--rg-ink-3)]",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
