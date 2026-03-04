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
            "group toast group-[.toaster]:bg-[rgba(40,37,36,0.95)] group-[.toaster]:text-[var(--foreground)] group-[.toaster]:border-[rgba(255,255,255,0.12)] group-[.toaster]:shadow-lg group-[.toaster]:backdrop-blur-xl",
          description: "group-[.toast]:text-[var(--text-secondary)]",
          actionButton: "group-[.toast]:bg-[rgba(255,255,255,0.15)] group-[.toast]:text-white",
          cancelButton: "group-[.toast]:bg-[rgba(255,255,255,0.08)] group-[.toast]:text-[var(--text-secondary)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
