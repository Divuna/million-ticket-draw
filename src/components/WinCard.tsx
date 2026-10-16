import React from 'react';
import { OneMilGiftIcon } from '@/components/icons/OneMilIcons';
import { MioBadge } from '@/components/brand/MioBadge';
import { bonusPrizeDisplayName, formatMioCoinNumber } from '@/lib/miocoin';
import { supabaseUrl } from '@/integrations/supabase/client';
import emblem from '@/assets/redesign/onemil-emblem.png';

const getStorageUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${supabaseUrl}/storage/v1/object/public/contest-images/${path}`;
};

interface Win {
  id: string;
  type: string;
  status: string | null;
  delivered: boolean;
  notes: string | null;
  created_at: string;
  contest_id: string;
  prize_id: string | null;
  contest: {
    id: string;
    title: string;
    main_prize: string;
    main_image: string | null;
    main_prize_secondary_image: string | null;
  } | null;
  bonus_prize: {
    id: string;
    title: string | null;
    description?: string | null;
    amount?: number | null;
    image_url: string | null;
  } | null;
}

interface WinCardProps {
  win: Win;
  onClick: () => void;
  className?: string;
  isHighlighted?: boolean;
}

type PillKind = 'wait' | 'ship' | 'done';

/** Stav výhry pro zákazníka – stejné rozlišení jako filtry na stránce Výhry. */
const getPill = (win: Win, isMio: boolean): { kind: PillKind; label: string } => {
  // MIO výhra se připisuje hned při výhře (trigger na `winners`), nic se neodesílá.
  if (isMio) return { kind: 'done', label: 'Připsáno' };
  if (win.delivered || win.status === 'delivered') return { kind: 'done', label: 'Doručeno' };
  if (win.status === 'shipped' || (win.notes ?? '').toLowerCase().includes('shipped')) {
    return { kind: 'ship', label: 'Odesláno' };
  }
  if (win.status === 'připraveno k odeslání') return { kind: 'wait', label: 'Připraveno k odeslání' };
  return { kind: 'wait', label: 'Čeká na předání' };
};

const Pill: React.FC<{ kind: PillKind; label: string }> = ({ kind, label }) => (
  <span className={`om-win-pill om-win-pill-${kind}`}>
    <span className="om-win-pill-dot" aria-hidden="true" />
    {label}
  </span>
);

const activate = (onClick: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onClick();
  }
};

export const WinCard: React.FC<WinCardProps> = ({ win, onClick, className = '', isHighlighted = false }) => {
  const isMainPrize = win.type === 'main';
  const mioAmount = Number(win.bonus_prize?.amount ?? 0);
  const isMio = !isMainPrize && mioAmount > 0;
  const pill = getPill(win, isMio);
  const contestTitle = win.contest?.title || 'Soutěž OneMil';
  const highlight = isHighlighted ? 'om-win-highlight' : '';

  if (isMainPrize) {
    const image = win.contest?.main_prize_secondary_image || win.contest?.main_image || null;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={activate(onClick)}
        className={`om-win-main ${highlight} ${className}`}
      >
        {image && (
          <img
            src={image}
            alt=""
            aria-hidden="true"
            className="om-win-main-img"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        <div className="om-win-main-shade" aria-hidden="true" />
        <div className="om-win-main-body">
          <span className="om-win-flag">
            <img src={emblem} alt="" aria-hidden="true" />
            HLAVNÍ VÝHRA
          </span>
          <div className="flex flex-col gap-1">
            <strong className="om-win-main-name">{win.contest?.main_prize || 'Hlavní výhra'}</strong>
            <span className="om-win-sub">{contestTitle}</span>
          </div>
          <Pill {...pill} />
        </div>
      </div>
    );
  }

  const name = win.notes || bonusPrizeDisplayName(win.bonus_prize, 'Bonusová výhra');
  const image = getStorageUrl(win.bonus_prize?.image_url);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={activate(onClick)}
      className={`om-win-row ${highlight} ${className}`}
    >
      <div className={`om-win-thumb ${isMio ? 'om-win-thumb-mio' : ''}`}>
        {isMio ? (
          <MioBadge width={72} />
        ) : image ? (
          <img
            src={image}
            alt=""
            aria-hidden="true"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <OneMilGiftIcon size={30} className="h-8 w-8 text-[#C2902F]" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {isMio ? (
          <strong className="om-win-mio-amount">+{formatMioCoinNumber(mioAmount)} MIO</strong>
        ) : (
          <strong className="om-win-row-name">{name}</strong>
        )}
        <span className="om-win-row-sub">Bonusová výhra · {contestTitle}</span>
      </div>
      <Pill {...pill} />
    </div>
  );
};

