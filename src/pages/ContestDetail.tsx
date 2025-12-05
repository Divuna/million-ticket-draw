import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function ContestDetail() {
  const { id } = useParams();
  const [contest, setContest] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [ticketsPlayed, setTicketsPlayed] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [bonusPrizes, setBonusPrizes] = useState<any[]>([]);
  const [bonusMiocoins, setBonusMiocoins] = useState(0);
  const [myWins, setMyWins] = useState<any[]>([]);

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

      /** 4) Bonusové MioCoiny (počítají se podle total_miocoin_bonus) */
      const totalMiocoins = contestData?.total_miocoin_bonus ?? 0;
      setBonusMiocoins(totalMiocoins);

      /** 5) Moje výhry */
      const { data: myWinsData } = await supabase.from("winners").select("*").eq("contest_id", id);

      setMyWins(myWinsData || []);

      setLoading(false);
    };

    fetchData();
  }, [id]);

  /** -----------------------------------------------------------
   *  VÝPOČET URL PRO BANNER (z bucketu contest-banners)
   * ---------------------------------------------------------- */
  const bannerSrc = contest?.banner_image
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
           LUXUSNÍ FULL-WIDTH PROMO BANNER
         ---------------------------------------------------------- */}
      <div
        className="w-full rounded-3xl relative overflow-hidden bg-gradient-to-br from-[#1a1a1a] via-[#0d0d0d] to-black 
        border border-yellow-500/20 shadow-[0_0_60px_rgba(250,204,21,0.25)] pb-10"
      >
        {/* Zlaté pozadí */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(250,204,21,0.15),transparent_70%)]"></div>
        <div className="absolute -top-40 -right-40 w-[460px] h-[460px] bg-yellow-500/20 blur-3xl rounded-full"></div>

        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-center px-10 py-12">
          {/* LEVÁ STRANA – TEXT */}
          <div className="flex-1 space-y-5 max-w-xl">
            <Badge className="bg-yellow-500/10 text-yellow-300 border border-yellow-500/40">
              Vytvořeno: {new Date(contest.created_at).toLocaleDateString("cs-CZ")}
            </Badge>

            <h1 className="text-5xl font-extrabold text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.6)]">
              {contest.title}
            </h1>

            <p className="text-gray-300 text-base leading-relaxed">{contest.description}</p>

            <div className="flex gap-6 text-gray-300 text-sm pt-1">
              <span>
                Cena tiketu: <strong>{contest.ticket_price} MioCoinů</strong>
              </span>
              <span>
                Tiketů: <strong>{contest.ticket_count.toLocaleString("cs-CZ")}</strong>
              </span>
              <span>
                Odehráno:{" "}
                <strong>
                  {ticketsPlayed} ({progressPercent}%)
                </strong>
              </span>
            </div>

            <div className="flex gap-4 pt-4">
              <button className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3 rounded-xl shadow-lg">
                Uplatnit {contest.ticket_price} MioCoinů
              </button>

              <button className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-8 py-3 rounded-xl shadow-lg">
                Dobít MioCoiny
              </button>
            </div>
          </div>

          {/* PRAVÁ STRANA – AUTO BANNER */}
          <div className="flex-1 flex justify-center items-center mt-10 lg:mt-0">
            <img
              src={bannerSrc}
              alt={contest.title}
              className="w-[480px] drop-shadow-[0_0_40px_rgba(250,204,21,0.45)] object-contain"
            />
          </div>
        </div>
      </div>

      {/* -----------------------------------------------------------
           CESTA K HLAVNÍ VÝHŘE (PROGRESS BAR)
         ---------------------------------------------------------- */}
      <div className="bg-[#111418] rounded-2xl p-6 border border-white/5">
        <h2 className="text-white font-semibold mb-3">Cesta k hlavní výhře</h2>

        <div className="w-full h-2 bg-gray-800 rounded-full">
          <div
            className="h-full bg-yellow-400 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>

        {/* Milníky */}
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
