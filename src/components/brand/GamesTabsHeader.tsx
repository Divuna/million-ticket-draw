import { useNavigate } from 'react-router-dom';
import { Heart, Trophy } from 'lucide-react';
import avatarSearch from '@/assets/redesign/avatar/avatar-lupa.png';

interface GamesTabsHeaderProps {
  active: 'all' | 'favorites';
  allCount?: number;
  favoritesCount?: number;
}

/** Hlavička Soutěží (deska 14): pohár, nadpis a přepínač Všechny / Oblíbené. */
export function GamesTabsHeader({ active, allCount, favoritesCount }: GamesTabsHeaderProps) {
  const navigate = useNavigate();
  const isFav = active === 'favorites';
  return (
    <div className="om-games-head">
      <div className="flex items-center gap-4">
        <span className="om-games-icon" aria-hidden="true">
          {isFav ? <Heart className="h-7 w-7" /> : <Trophy className="h-7 w-7" />}
        </span>
        <div className="min-w-0">
          <h1 className="om-games-title">{isFav ? 'Oblíbené' : 'Soutěže'}</h1>
          <p className="om-games-sub">
            {isFav ? 'Soutěže, které sleduješ.' : 'Vyber si soutěž a otevři další tiket v pořadí.'}
          </p>
        </div>
      </div>
      <div className="om-wins-seg mt-4" role="tablist" aria-label="Filtr soutěží">
        <button
          type="button"
          role="tab"
          aria-selected={!isFav}
          className="om-wins-tab"
          onClick={() => !isFav || navigate('/games')}
        >
          Všechny
          {typeof allCount === 'number' && <span className="om-wins-tab-count">{allCount}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isFav}
          className="om-wins-tab"
          onClick={() => isFav || navigate('/favorite-games')}
        >
          <Heart className="h-4 w-4" aria-hidden="true" />
          Oblíbené
          {typeof favoritesCount === 'number' && <span className="om-wins-tab-count">{favoritesCount}</span>}
        </button>
      </div>
    </div>
  );
}

interface GamesEmptyProps {
  title: string;
  text: string;
  actionLabel: string;
  onAction: () => void;
}

/** Prázdný stav s avatarem, který hledá (deska 14, část 3). */
export function GamesEmpty({ title, text, actionLabel, onAction }: GamesEmptyProps) {
  return (
    <div className="om-games-empty">
      <img src={avatarSearch} alt="" aria-hidden="true" className="om-float" />
      <h2 className="om-games-empty-title">{title}</h2>
      <p>{text}</p>
      <button type="button" className="om-games-empty-btn" onClick={onAction}>{actionLabel}</button>
    </div>
  );
}
