import { Header } from '@/components/Header';
import { BottomNavigation } from '@/components/BottomNavigation';
import { WinnerCard } from '@/components/WinnerCard';
import { useLatestWinners } from '@/hooks/useLatestWinners';
import { Trophy } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const Winners = () => {
  const { data: winners, isLoading } = useLatestWinners(50);

  return (
    <div className="min-h-screen bg-background pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold text-heading-gold flex items-center gap-3">
              <Trophy className="w-8 h-8" />
              Poslední výherci
            </h1>
            <p className="text-text-silver">
              Přehled posledních 50 výherců ze všech soutěží
            </p>
          </div>

          {/* Winners List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: 9 }).map((_, index) => (
                <div key={index} className="rounded-xl overflow-hidden bg-card/60 border border-border/50 p-4">
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
              winners.map((winner) => (
                <WinnerCard
                  key={winner.id}
                  userName={winner.user_name}
                  userNickname={winner.user_nickname}
                  prizeName={winner.prize_name}
                  contestTitle={winner.contest_title}
                  createdAt={winner.created_at}
                  type={winner.type}
                />
              ))
            ) : (
              <div className="col-span-full text-center py-12 space-y-3">
                <Trophy className="w-12 h-12 mx-auto text-muted-foreground/50" />
                <h3 className="text-lg font-bold text-foreground">Zatím žádní výherci</h3>
                <p className="text-sm text-muted-foreground">
                  Momentálně nejsou k dispozici žádné výhry
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <BottomNavigation />
    </div>
  );
};

export default Winners;
