import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ChevronRight, Image as ImageIcon, Ticket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { OneMilHeartIcon, OneMilVoucherIcon } from '@/components/icons/OneMilIcons';
import { cn } from '@/lib/utils';

export interface VoucherShowcaseVoucher {
  id: string;
  name: string;
  image_url: string | null;
  banner_url: string | null;
  max_quantity: number | null;
  redeemed_count: number;
  start_date: string | null;
  end_date: string | null;
  short_description?: string | null;
  usage_description?: string | null;
  terms_text?: string | null;
  how_to_use_text?: string | null;
  gallery_images?: string[];
  available_code_count?: number;
}

export interface VoucherDetailText {
  shortDescription: string;
  usageDescription: string;
  termsText: string;
  howToUseText: string;
}

const EMPTY_DETAIL_TEXT = 'Detail zatím není vyplněný.';

function getAdminText(value: string | null | undefined, fallback = EMPTY_DETAIL_TEXT): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function formatVoucherDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, 'd. M. yyyy');
}

export function getVoucherRemainingLabel(voucher: Pick<VoucherShowcaseVoucher, 'max_quantity' | 'redeemed_count' | 'available_code_count'>): string | null {
  if (typeof voucher.available_code_count === 'number') {
    const remaining = Math.max(0, voucher.available_code_count);
    return `Zbývá: ${remaining}`;
  }
  if (voucher.max_quantity == null) return null;
  const remaining = Math.max(0, voucher.max_quantity - voucher.redeemed_count);
  return `Zbývá: ${remaining}`;
}

export function getVoucherValidityLabel(voucher: Pick<VoucherShowcaseVoucher, 'end_date'>): string | null {
  const endDate = formatVoucherDate(voucher.end_date);
  return endDate ? `Platí do: ${endDate}` : null;
}

export function buildVoucherDetailText(voucher: VoucherShowcaseVoucher): VoucherDetailText {
  return {
    shortDescription: getAdminText(voucher.short_description),
    usageDescription: getAdminText(voucher.usage_description),
    termsText: getAdminText(voucher.terms_text, 'Podmínky zatím nejsou vyplněné.'),
    howToUseText: getAdminText(voucher.how_to_use_text, 'Návod k použití zatím není vyplněný.'),
  };
}

interface VoucherShowcaseCardProps {
  voucher: VoucherShowcaseVoucher;
  remainingLabel?: string | null;
  onDetail: () => void;
  onFavoriteToggle?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  favoriteActive?: boolean;
  favoriteDisabled?: boolean;
  favoriteAriaLabel?: string;
  showInfoBadges?: boolean;
  className?: string;
}

export const VoucherShowcaseCard: React.FC<VoucherShowcaseCardProps> = ({
  voucher,
  remainingLabel,
  onDetail,
  onFavoriteToggle,
  favoriteActive = false,
  favoriteDisabled = false,
  favoriteAriaLabel,
  showInfoBadges = true,
  className,
}) => {
  const validityLabel = getVoucherValidityLabel(voucher);
  const remaining = showInfoBadges ? (remainingLabel ?? getVoucherRemainingLabel(voucher)) : null;
  const shownValidityLabel = showInfoBadges ? validityLabel : null;
  const hasBanner = Boolean(voucher.banner_url || voucher.image_url);

  return (
    <Card
      className={cn(
        'voucher-card-glow relative overflow-hidden rounded-[20px] border-[3px] border-[rgba(255,138,0,0.35)] shadow-[0_4px_20px_hsl(220_50%_3%/0.6)] transition-all duration-300 hover:border-[rgba(255,138,0,0.55)] hover:shadow-[0_0_16px_rgba(255,138,0,0.2)] hover:scale-[1.02]',
        'aspect-[16/9] min-h-0 cursor-pointer',
        className,
      )}
      onClick={onDetail}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onDetail();
        }
      }}
    >
      {hasBanner ? (
        <img
          src={voucher.banner_url || voucher.image_url || undefined}
          alt={`${voucher.name} banner`}
          className="absolute inset-0 z-[1] h-full w-full object-cover object-center"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[hsl(220_30%_10%)]">
          <OneMilVoucherIcon size={56} className="h-14 w-14 text-[rgba(255,138,0,0.45)]" />
        </div>
      )}

      <div
        className="absolute inset-0 z-[2]"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.16) 45%, rgba(0,0,0,0.74) 100%)',
        }}
      />

      <div className="relative z-[3] flex h-full flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          {onFavoriteToggle ? (
            <button
              type="button"
              onClick={onFavoriteToggle}
              disabled={favoriteDisabled}
              className="rounded-full border border-white/15 bg-[rgba(10,12,18,0.72)] p-2 text-white shadow-[0_4px_20px_rgba(0,0,0,0.25)] backdrop-blur-sm transition-all duration-200 hover:bg-[rgba(10,12,18,0.9)] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={favoriteAriaLabel ?? (favoriteActive ? 'Odebrat z oblíbených' : 'Přidat do oblíbených')}
            >
              <OneMilHeartIcon
                size={20}
                className={cn(
                  'h-5 w-5 transition-colors',
                  favoriteActive ? 'fill-destructive text-destructive' : 'text-white/80',
                )}
              />
            </button>
          ) : (
            <div />
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {remaining && (
              <Badge className="rounded-full border border-white/15 bg-[rgba(10,12,18,0.72)] px-3 py-1 text-[11px] font-medium text-white shadow-[0_4px_20px_rgba(0,0,0,0.25)] backdrop-blur-sm">
                {remaining}
              </Badge>
            )}
            {shownValidityLabel && (
              <Badge className="rounded-full border border-white/15 bg-[rgba(10,12,18,0.72)] px-3 py-1 text-[11px] font-medium text-white shadow-[0_4px_20px_rgba(0,0,0,0.25)] backdrop-blur-sm">
                {shownValidityLabel}
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-auto flex items-end justify-end pt-6">
          <Button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDetail();
            }}
            className="h-11 rounded-xl border-0 bg-gradient-to-r from-[#FF8A00] to-[#FFB547] px-4 text-sm font-bold text-[#111] shadow-[0_2px_8px_rgba(255,138,0,0.25)] transition-all duration-200 hover:brightness-105"
          >
            Detail
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};

interface VoucherDetailDialogProps {
  voucher: VoucherShowcaseVoucher | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPurchase: (voucherId: string) => void;
  purchaseDisabled?: boolean;
  purchaseLoading?: boolean;
  purchaseLabel?: string;
}

export const VoucherDetailDialog: React.FC<VoucherDetailDialogProps> = ({
  voucher,
  open,
  onOpenChange,
  onPurchase,
  purchaseDisabled = false,
  purchaseLoading = false,
  purchaseLabel = 'Koupit za 5 MIO',
}) => {
  const detailText = voucher ? buildVoucherDetailText(voucher) : null;
  const galleryImages = voucher
    ? Array.from(new Set([
        voucher.banner_url,
        voucher.image_url,
        ...(voucher.gallery_images ?? []),
      ].filter((url): url is string => Boolean(url))))
    : [];
  const galleryKey = galleryImages.join('|');
  const [activeImage, setActiveImage] = useState<string | null>(galleryImages[0] ?? null);

  useEffect(() => {
    setActiveImage(galleryImages[0] ?? null);
  }, [voucher?.id, galleryKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="voucher-detail-light-dialog max-w-5xl max-h-[92vh] overflow-y-auto border-[rgba(255,138,0,0.35)] bg-gradient-to-b from-[hsl(220_30%_8%)] to-[hsl(220_35%_5%)] p-0">
        {voucher && (
          <div className="block w-full min-w-0">
            <div className="relative aspect-[16/9] w-full max-h-[480px] overflow-hidden rounded-t-[20px] bg-[hsl(220_30%_10%)]">
              {activeImage ? (
                <img
                  src={activeImage}
                  alt={voucher.name}
                  className="h-full w-full object-cover object-center"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <ImageIcon className="h-16 w-16 text-[rgba(255,138,0,0.45)]" />
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(0,0,0,0.38)] via-transparent to-transparent" />
            </div>

            {galleryImages.length > 1 && (
              <div className="w-full border-t border-white/10 bg-black/20 px-4 py-4">
                <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-white/55">
                  Fotogalerie
                </div>
                <div className="flex w-full gap-2 overflow-x-auto pb-1">
                  {galleryImages.map((url, index) => (
                    <button
                      key={`${url}-${index}`}
                      type="button"
                      onClick={() => setActiveImage(url)}
                      className={cn(
                        'relative h-20 w-28 shrink-0 overflow-hidden rounded-xl border bg-black/20 transition-all sm:h-24 sm:w-36',
                        activeImage === url
                          ? 'border-[#FF9D24] ring-2 ring-[#FF9D24]/35'
                          : 'border-white/10 hover:border-white/30',
                      )}
                      aria-label={`Zobrazit fotografii ${index + 1}`}
                    >
                      <img
                        src={url}
                        alt={`${voucher.name} – fotografie ${index + 1}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {index + 1}/{galleryImages.length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-5 p-6">
              <DialogHeader className="space-y-2 text-left">
                <div>
                  <Badge className="mb-3 border border-[#FF9D24]/35 bg-[#FF9D24]/12 text-[#FFB547]">
                    Váš garantovaný benefit
                  </Badge>
                  <DialogTitle className="text-2xl font-bold text-white sm:text-3xl">{voucher.name}</DialogTitle>
                </div>
                <DialogDescription className="text-sm text-white/70">
                  Podívejte se, co jste získali a jak benefit využít.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <Ticket className="h-4 w-4 text-[#FFB547]" />
                    Krátký popis
                  </div>
                  <p className="whitespace-pre-line text-sm leading-6 text-white/75">{detailText?.shortDescription}</p>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <Ticket className="h-4 w-4 text-[#FFB547]" />
                    Popis použití
                  </div>
                  <p className="whitespace-pre-line text-sm leading-6 text-white/75">{detailText?.usageDescription}</p>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <Ticket className="h-4 w-4 text-[#FFB547]" />
                    Podmínky použití
                  </div>
                  <p className="whitespace-pre-line text-sm leading-6 text-white/75">{detailText?.termsText}</p>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <ChevronRight className="h-4 w-4 text-[#FFB547]" />
                    Návod k použití
                  </div>
                  <p className="whitespace-pre-line text-sm leading-6 text-white/75">{detailText?.howToUseText}</p>
                </section>
              </div>

              <DialogFooter className="gap-3 sm:justify-between">
                <div className="text-xs text-white/55">
                  Po koupi se voucher přesune do zakoupených voucherů a kód zůstane dostupný opakovaně.
                </div>
                <Button
                  onClick={() => voucher && onPurchase(voucher.id)}
                  disabled={purchaseDisabled || purchaseLoading}
                  className="h-11 rounded-xl border-0 bg-gradient-to-r from-[#FF8A00] to-[#FFB547] px-5 text-sm font-bold text-[#111] shadow-[0_2px_8px_rgba(255,138,0,0.25)] hover:brightness-105"
                >
                  {purchaseLoading ? 'Probíhá nákup...' : purchaseLabel}
                </Button>
              </DialogFooter>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
