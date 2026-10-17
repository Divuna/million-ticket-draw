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
import { useVoucherDiscountLabels } from '@/hooks/useVoucherDiscountLabels';
import { useVoucherPartners } from '@/hooks/useVoucherPartners';
import { voucherCtaLabel } from '@/lib/voucherPricing';
import onemilEmblem from '@/assets/redesign/onemil-emblem.png';
import avatarGift from '@/assets/redesign/avatar/avatar-darek.png';
import avatarThumb from '@/assets/redesign/avatar/avatar-palec.png';
import avatarPhone from '@/assets/redesign/avatar/avatar-telefon-voucher.png';
import avatarWave from '@/assets/redesign/avatar/avatar-mava.png';
import avatarMio from '@/assets/redesign/avatar/avatar-drzi-mio.png';
import avatarPoint from '@/assets/redesign/avatar/avatar-ukazuje.png';
import avatarSearch from '@/assets/redesign/avatar/avatar-lupa.png';
import avatarThrone from '@/assets/redesign/avatar/avatar-trun.webp';

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
  /** Slevová nálepka na kartě (např. „−20 %“); jen zobrazení. */
  discount_label?: string | null;
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
  /** Zachováno kvůli kompatibilitě; údaje „Zbývá“ a „Platí do“ jsou nově vždy dole na kartě. */
  showInfoBadges?: boolean;
  /** Pořadí karty v seznamu – určuje pózu maskota (střídají se dokola). */
  index?: number;
  /** Text tlačítka (výchozí podle ceny voucheru). */
  ctaLabel?: string;
  className?: string;
}

/** Pózy maskota pro karty voucherů – střídají se dokola (deska „Karta voucheru“, varianta C). */
const VOUCHER_MASCOTS = [
  { src: avatarGift, alt: 'Maskot podává dárek' },
  { src: avatarThumb, alt: 'Maskot s palcem nahoru' },
  { src: avatarPhone, alt: 'Maskot ukazuje voucher v telefonu' },
  { src: avatarWave, alt: 'Maskot mává' },
  { src: avatarMio, alt: 'Maskot drží MIO' },
  { src: avatarPoint, alt: 'Maskot ukazuje' },
  { src: avatarSearch, alt: 'Maskot hledá lupou' },
  { src: avatarThrone, alt: 'Maskot na trůnu' },
];

export const VoucherShowcaseCard: React.FC<VoucherShowcaseCardProps> = ({
  voucher,
  remainingLabel,
  onDetail,
  onFavoriteToggle,
  favoriteActive = false,
  favoriteDisabled = false,
  favoriteAriaLabel,
  index = 0,
  ctaLabel,
  className,
}) => {
  const validityLabel = getVoucherValidityLabel(voucher);
  const remaining = (remainingLabel ?? getVoucherRemainingLabel(voucher))?.replace(/^Zbývá:\s*/, '') ?? null;
  const photo = voucher.banner_url || voucher.image_url;
  const discountLabels = useVoucherDiscountLabels();
  const partners = useVoucherPartners();
  const partner = partners[voucher.id];
  const discountLabel = (voucher.discount_label ?? discountLabels[voucher.id] ?? '').trim();
  const mascot = VOUCHER_MASCOTS[((index % VOUCHER_MASCOTS.length) + VOUCHER_MASCOTS.length) % VOUCHER_MASCOTS.length];

  return (
    <div
      className={cn('om-vt-wrap', className)}
      onClick={onDetail}
    >
      <article className="om-vt">
        <div className="om-vt-photo">
          {photo ? (
            <img src={photo} alt={`${voucher.name} banner`} loading="lazy" />
          ) : (
            <div className="om-vt-photo-empty"><OneMilVoucherIcon size={40} className="h-10 w-10" /></div>
          )}
          {onFavoriteToggle && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onFavoriteToggle(event);
              }}
              disabled={favoriteDisabled}
              className="om-vt-heart"
              aria-label={favoriteAriaLabel ?? (favoriteActive ? 'Odebrat z oblíbených' : 'Přidat do oblíbených')}
            >
              <OneMilHeartIcon
                size={18}
                className={cn('h-[18px] w-[18px]', favoriteActive ? 'fill-destructive text-destructive' : 'text-white')}
              />
            </button>
          )}
          {discountLabel && (
            <span data-testid="voucher-discount-sticker" className="om-vt-sticker" aria-label={'Sleva ' + discountLabel}>
              {discountLabel}
            </span>
          )}
        </div>
        <span className="om-vt-gold" aria-hidden="true" />
        <div className="om-vt-title">
          {partner?.name && <span className="om-vt-partner">{partner.name}</span>}
          <strong className="om-vt-name">{voucher.name}</strong>
        </div>
        <div className="om-vt-cut" aria-hidden="true" />
        <div className="om-vt-foot">
          <div className="om-vt-meta">
            <span>{remaining != null ? <>Zbývá <b>{remaining} ks</b></> : ' '}</span>
            <span>{validityLabel ?? ''}</span>
          </div>
          <button
            type="button"
            className="om-vt-btn"
            onClick={(event) => {
              event.stopPropagation();
              onDetail();
            }}
          >
            {ctaLabel ?? voucherCtaLabel}
          </button>
        </div>
      </article>
      <div className="om-vt-logo" aria-hidden={partner?.logoUrl ? undefined : true}>
        {partner?.logoUrl ? <img src={partner.logoUrl} alt={partner.name} /> : <img src={onemilEmblem} alt="" />}
      </div>
      <img src={mascot.src} alt="" aria-hidden="true" className="om-vt-mascot" loading="lazy" />
    </div>
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
  purchaseLabel = voucherCtaLabel,
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
      <DialogContent className="voucher-detail-light-dialog max-w-5xl max-h-[92vh] overflow-y-auto border-[rgba(194,144,47,0.35)] bg-gradient-to-b from-[hsl(220_30%_8%)] to-[hsl(220_35%_5%)] p-0">
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
                  <ImageIcon className="h-16 w-16 text-[rgba(194,144,47,0.45)]" />
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
                          ? 'border-[#E9B949] ring-2 ring-[#E9B949]/35'
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
                  <Badge className="mb-3 border border-[#E9B949]/35 bg-[#E9B949]/12 text-[#E9B949]">
                    Tvůj garantovaný benefit
                  </Badge>
                  <DialogTitle className="text-2xl font-bold text-white sm:text-3xl">{voucher.name}</DialogTitle>
                </div>
                <DialogDescription className="text-sm text-white/70">
                  Podívej se, co jsi získal a jak benefit využít.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <Ticket className="h-4 w-4 text-[#E9B949]" />
                    Krátký popis
                  </div>
                  <p className="whitespace-pre-line text-sm leading-6 text-white/75">{detailText?.shortDescription}</p>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <Ticket className="h-4 w-4 text-[#E9B949]" />
                    Popis použití
                  </div>
                  <p className="whitespace-pre-line text-sm leading-6 text-white/75">{detailText?.usageDescription}</p>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <Ticket className="h-4 w-4 text-[#E9B949]" />
                    Podmínky použití
                  </div>
                  <p className="whitespace-pre-line text-sm leading-6 text-white/75">{detailText?.termsText}</p>
                </section>

                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <ChevronRight className="h-4 w-4 text-[#E9B949]" />
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
                  className="h-11 rounded-xl border-0 bg-gradient-to-r from-[#C2902F] to-[#E9B949] px-5 text-sm font-bold text-[#111] shadow-[0_2px_8px_rgba(194,144,47,0.25)] hover:brightness-105"
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
