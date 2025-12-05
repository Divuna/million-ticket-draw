import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const ContestDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [contest, setContest] = useState<any>(null);
  const [bonusPrizes, setBonusPrizes] = useState<any[]>([]);
  const [userWallet, setUserWallet] = useState<any>(null);
  const [userWins, setUserWins] = useState<any[]>([]);

  // ✅ TADY JE TVŮJ OPRAVENÝ useEffect — BEZ ÚPRAV
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const { data: contestData, error: contestError } = await supabase
        .from("contests")
        .select("*")
        .eq("id", id)
        .single();

      if (contestError) {
        setError("Nepodařilo se načíst soutěž.");
        setLoading(false);
        return;
      }

      const { data: bonusData, error: bonusError } = await supabase
        .from("bonus_prizes")
        .select(
          `
          id,
          description,
          ticket_position,
          status,
          amount,
          image_url
        `,
        )
        .eq("contest_id", id)
        .order("ticket_position", { ascending: true });

      if (bonusError) {
        console.error(bonusError);
      }

      const { data: walletData } = await supabase
        .from("wallets")
        .select("balance_coins")
        .eq("user_id", user?.id)
        .single();

      const { data: userWinData } = await supabase
        .from("user_wins")
        .select("*")
        .eq("user_id", user?.id)
        .eq("contest_id", id);

      setContest(contestData);
      setBonusPrizes(bonusData || []);
      setUserWallet(walletData || { balance_coins: 0 });
      setUserWins(userWinData || []);
      setLoading(false);
    };

    if (id) fetchData();
  }, [id, user]);

  // 📌 LOADING / ERROR
  if (loading) return <div>Načítám…</div>;
  if (error) return <div>{error}</div>;
  if (!contest) return <div>Soutěž nebyla nalezena.</div>;

  // 📌 Filtrace věcných výher (žádné MioCoiny)
  const physicalPrizes = bonusPrizes.filter((p) => {
    const desc = p.description?.toLowerCase() || "";
    if (desc.includes("miocoin")) return false;
    if (/^\d+$/.test(desc)) return false;
    return true;
  });

  return (
    <div className="p-4 space-y-8">
      {/* 🏆 Název soutěže */}
      <h1 className="text-3xl font-bold text-white">{contest.title}</h1>

      {/* 💰 Peněženka */}
      <div className="p-4 bg-white/5 rounded-xl border border-white/10">
        <h2 className="text-lg font-semibold">Tvoje peněženka</h2>
        <div className="mt-2 text-xl font-bold text-yellow-400">{userWallet?.balance_coins} MioCoinů</div>
      </div>

      {/* ⭐ Cesta k hlavní výhře */}
      <div className="p-4 bg-white/5 rounded-xl border border-white/10">
        <h2 className="text-lg font-semibold">Cesta k hlavní výhře</h2>
        <p className="text-sm text-white/60">Tady bude grafická osa (zatím placeholder).</p>
      </div>

      {/* 🎁 Bonusové věcné výhry */}
      {physicalPrizes.length > 0 && (
        <div className="p-4 bg-white/5 rounded-xl border border-white/10">
          <h2 className="text-lg font-semibold flex items-center gap-2">🎁 Bonusové věcné výhry</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {physicalPrizes.map((prize) => (
              <div key={prize.id} className="p-4 bg-black/30 rounded-lg border border-white/10">
                {prize.image_url && (
                  <img
                    src={prize.image_url}
                    alt={prize.description}
                    className="w-full h-40 object-cover rounded-lg mb-3"
                  />
                )}

                <div className="text-lg font-semibold">{prize.description}</div>
                <div className="text-sm text-white/60">Výherní ticket: {prize.ticket_position}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 🏅 Moje výhry */}
      <div className="p-4 bg-white/5 rounded-xl border border-white/10">
        <h2 className="text-lg font-semibold flex items-center gap-2">🏅 Moje výhry</h2>

        {userWins.length === 0 ? (
          <p className="text-white/60 mt-2">Zatím nemáš v této soutěži žádné výhry.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {userWins.map((win) => (
              <li key={win.id} className="p-3 bg-black/30 rounded-lg border border-white/10">
                Ticket #{win.ticket_number} — {win.prize_name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ContestDetail;
