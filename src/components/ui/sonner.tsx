import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white group-[.toaster]:text-[#000000] group-[.toaster]:border-[rgba(45,39,34,0.12)] group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-[#8A857D]",
          actionButton: "group-[.toast]:bg-[#000000] group-[.toast]:text-white",
          cancelButton: "group-[.toast]:bg-[rgba(45,39,34,0.08)] group-[.toast]:text-[#8A857D]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
