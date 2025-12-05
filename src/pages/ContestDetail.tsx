import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import MioCoin from "@/components/MioCoin";

type Contest = {
  id: string;
  title: string;
  description: string | null;
  ticket_count: number;
  ticket_price: number;
  main_prize: string;
  main_prize_secondary_image: string | null;
  main_image: string | null;
  banner_image: string | null;
};

type BonusPrize = {
  id: string;
  contest_id: string;
  description: string | null;
  ticket_position: number | null;
  amount: number | null;
  image_url: string | null;
  status: string | null;
};

type Winner = {
  id: string;
  user_id: string;
  prize_id: string | null;
  type: string;
};

export default function ContestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [ticketsPlayed, setTicketsPlayed] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [totalMiocoins, setTotalMiocoins] = useState(0);
  const [myWins, setMyWins] = useState<Winner[]>([]);
  const [balance, setBalance] = useState(0);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id || null);

      // 1) Soutěž
      const { data: contestData } = await supabase.from("contests").select("*").eq("id", id).maybeSingle();

      if (!contestData) {
        setLoading(false);
        return;
      }

      const typedContest = contestData as unknown as Contest;
      setContest(typedContest);

      // 2) Tickety
      const { data: ticketsData } = await supabase.from("tickets").select("id").eq("contest_id", id);

      const played = ticketsData?.length ?? 0;
      setTicketsPlayed(played);

      const percent =
        typedContest.ticket_count > 0 ? Math.min(100, Math.round((played / typedContest.ticket_count) * 100)) : 0;
      setProgressPercent(percent);

      // 3) Bonusové výhry
      const { data: bonusData } = await supabase.from("bonus_prizes").select("*").eq("contest_id", id);

      const typedBonus = (bonusData ?? []) as unknown as BonusPrize[];

      // Filter physical prizes (not MioCoin bonuses)
      const physicalPrizes = typedBonus.filter((b) => {
        if (b.amount && b.amount > 0) return false;
        if (!b.description) return false;
        const desc = b.description.toLowerCase();
        if (desc.includes("miocoin") || desc.includes("mio coin")) return false;
        if (/^\d+$/.test(b.description.trim())) return false;
        return true;
      });
      setBonusPrizes(physicalPrizes);

      // Sum of all MioCoin bonuses
      const miocoinsSum = typedBonus.reduce((sum, b) => {
        if (b.amount && b.amount > 0) {
          return sum + b.amount;
        }
        return sum;
      }, 0);
      setTotalMiocoins(miocoinsSum);

      // 4) Moje výhry
      if (user) {
        const { data: myWinsData } = await supabase.from("winners").select("*").eq("contest_id", id).eq("user_id", user.id);
        setMyWins((myWinsData ?? []) as unknown as Winner[]);
      }

      // 5) Zůstatek
      if (user) {
        const { data: walletData } = await supabase
          .from("wallets")
          .select("balance_coins")
          .eq("user_id", user.id)
          .maybeSingle();

        if (walletData && walletData.balance_coins != null) {
          setBalance(walletData.balance_coins);
        }
      }

      setLoading(false);
    };

    fetchData();
  }, [id]);

  // Check if user won a specific bonus prize
  const didUserWinPrize = (prizeId: string) => {
    return myWins.some((w) => w.prize_id === prizeId);
  };

  // Handle ticket purchase
  const handlePurchase = async () => {
    if (!userId || !contest) {
      toast.error("Pro nákup musíš být přihlášen.");
      return;
    }

    if (balance < contest.ticket_price) {
      toast.error("Nedostatek MioCoinů. Dobij si kredit.");
      return;
    }

    setPurchasing(true);
    try {
      const { data, error } = await supabase.rpc("buy_ticket_atomic", {
        p_user_id: userId,
        p_contest_id: contest.id,
      });

      if (error) throw error;

      const result = data as { success: boolean; ticket_number?: number; message?: string };

      if (result.success) {
        setBalance((prev) => prev - contest.ticket_price);
        setTicketsPlayed((prev) => prev + 1);
        toast.success(`Tiket zakoupen! Číslo: ${result.ticket_number}`);
      } else {
        toast.error(result.message || "Nákup se nezdařil.");
      }
    } catch (err: any) {
      toast.error(err.message || "Chyba při nákupu tiketu.");
    } finally {
      setPurchasing(false);
    }
  };

  // Banner image logic
  let bannerImage = "/fallback-car.png";
  if (contest) {
    if (contest.banner_image) {
      bannerImage = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/contest-banners/${contest.banner_image}`;
    } else if (contest.main_image) {
      bannerImage = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/contest-images/${contest.main_image}`;
    } else if (contest.main_prize_secondary_image) {
      bannerImage = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/contest-banners/${contest.main_prize_secondary_image}`;
    }
  }

  if (loading || !contest) {
    return (
      <div className="p-6">
        <Skeleton className="w-full h-[400px] rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 w-full mx-auto space-y-6">
      {/* TOP BANNER */}
      <div className="w-full rounded-2xl relative overflow-hidden bg-gradient-to-r from-black/80 to-black/40 border border-yellow-500/20 shadow-[0_0_40px_rgba(250,204,21,0.15)]">
        <img
          src={bannerImage}
          alt={contest.title}
          className="absolute inset-0 w-full h-full object-cover opacity-30"
        />
        <div className="relative z-10 p-6 md:p-10 flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="flex-1 space-y-4">
            <h1 className="text-3xl md:text-4xl font-bold text-yellow-400">{contest.title}</h1>
            {contest.description && (
              <p className="text-gray-300 text-sm md:text-base leading-relaxed max-w-xl">{contest.description}</p>
            )}
            <p className="text-yellow-300 font-semibold text-lg">Hlavní výhra: {contest.main_prize}</p>
          </div>
          <div className="w-full md:w-auto">
            <img
              src={bannerImage}
              alt={contest.main_prize}
              className="w-full md:w-[300px] lg:w-[400px] rounded-xl object-contain drop-shadow-[0_0_30px_rgba(250,204,21,0.3)]"
            />
          </div>
        </div>
      </div>

      {/* CTA BUTTONS + BALANCE */}
      <div className="bg-card rounded-2xl p-5 border border-border flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handlePurchase}
            disabled={purchasing || balance < contest.ticket_price}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-3 rounded-xl"
          >
            {purchasing ? "Kupuji..." : `Uplatnit ${contest.ticket_price} MioCoinů`}
          </Button>
          <Button
            onClick={() => navigate("/profile")}
            className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-6 py-3 rounded-xl"
          >
            Dobít MioCoiny
          </Button>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <MioCoin size="sm" showAmount={false} />
          <span>Zůstatek: <strong className="text-yellow-400">{balance}</strong> MioCoinů</span>
        </div>
      </div>

      {/* MIOCOIN SECTION */}
      {totalMiocoins > 0 && (
        <div className="bg-card rounded-2xl p-5 border border-yellow-500/20 shadow-[0_0_20px_rgba(250,204,21,0.08)]">
          <div className="flex items-center gap-3">
            <MioCoin size="lg" showAmount={false} />
            <p className="text-yellow-400 font-semibold text-lg">
              Ve hře je celkem: {totalMiocoins.toLocaleString("cs-CZ")} MioCoinů
            </p>
          </div>
        </div>
      )}

      {/* CESTA K HLAVNÍ VÝHŘE - Static graphic */}
      <div className="bg-card rounded-2xl p-5 border border-border">
        <h2 className="text-foreground font-semibold mb-4">Cesta k hlavní výhře</h2>
        <div className="relative">
          <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between mt-3">
            <span className="text-xs text-muted-foreground">Start</span>
            <span className="text-xs text-yellow-400 font-medium">{progressPercent}%</span>
            <span className="text-xs text-muted-foreground">Hlavní výhra</span>
          </div>
        </div>
      </div>

      {/* BONUSOVÉ VĚCNÉ VÝHRY */}
      <div className="bg-card rounded-2xl p-5 border border-border">
        <h2 className="text-foreground font-semibold mb-4">Bonusové věcné výhry</h2>
        {bonusPrizes.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            Zatím nebyly přidány žádné věcné bonusové výhry.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bonusPrizes.map((prize) => {
              const userWon = didUserWinPrize(prize.id);
              return (
                <div
                  key={prize.id}
                  className={`rounded-xl overflow-hidden border ${
                    userWon ? "border-green-500/50 bg-green-500/10" : "border-border bg-muted/30"
                  }`}
                >
                  {prize.image_url && (
                    <div className="aspect-video w-full overflow-hidden">
                      <img
                        src={prize.image_url}
                        alt={prize.description || "Bonusová výhra"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="p-4">
                    <p className="text-foreground font-medium text-sm">
                      {prize.description || "Bonusová výhra"}
                    </p>
                    {userWon && (
                      <span className="inline-block mt-2 text-xs font-semibold text-green-400 bg-green-500/20 px-2 py-1 rounded">
                        Moje výhra
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MOJE VÝHRY */}
      <div className="bg-card rounded-2xl p-5 border border-border">
        <h2 className="text-foreground font-semibold mb-4">Moje výhry</h2>
        {myWins.length === 0 ? (
          <p className="text-muted-foreground text-sm">Zatím nemáš žádné výhry v této soutěži.</p>
        ) : (
          <div className="space-y-2">
            {myWins.map((win) => (
              <div key={win.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border">
                <div className="w-2 h-2 bg-green-400 rounded-full" />
                <span className="text-foreground text-sm">
                  {win.type === "main" ? "Hlavní výhra" : "Bonusová výhra"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
