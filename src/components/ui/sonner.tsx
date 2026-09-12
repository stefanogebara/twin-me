import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// The register's toast: white with a hairline on the warm page, ink text, the
// grey line under it, an 8px corner. No blur, no shadow.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[var(--rg-white)] group-[.toaster]:text-[var(--rg-ink)] group-[.toaster]:border-[var(--rg-rule)] group-[.toaster]:shadow-none group-[.toaster]:rounded-[var(--rg-radius-icon)] group-[.toaster]:font-[family-name:var(--font-ui)] group-[.toaster]:text-[13px]",
          description: "group-[.toast]:text-[var(--rg-ink-2)]",
          actionButton: "group-[.toast]:bg-[var(--rg-ink)] group-[.toast]:text-[var(--rg-page)] group-[.toast]:rounded-[var(--rg-radius)]",
          cancelButton: "group-[.toast]:bg-[var(--rg-field)] group-[.toast]:text-[var(--rg-ink)] group-[.toast]:rounded-[var(--rg-radius)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
