import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MysteryCoupon } from "@/lib/mysteryCouponPurchase";

/**
 * Odhalení mystery kuponu po dokončeném nákupu.
 *
 * Zobrazuje se teprve po úspěšné transakci — před nákupem zákazník o kuponu
 * neví vůbec nic. Po zavření stránka otevře standardní TicketResultModal
 * s bezplatným tiketem.
 */
interface Props {
  coupon: MysteryCoupon | null;
  onClose: () => void;
}

export function MysteryCouponRevealDialog({ coupon, onClose }: Props) {
  const open = coupon !== null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        data-testid="mystery-coupon-reveal"
        className="bg-[hsl(220_25%_8%)] border-[2px] border-[rgba(255,138,0,0.35)] text-white"
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">Kupon je tvůj</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {coupon?.image_url && (
            <img
              src={coupon.image_url}
              alt={coupon.name ?? "Kupon"}
              className="h-28 w-full rounded-2xl object-cover border border-[rgba(255,138,0,0.25)]"
            />
          )}

          <p className="text-lg font-bold">{coupon?.name}</p>
          {coupon?.partner_name && (
            <p className="text-sm text-gray-300">od {coupon.partner_name}</p>
          )}
          {coupon?.short_description && (
            <p className="text-sm text-gray-400">{coupon.short_description}</p>
          )}

          {coupon?.code && (
            <div className="rounded-2xl border border-[rgba(255,138,0,0.35)] bg-[rgba(255,138,0,0.08)] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-[#FF8A00] font-semibold">
                Tvůj kód
              </p>
              <p
                data-testid="mystery-coupon-code"
                className="text-xl font-extrabold tracking-widest break-all mt-1"
              >
                {coupon.code}
              </p>
            </div>
          )}

          {coupon?.how_to_use && (
            <p className="text-sm text-gray-300 whitespace-pre-line">{coupon.how_to_use}</p>
          )}
          {coupon?.terms && (
            <p className="text-xs text-gray-500 whitespace-pre-line">{coupon.terms}</p>
          )}

          <p className="text-sm text-gray-300">
            Kupon najdeš i ve svých voucherech. Tiket do soutěže máš{" "}
            <span className="font-semibold text-[#FF8A00]">zdarma jako bonus</span>.
          </p>

          <Button
            data-testid="mystery-coupon-continue"
            onClick={onClose}
            variant="premium"
            className="h-11 font-semibold rounded-full mt-1"
          >
            Zobrazit tiket
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
