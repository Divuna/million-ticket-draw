import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

type Contest = {
  id: string;
  title: string;
  description: string | null;
  ticket_price: number;
  main_prize_secondary_image: string | null;
  main_image: string | null;
  banner_image: string | null;
};

type BonusPrize = {
  id: string;
  contest_id: string;
  description: string | null;
  amount: number | null;
  image_url?: string | null;
};

type Winner = {
  id: string;
  prize: string;
  bonus_prize_id?: string | null;
};

export default function ContestDetail() {
  const { id } = useParams();
  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);

  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [bonusMiocoins, setBonusMiocoins] = useState(0);
  const [myWins, setMyWins] = useState<Winner[]>([]);
  const [balance, setBalance] = useState(0);

  // FUNKCE PRO NAČTENÍ PRIZE IMAGE
  const resolvePrizeImage = (contest: Contest): string => {
    const base = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public`;

    const paths = [
      contest.main_prize_secondary_image ? `contest-banners/${contest.main_prize_secondary_image}` : null,
      contest.main_image ? `contest-images/${contest.main_image}` : null,
      contest.banner_image ? `contest-banners/${contest.banner_image}` : null,
    ];

    for (const p of paths) {
      if (p) return `${base}/${p}`;
    }
    return "/fallback-car.png";
  };

  useEffect(() => {
    const load = async () => {
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

      // 2) Bonusové výhry
      const { data: bonusData } = await supabase.from("bonus_prizes").select("*").eq("contest_id", id);

      const typedBonus = (bonusData ?? []) as BonusPrize[];

      // Fyzické výhry
      const physical = typedBonus.filter((b) => !b.amount || b.amount === 0);
      setBonusPrizes(physical);

      // Bonusové MioCoiny – X ve hře
      const totalMio = typedBonus.reduce((sum, b) => {
        if (b.amount && b.amount > 0) return sum + b.amount;
        return sum;
      }, 0);
      setBonusMiocoins(totalMio);

      // 3) Moje výhry
      const { data: wins } = await supabase.from("winners").select("*").eq("contest_id", id);

      setMyWins((wins ?? []) as Winner[]);

      // 4) balance
      const { data: auth } = await supabase.auth.getUser();

      if (auth?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("miocoin_balance")
          .eq("id", auth.user.id)
          .maybeSingle();

        if (profile?.miocoin_balance != null) {
          setBalance(profile.miocoin_balance);
        }
      }

      setLoading(false);
    };

    load();
  }, [id]);

  if (loading || !contest) {
    return (
      <div className="p-6">
        <Skeleton className="w-full h-[400px] rounded-2xl" />
      </div>
    );
  }

  const prizeImage = resolvePrizeImage(contest);

  return (
    <div className="p-6 w-full mx-auto space-y-10">
      {/* HLAVNÍ BANNER */}
      <div className="w-full rounded-3xl relative overflow-hidden bg-[#0b0e12] border border-yellow-500/20 shadow-[0_0_60px_rgba(250,204,21,0.25)] p-10">
        {/* text */}
        <div className="max-w-xl space-y-5 relative z-10">
          <h1 className="text-5xl font-extrabold text-yellow-400">{contest.title}</h1>
          {contest.description && (
            <p className="text-gray-300 text-base leading-relaxed whitespace-pre-line">{contest.description}</p>
          )}
        </div>

        {/* obrázek */}
        <div className="absolute right-10 top-1/2 -translate-y-1/2">
          <img
            src={prizeImage}
            alt={contest.title}
            className="w-[450px] object-contain drop-shadow-[0_0_40px_rgba(250,204,21,0.45)]"
            onError={(e) => (e.currentTarget.src = "/fallback-car.png")}
          />
        </div>
      </div>

      {/* CTA */}
      <div className="bg-[#111418] rounded-2xl p-6 border border-white/5 flex flex-col gap-4">
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

      {/* MIOCOIN SEKCE */}
      <div className="bg-[#111418] rounded-2xl p-6 border border-yellow-500/20 flex items-center gap-4 shadow-[0_0_20px_rgba(250,204,21,0.1)]">
        <img src="/miocoin.png" className="w-12 h-12" alt="MioCoin" />
        <p className="text-yellow-300 font-bold text-lg">
          Ve hře je celkem: {bonusMiocoins.toLocaleString("cs-CZ")} MioCoinů
        </p>
      </div>

      {/* CESTA K HLAVNÍ VÝHŘE – STATICKÝ GRAFICKÝ PRVEK */}
      <div className="bg-[#111418] rounded-2xl p-6 border border-white/5">
        <h2 className="text-white font-semibold mb-4">Cesta k hlavní výhře</h2>

        {/* SEM DOSADÍŠ GROK / SVG / PNG */}
        <div className="w-full h-24 rounded-xl bg-gradient-to-r from-yellow-600/20 via-yellow-300/30 to-yellow-600/20 shadow-[0_0_25px_rgba(250,204,21,0.3)]"></div>
      </div>

      {/* BONUSOVÉ VĚCNÉ VÝHRY */}
      <div className="bg-[#111418] rounded-2xl p-6 border border-white/5">
        <h2 className="text-white font-semibold mb-4">Bonusové věcné výhry</h2>

        {bonusPrizes.length === 0 ? (
          <p className="text-gray-400 text-sm">Zatím nebyly přidány žádné věcné bonusové výhry.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bonusPrizes.map((b) => (
              <div key={b.id} className="p-4 rounded-xl bg-black/30 border border-white/5">
                <p className="text-white text-sm">{b.description || "Bonusová výhra"}</p>

                {/* INDEXOVÁNÍ OBRÁZKŮ DLE image_url */}
                {b.image_url && (
                  <img
                    src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/bonus-images/${b.image_url}`}
                    alt={b.description ?? "Bonus prize"}
                    className="w-20 h-20 object-contain mt-2"
                  />
                )}

                {myWins.some((w) => w.bonus_prize_id === b.id) && (
                  <p className="text-green-400 text-xs mt-2">Moje výhra</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MOJE VÝHRY */}
      <div className="bg-[#111418] rounded-2xl p-6 border border-white/5">
        <h2 className="text-white font-semibold mb-4">Moje výhry</h2>
        {myWins.length === 0 ? (
          <p className="text-gray-400 text-sm">Nemáš žádné výhry.</p>
        ) : (
          <ul className="text-gray-300 text-sm space-y-1">
            {myWins.map((w) => (
              <li key={w.id}>{w.prize}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
