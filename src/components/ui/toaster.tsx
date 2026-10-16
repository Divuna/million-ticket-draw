import { useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { isCustomerRedesignPath } from "@/lib/customerRedesign";

/** Hláška je chybová, když má variantu `destructive` nebo nadpis začíná „Chyba“. */
function isErrorToast(variant: unknown, title: unknown): boolean {
  if (variant === "destructive") return true;
  return typeof title === "string" && /^chyba/i.test(title.trim());
}

function ToastIcon({ error }: { error: boolean }) {
  return (
    <span className="om-toast-icon" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {error ? <path d="M12 7v6M12 17h.01" /> : <path d="M5 12l5 5 9-10" />}
      </svg>
    </span>
  );
}

export function Toaster() {
  const { toasts } = useToast();
  const { pathname } = useLocation();
  const redesign = isCustomerRedesignPath(pathname);

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, className, ...props }) {
        if (!redesign) {
          return (
            <Toast key={id} variant={variant} className={className} {...props}>
              <div className="grid gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && <ToastDescription>{description}</ToastDescription>}
              </div>
              {action}
              <ToastClose />
            </Toast>
          );
        }

        const error = isErrorToast(variant, title);
        return (
          <Toast key={id} className={`om-toast ${error ? "om-toast-error" : "om-toast-success"} ${className ?? ""}`} {...props}>
            <div className="flex items-start gap-2.5">
              <ToastIcon error={error} />
              <div className="grid gap-0.5">
                {title && <ToastTitle className="om-toast-title">{title}</ToastTitle>}
                {description && <ToastDescription className="om-toast-desc">{description}</ToastDescription>}
              </div>
            </div>
            {action}
            <ToastClose className="om-toast-close" />
          </Toast>
        );
      })}
      <ToastViewport className={redesign ? "om-toast-viewport" : undefined} />
    </ToastProvider>
  );
}
