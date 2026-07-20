import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[rgba(40,37,36,0.95)] group-[.toaster]:text-[var(--foreground)] group-[.toaster]:border-[var(--glass-surface-border)] group-[.toaster]:shadow-lg group-[.toaster]:backdrop-blur-xl",
          description: "group-[.toast]:text-[var(--text-secondary)]",
          actionButton: "group-[.toast]:bg-[var(--surface-solid)] group-[.toast]:text-white",
          cancelButton: "group-[.toast]:bg-[var(--surface)] group-[.toast]:text-[var(--text-secondary)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
