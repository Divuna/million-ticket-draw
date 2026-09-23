import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

/**
 * Aktivní potvrzení souhlasu s okamžitým použitím MIO před Stripe platbou.
 *
 * Znění NENÍ v kódu — zobrazuje se přesně text a verze z `settings`
 * (`get_immediate_use_consent_config`). Server uloží stejný text, verzi,
 * čas a vazbu na dobití (`payment_immediate_use_consents`).
 */
export interface ImmediateUseConsentDialogProps {
  open: boolean;
  text: string;
  priceInCzk: number | null;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ImmediateUseConsentDialog({
  open,
  text,
  priceInCzk,
  loading,
  onConfirm,
  onCancel,
}: ImmediateUseConsentDialogProps) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (open) setChecked(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent data-testid="immediate-use-consent-dialog">
        <DialogHeader>
          <DialogTitle>Potvrzení před platbou</DialogTitle>
          {priceInCzk !== null && (
            <DialogDescription>Dobití za {priceInCzk.toLocaleString("cs-CZ")} Kč</DialogDescription>
          )}
        </DialogHeader>

        <label className="flex items-start gap-3 text-sm leading-snug cursor-pointer">
          <Checkbox
            data-testid="immediate-use-consent-checkbox"
            checked={checked}
            onCheckedChange={(value) => setChecked(value === true)}
            className="mt-0.5"
          />
          <span className="whitespace-pre-line">{text}</span>
        </label>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Zrušit
          </Button>
          <Button
            type="button"
            data-testid="immediate-use-consent-confirm"
            onClick={onConfirm}
            disabled={!checked || loading}
          >
            Pokračovat k platbě
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
