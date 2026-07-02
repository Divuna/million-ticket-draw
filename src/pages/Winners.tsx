import { Header } from '@/components/Header';
import { WinnerCard } from '@/components/WinnerCard';
import { useLatestWinners } from '@/hooks/useLatestWinners';
import { OneMilTrophyIcon } from '@/components/icons/OneMilIcons';
import { Skeleton } from '@/components/ui/skeleton';
import winnerBgTrophy from '@/assets/winner-backgrounds/winner-card-bg-trophy.png';
import winnerBgCrown from '@/assets/winner-backgrounds/winner-card-bg-crown.png';
import winnerBgClean from '@/assets/winner-backgrounds/winner-card-bg-clean.png';

const WINNER_BG_ROTATION = [winnerBgTrophy, winnerBgCrown, winnerBgClean];

const Winners = () => {
  const { data: winners, isLoading } = useLatestWinners(50);

  return (
    <div className="winners-light-page min-h-screen bg-background pb-24">
      <Header />
      
      <div className="winners-light-content relative z-10 container mx-auto max-w-6xl px-4 py-8 md:py-10">
        <section className="winners-light-panel space-y-6 p-5 md:p-6">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="customer-premium-orange-heading text-3xl md:text-4xl font-bold text-heading-gold flex items-center gap-3">
              <OneMilTrophyIcon size={32} className="w-8 h-8" />
              Poslední výherci
            </h1>
            <p className="text-text-silver">
              Přehled posledních 50 výherců ze všech soutěží
            </p>
          </div>

          {/* Winners List */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="winners-light-skeleton rounded-xl overflow-hidden border p-4">
                  <div className="flex gap-4">
                    <Skeleton className="w-16 h-16 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                </div>
              ))
            ) : winners && winners.length > 0 ? (
              winners.map((winner, index) => (
                <WinnerCard
                  key={winner.id}
                  userName={winner.user_name}
                  userNickname={winner.user_nickname}
                  prizeName={winner.prize_name}
                  contestTitle={winner.contest_title}
                  createdAt={winner.created_at}
                  type={winner.type}
                  prizeImageUrl={winner.prize_image_url}
                  cardStyleImageUrl={WINNER_BG_ROTATION[index % WINNER_BG_ROTATION.length]}
                  userAvatarUrl={winner.user_avatar_url}
                  ticketNumber={winner.ticket_number}
                  variant="champagne"
                />
              ))
            ) : (
              <div className="col-span-full text-center py-12 space-y-3">
                <OneMilTrophyIcon size={48} className="w-12 h-12 mx-auto text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Zatím nebyly vyhlášeny žádné výhry.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Winners;
