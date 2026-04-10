import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tag, Calendar } from 'lucide-react';

// ── Shared type used by OfferCard, OfferDetailModal and Wins ──────────────────
export interface UserOffer {
  id: string;            // user_partner_offers.id
  offer_id: string;
  obtained_at: string;
  opened_at: string | null;
  partner_offers: {
    id: string;
    title: string;
    short_text: string;
    logo_url: string | null;
    banner_url: string | null;
    valid_to: string | null;
    link_or_code: string | null;
    partners: {
      company_name: string | null;
      name: string;
    } | null;
  } | null;
}

interface OfferCardProps {
  offer: UserOffer;
  onClick: () => void;
}

export const OfferCard: React.FC<OfferCardProps> = ({ offer, onClick }) => {
  const data = offer.partner_offers;
  if (!data) return null;

  const partnerName = data.partners?.company_name ?? data.partners?.name ?? '';
  const isNew = !offer.opened_at;
  const isExpired = data.valid_to ? new Date(data.valid_to) < new Date() : false;

  // Prefer banner for the card image; fall back to logo.
  const imageUrl = data.banner_url ?? data.logo_url ?? null;

  return (
    <div
      onClick={onClick}
      className="group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-300
        bg-card border border-border/50
        hover:border-blue-400/40 hover:shadow-lg hover:shadow-blue-500/10 hover:scale-[1.01]"
      style={{ animation: 'fade-in 0.4s ease-out forwards' }}
    >
      {/* Image / logo section */}
      <div className="relative h-44 overflow-hidden bg-muted flex items-center justify-center">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={data.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Tag className="w-16 h-16 text-blue-400/30" />
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-3 right-3 flex flex-col gap-1 items-end">
          {isNew && !isExpired && (
            <Badge className="bg-blue-500/90 text-white border-0 text-xs">Nová</Badge>
          )}
          {isExpired && (
            <Badge className="bg-gray-600/80 text-white border-0 text-xs">Expirovaná</Badge>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-2">
        {partnerName && (
          <p className="text-xs text-blue-400 font-medium uppercase tracking-wide truncate">
            {partnerName}
          </p>
        )}

        <h3 className="font-semibold text-foreground line-clamp-2 leading-tight">
          {data.title}
        </h3>

        {data.short_text && (
          <p className="text-sm text-muted-foreground line-clamp-2">{data.short_text}</p>
        )}

        <div className="pt-1 border-t border-border/50 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground/70 truncate">
            Získáno: {new Date(offer.obtained_at).toLocaleDateString('cs-CZ')}
          </p>
          {data.valid_to && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground/70 shrink-0">
              <Calendar className="w-3 h-3" />
              <span>Do: {new Date(data.valid_to).toLocaleDateString('cs-CZ')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
