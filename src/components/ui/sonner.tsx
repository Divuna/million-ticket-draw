import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          // Default/success descriptions stay muted. Error toasts force a solid
          // red background with white title + description so text is always readable.
          // The [&[data-type=error]_...] selectors target children of an error toast
          // regardless of the global muted/foreground classes.
          description:
            "group-[.toast]:text-muted-foreground group-[&[data-type=error]]:!text-white",
          title: "group-[&[data-type=error]]:!text-white",
          error:
            "!bg-destructive !border-destructive !text-white [&_[data-title]]:!text-white [&_[data-description]]:!text-white [&_[data-icon]]:!text-white",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
