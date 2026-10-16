import React from 'react';
import { Tag } from 'lucide-react';

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
  const logo = data.logo_url ?? data.banner_url ?? null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="om-offer-card group relative cursor-pointer"
    >
      <div className="om-offer-head">
        <div className="om-offer-logo">
          {logo ? (
            <img
              src={logo}
              alt={partnerName || data.title}
              loading="lazy"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <Tag className="h-8 w-8 text-[#C2902F]" aria-hidden="true" />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1 pr-12">
          {partnerName && <span className="om-offer-partner truncate">{partnerName}</span>}
          <strong className="om-offer-title">{data.title}</strong>
        </div>
        {isNew && !isExpired && <span className="om-offer-flag">Nová</span>}
        {isExpired && <span className="om-offer-flag om-offer-flag-off">Expirovaná</span>}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <p className="text-[13px] leading-snug text-[#5E5B57]">
          {data.short_text}
          {data.valid_to && (
            <span className="whitespace-nowrap"> · Platí do {new Date(data.valid_to).toLocaleDateString('cs-CZ')}</span>
          )}
        </p>
        <span className="om-offer-cta" aria-hidden="true">Zobrazit nabídku</span>
      </div>
    </div>
  );
};
