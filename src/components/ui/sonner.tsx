import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** Hlášky podle plátna redesignu (tmavá úspěch / růžová chyba, nahoře) – v celé aplikaci. */
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    position="top-center"
    className="toaster om-sonner-root"
    toastOptions={{ classNames: { toast: "om-sonner" } }}
    {...props}
  />
);

export { Toaster, toast };
