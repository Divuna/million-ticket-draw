import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

type Contest = {
  id: string;
  title: string;
  description: string | null;
  ticket_count: number;
  ticket_price: number;
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
};

type Winner = {
  id: string;
  ticket_id: string;
  prize: string;
};

export default function ContestDetail() {
  const { id } = useParams();
  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);

  const [ticketsPlayed, setTicketsPlayed] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [bonusMiocoins, setBonusMiocoins] = useState(0);
  const [myWins, setMyWins] = useState<Winner[]>([]);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);

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

      // 3) Bonusové výhry (věcné + MioCoiny)
      const { data: bonusData } = await supabase.from("bonus_prizes").select("*").eq("contest_id", id);

      const typedBonus = (bonusData ?? []) as unknown as BonusPrize[];

      // věcné výhry (amount je null nebo 0)
      const physicalPrizes = typedBonus.filter((b) => !b.amount || b.amount === 0);
      setBonusPrizes(physicalPrizes);

      // bonusové MioCoiny – součet amount > 0
      const totalMiocoins = typedBonus.reduce((sum, b) => {
        if (b.amount && b.amount > 0) {
          return sum + b.amount;
        }
        return sum;
      }, 0);
      setBonusMiocoins(totalMiocoins);

      // 4) Moje výhry
      const { data: myWinsData } = await supabase.from("winners").select("*").eq("contest_id", id);

      setMyWins((myWinsData ?? []) as unknown as Winner[]);

      // 5) Zůstatek kreditů – profil / peněženka
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let credit = 0;

      if (user) {
        // nejdřív profiles.miocoin_balance
        const { data: profileData } = await supabase
          .from("profiles")
          .select("miocoin_balance")
          .eq("id", user.id)
          .maybeSingle();

        if (profileData && profileData.miocoin_balance != null) {
          credit = profileData.miocoin_balance as number;
        } else {
          // fallback – wallets.balance
          const { data: walletData } = await supabase
            .from("wallets")
            .select("balance")
            .eq("user_id", user.id)
            .maybeSingle();

          if (walletData && walletData.balance != null) {
            credit = walletData.balance as number;
          }
        }
      }

      setBalance(credit);
      setLoading(false);
    };

    fetchData();
  }, [id]);

  // BANNER OBRÁZEK – hlavní výhra (varianta A)
  let prizeImage = "/fallback-car.png";
  if (contest) {
    let bucket: string | null = null;
    let filename: string | null = null;

    if (contest.main_prize_secondary_image) {
      bucket = "contest-banners";
      filename = contest.main_prize_secondary_image;
    } else if (contest.main_image) {
      bucket = "contest-images";
      filename = contest.main_image;
    } else if (contest.banner_image) {
      bucket = "contest-banners";
      filename = contest.banner_image;
    }

    if (bucket && filename) {
      prizeImage = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${bucket}/${filename}`;
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
    <div className="p-6 w-full mx-auto space-y-8">
      {/* HLAVNÍ BANNER S OBRÁZKEM VÝHRY */}
      <div className="w-full rounded-3xl relative overflow-hidden bg-black/40 border border-yellow-500/20 shadow-[0_0_60px_rgba(250,204,21,0.25)] py-12 px-10">
        {/* text vlevo */}
        <div className="max-w-xl space-y-5 relative z-10">
          <h1 className="text-5xl font-extrabold text-yellow-400">{contest.title}</h1>
          {contest.description && <p className="text-gray-300 text-base leading-relaxed">{contest.description}</p>}
        </div>

        {/* auto vpravo */}
        <div className="absolute right-10 top-1/2 -translate-y-1/2">
          <img
            src={prizeImage}
            alt={contest.title}
            className="w-[450px] drop-shadow-[0_0_40px_rgba(250,204,21,0.45)] object-contain"
          />
        </div>
      </div>

      {/* CTA KARTA – Uplatnit / Dobít + Zůstatek */}
      <div className="bg-[#111418] rounded-2xl p-6 border border-white/5 flex flex-col items-start gap-4">
        <div className="flex gap-4">
          <Button className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3 rounded-xl">
            Uplatnit {contest.ticket_price} MioCoinů
          </Button>
          <Button className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-8 py-3 rounded-xl">
            Dobít MioCoiny
          </Button>
        </div>
        <p className="text-gray-300 text-sm">
          <strong>Zůstatek:</strong> {balance} MioCoinů
        </p>
      </div>

      {/* Cesta k hlavní výhře */}
      <div className="bg-[#111418] rounded-2xl p-6 border border-white/5">
        <h2 className="text-white font-semibold mb-3">Cesta k hlavní výhře</h2>
        <div className="w-full h-2 bg-gray-800 rounded-full">
          <div
            className="h-full bg-yellow-400 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>

        <div className="flex justify-between text-xs text-gray-400 mt-4">
          {[10000, 50000, 100000, 250000, 500000, 750000, 1000000].map((m) => (
            <div key={m} className="flex flex-col items-center">
              <div className="w-3 h-3 bg-yellow-400 rounded-full mb-1"></div>
              {m.toLocaleString("cs-CZ")}
            </div>
          ))}
        </div>
      </div>

      {/* Bonusové věcné výhry */}
      <div className="bg-[#111418] rounded-2xl p-6 border border-white/5">
        <h2 className="text-white font-semibold mb-4">Bonusové věcné výhry</h2>
        {bonusPrizes.length === 0 ? (
          <p className="text-gray-400 text-sm">Žádné bonusové věcné výhry nejsou nastavené.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bonusPrizes.map((b) => (
              <div key={b.id} className="p-4 rounded-xl bg-black/30 border border-white/5">
                <p className="text-white text-sm">{b.description || "Bonusová výhra"}</p>
                {b.ticket_position && (
                  <p className="text-yellow-300 text-xs mt-1">Výherní tiket: {b.ticket_position}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bonusové MioCoiny */}
      <div className="bg-[#111418] rounded-2xl p-6 border border-yellow-500/20 shadow-[0_0_20px_rgba(250,204,21,0.1)]">
        <h2 className="text-white font-semibold mb-4">Bonusové MioCoiny</h2>
        <div className="flex items-center gap-4 p-4 bg-black/30 rounded-xl border border-white/5">
          <img src="/miocoin.png" alt="MioCoin" className="w-10 h-10" />
          <div>
            <p className="text-yellow-300 font-bold text-lg">{bonusMiocoins} MioCoinů</p>
            <p className="text-gray-400 text-xs">Součet všech bonusových MioCoin výher v této soutěži.</p>
          </div>
        </div>
      </div>

      {/* Moje výhry */}
      <div className="bg-[#111418] rounded-2xl p-6 border border-white/5">
        <h2 className="text-white font-semibold mb-4">Moje výhry</h2>
        {myWins.length === 0 ? (
          <p className="text-gray-400 text-sm">Nemáš žádné výhry.</p>
        ) : (
          <ul className="text-gray-300 text-sm space-y-1">
            {myWins.map((w) => (
              <li key={w.id}>
                Výhra na tiketu {w.ticket_id}: {w.prize}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
