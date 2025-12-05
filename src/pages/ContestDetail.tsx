import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function ContestDetail() {
  const { id } = useParams();
  const [contest, setContest] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [ticketsPlayed, setTicketsPlayed] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [bonusPrizes, setBonusPrizes] = useState<any[]>([]);
  const [bonusMiocoins, setBonusMiocoins] = useState(0);
  const [myWins, setMyWins] = useState<any[]>([]);
  const [balance, setBalance] = useState(0);

  /** -----------------------------------------------------------
   *  NAČTENÍ DAT SOUTĚŽE
   * ---------------------------------------------------------- */
  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);

      /** 1) Soutěž */
      const { data: contestData } = await supabase.from("contests").select("*").eq("id", id).single();

      setContest(contestData);

      /** 2) Odehrané tickety */
      const { data: ticketsData } = await supabase.from("tickets").select("id").eq("contest_id", id);

      const played = ticketsData?.length ?? 0;
      setTicketsPlayed(played);

      const percent = contestData ? Math.min(100, ((played / contestData.ticket_count) * 100).toFixed(2)) : 0;

      setProgressPercent(percent);

      /** 3) Bonusové výhry (věcné) */
      const { data: bonusData } = await supabase.from("bonus_prizes").select("*").eq("contest_id", id);

      setBonusPrizes(bonusData || []);

      /** 4) Bonusové MioCoiny */
      const totalMiocoins = contestData?.total_miocoin_bonus ?? 0;
      setBonusMiocoins(totalMiocoins);

      /** 5) Moje výhry */
      const { data: myWinsData } = await supabase.from("winners").select("*").eq("contest_id", id);

      setMyWins(myWinsData || []);

      /** 6) Zůstatek kreditů */
      const { data: profileData } = await supabase.from("profiles").select("*").single();

      setBalance(profileData?.miocoin_balance ?? 0);

      setLoading(false);
    };

    fetchData();
  }, [id]);

  /** -----------------------------------------------------------
   *  BANNER S HLAVNÍ VÝHROU
   * ---------------------------------------------------------- */

  const prizeImage = contest?.main_prize_secondary_image
    ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/contest-banners/${contest.main_prize_secondary_image}`
    : contest?.banner_image
      ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/contest-banners/${contest.banner_image}`
      : "/fallback-car.png";

  if (loading || !contest) {
    return (
      <div className="p-6">
        <Skeleton className="w-full h-[400px] rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-6 w-full mx-auto space-y-8">
      {/* -----------------------------------------------------------
           HLAVNÍ BANNER S OBRÁZKEM VÝHRY (VARIANTA A)
         ---------------------------------------------------------- */}
      <div className="w-full rounded-3xl relative overflow-hidden bg-black/40 border border-yellow-500/20 shadow-[0_0_60px_rgba(250,204,21,0.25)] py-12 px-10">
        {/* LEVÁ STRANA – TEXT SOUTĚŽE */}
        <div className="max-w-xl space-y-5 relative z-10">
          <h1 className="text-5xl font-extrabold text-yellow-400">{contest.title}</h1>

          <p className="text-gray-300 text-base leading-relaxed">{contest.description}</p>
        </div>

        {/* PRAVÁ STRANA – AUTO */}
        <div className="absolute right-10 top-1/2 -translate-y-1/2">
          <img
            src={prizeImage}
            alt={contest.title}
            className="w-[450px] drop-shadow-[0_0_40px_rgba(250,204,21,0.45)] object-contain"
          />
        </div>
      </div>

      {/* -----------------------------------------------------------
           CTA KARTA – UPLATNIT / DOBÍT + ZŮSTATEK
         ---------------------------------------------------------- */}
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

      {/* -----------------------------------------------------------
           CESTA K HLAVNÍ VÝHŘE
         ---------------------------------------------------------- */}
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

      {/* -----------------------------------------------------------
           BONUSOVÉ VĚCNÉ VÝHRY
         ---------------------------------------------------------- */}
      <div className="bg-[#111418] rounded-2xl p-6 border border-white/5">
        <h2 className="text-white font-semibold mb-4">Bonusové věcné výhry</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bonusPrizes
            .filter((b) => !b.amount)
            .map((b) => (
              <div key={b.id} className="p-4 rounded-xl bg-black/30 border border-white/5">
                <p className="text-white text-sm">{b.description}</p>
                <p className="text-yellow-300 text-xs mt-1">Výherní tiket: {b.ticket_position}</p>
              </div>
            ))}
        </div>
      </div>

      {/* -----------------------------------------------------------
           BONUSOVÉ MIOCOINY
         ---------------------------------------------------------- */}
      <div className="bg-[#111418] rounded-2xl p-6 border border-yellow-500/20 shadow-[0_0_20px_rgba(250,204,21,0.1)]">
        <h2 className="text-white font-semibold mb-4">Bonusové MioCoiny</h2>

        <div className="flex items-center gap-4 p-4 bg-black/30 rounded-xl border border-white/5">
          <img src="/miocoin.png" alt="MioCoin" className="w-10 h-10" />
          <div>
            <p className="text-yellow-300 font-bold text-lg">{bonusMiocoins} MioCoinů</p>
            <p className="text-gray-400 text-xs">Celkový počet bonusových MioCoin výher v soutěži.</p>
          </div>
        </div>
      </div>

      {/* -----------------------------------------------------------
           MOJE VÝHRY
         ---------------------------------------------------------- */}
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
