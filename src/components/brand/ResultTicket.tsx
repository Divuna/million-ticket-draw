import React from 'react';
import onemilEmblem from '@/assets/redesign/onemil-emblem.png';

/**
 * Tiket z desky „Výsledek tiketu – tři momenty“.
 * - `black` = tiket bez výhry, `gold` = výherní tiket (bonus / hlavní výhra).
 * Číslo tiketu se nikdy nezobrazuje (rozhodnutí Pavla) – jen typ a název soutěže.
 */
interface ResultTicketProps {
  variant: 'black' | 'gold';
  /** Malý nadpis nahoře, např. „SOUTĚŽNÍ TIKET“ / „VÝHERNÍ TIKET“. */
  label: string;
  /** Velké slovo na tiketu, např. „Tiket“, „Bonus“, „Hlavní výhra“. */
  word: string;
  contestTitle?: string | null;
  /** Kulatá pečeť v rohu – např. „+50“ a „MIO“; `emblem` ukáže znak OneMil. */
  seal?: { top: string; bottom?: string } | 'emblem' | null;
  className?: string;
}

export const ResultTicket: React.FC<ResultTicketProps> = ({
  variant,
  label,
  word,
  contestTitle,
  seal,
  className = '',
}) => (
  <div className={`om-rt-wrap ${className}`}>
    <div className={`om-rt om-rt-${variant}`}>
      <span aria-hidden="true" className="om-rt-guilloche" />
      <span aria-hidden="true" className="om-rt-frame" />
      <div className="om-rt-stub">
        <img src={onemilEmblem} alt="" className="om-rt-emblem" />
        <span className="om-rt-brand">ONEMIL</span>
      </div>
      <div className="om-rt-main">
        <span className="om-rt-label">{label}</span>
        <span className="om-rt-word">{word}</span>
        {contestTitle ? <span className="om-rt-contest">{contestTitle}</span> : null}
      </div>
      {variant === 'black' || seal === 'emblem' ? <span aria-hidden="true" className="om-rt-holo" /> : null}
      <span aria-hidden="true" className="om-rt-shine" />
    </div>
    {seal && seal !== 'emblem' ? (
      <span aria-hidden="true" className="om-rt-seal">
        <span className="om-rt-seal-top">{seal.top}</span>
        {seal.bottom ? <span className="om-rt-seal-bottom">{seal.bottom}</span> : null}
      </span>
    ) : null}
    {seal === 'emblem' ? (
      <span aria-hidden="true" className="om-rt-seal om-rt-seal-dark">
        <img src={onemilEmblem} alt="" className="w-[60%]" />
      </span>
    ) : null}
  </div>
);

export default ResultTicket;
