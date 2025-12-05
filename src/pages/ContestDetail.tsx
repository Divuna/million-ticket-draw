import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { TicketResultModal } from "@/components/TicketResultModal";

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

interface UnlockTicketResult {
  ticket_number: number;
  ticket_price: number;
  next_bonus_position?: number | null;
  distance_to_next_bonus?: number | null;
  won_prize?: string | null;
  remaining_tickets?: number;
  won_type?: 'bonus' | 'main' | null;
  bonus_prize_id?: string | null;
}

export default function ContestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);

  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [bonusMiocoins, setBonusMiocoins] = useState(0);
  const [myWins, setMyWins] = useState<Winner[]>([]);
  const [balance, setBalance] = useState(0);

  const [processingContestId, setProcessingContestId] = useState<string | null>(null);
  const [modalResult, setModalResult] = useState<UnlockTicketResult | null>(null);
  const [modalContestId, setModalContestId] = useState<string | null>(null);

  async function loadUserBalance(userId: string) {
    const { data: wallet } = await supabase.from("wallets").select("balance_coins").eq("user_id", userId).maybeSingle();

    if (wallet?.balance_coins != null) {
      setBalance(wallet.balance_coins);
      return;
    }

    const { data: profile } = await supabase.from("profiles").select("miocoin_balance").eq("id", userId).maybeSingle();

    if (profile?.miocoin_balance != null) {
      setBalance(profile.miocoin_balance);
    }
  }

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUserBalance(session.user.id);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleUseMiocoins() {
    if (!user) {
      toast.error("Pro nákup tiketu se musíš přihlásit.");
      navigate("/login");
      return;
    }

    if (!contest) return;

    setProcessingContestId(contest.id);

    try {
      const { data, error } = await supabase.rpc('buy_ticket_atomic', {
        p_contest_id: contest.id,
        p_user_id: user.id
      });

      if (error) {
        console.error("RPC error:", error);
        if (error.message?.includes("closed") || error.message?.includes("uzavřena")) {
          toast.error("Soutěž je již uzavřena.");
        } else if (error.message?.includes("insufficient") || error.message?.includes("nedostatek")) {
          toast.error("Nedostatek MioCoinů. Dobi si kredit.");
        } else if (error.message?.includes("full") || error.message?.includes("plná")) {
          toast.error("Soutěž je již plná.");
        } else {
          toast.error("Chyba při nákupu tiketu.");
        }
        setProcessingContestId(null);
        return;
      }

      if (data && typeof data === 'object') {
        const result = data as { success?: boolean; error?: string } & UnlockTicketResult;
        
        if (result.success === false || result.error) {
          const errorMsg = result.error || "Chyba při nákupu tiketu.";
          if (errorMsg.includes("closed") || errorMsg.includes("uzavřena")) {
            toast.error("Soutěž je již uzavřena.");
          } else if (errorMsg.includes("insufficient") || errorMsg.includes("nedostatek")) {
            toast.error("Nedostatek MioCoinů. Dobi si kredit.");
          } else if (errorMsg.includes("full") || errorMsg.includes("plná")) {
            toast.error("Soutěž je již plná.");
          } else {
            toast.error(errorMsg);
          }
          setProcessingContestId(null);
          return;
        }

        // Success - show modal
        setModalResult(result);
        setModalContestId(contest.id);

        // Reload balance
        await loadUserBalance(user.id);

        if (result.won_type === 'main') {
          toast.success("Gratulujeme! Vyhrál jsi hlavní cenu!");
        } else if (result.won_type === 'bonus') {
          toast.success("Gratulujeme! Vyhrál jsi bonusovou cenu!");
        } else {
          toast.success(`Tiket #${result.ticket_number} zakoupen!`);
        }
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error("Neočekávaná chyba při nákupu tiketu.");
    } finally {
      setProcessingContestId(null);
    }
  }

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);

      const { data: contestData } = await supabase.from("contests").select("*").eq("id", id).maybeSingle();

      if (!contestData) {
        setLoading(false);
        return;
      }

      setContest(contestData as Contest);

      const { data: bonusData } = await supabase.from("bonus_prizes").select("*").eq("contest_id", id);

      const typedBonus = (bonusData ?? []) as BonusPrize[];

      setBonusPrizes(typedBonus.filter((b) => !b.amount || b.amount === 0));

      setBonusMiocoins(typedBonus.reduce((sum, b) => (b.amount ? sum + b.amount : sum), 0));

      const { data: wins } = await supabase.from("winners").select("*").eq("contest_id", id);

      setMyWins((wins ?? []) as Winner[]);

      const { data: auth } = await supabase.auth.getUser();
      if (auth?.user) {
        loadUserBalance(auth.user.id);
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

  const prizeImage = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/contest-images/${contest.main_image}`;
  const isProcessing = processingContestId === contest.id;

  return (
    <div className="p-6 w-full mx-auto space-y-10">
      {/* HLAVNÍ BANNER */}
      <div className="w-full rounded-3xl relative overflow-hidden bg-[#0b0e12] border border-yellow-500/20 shadow-[0_0_60px_rgba(250,204,21,0.25)] p-10">
        <div className="max-w-xl space-y-5 relative z-10">
          <h1 className="text-5xl font-extrabold text-yellow-400">{contest.title}</h1>

          {contest.description && (
            <p className="text-gray-300 text-base leading-relaxed whitespace-pre-line">{contest.description}</p>
          )}
        </div>

        <div className="absolute right-10 top-1/2 -translate-y-1/2">
          <img
            src={prizeImage}
            alt={contest.title}
            className="w-[450px] object-contain pointer-events-none"
            onError={(e) => (e.currentTarget.src = "/fallback-car.png")}
          />
        </div>
      </div>

      {/* CTA */}
      <div className="bg-[#111418] rounded-2xl p-6 border border-white/5 flex flex-col gap-4 relative z-50">
        <div className="flex gap-4 flex-wrap">
          <Button
            onClick={handleUseMiocoins}
            disabled={isProcessing}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3 rounded-xl disabled:opacity-50"
          >
            {isProcessing ? "Zpracovávám..." : `Uplatnit ${contest.ticket_price} MioCoinů`}
          </Button>

          <Button
            onClick={() => navigate("/profile")}
            className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-8 py-3 rounded-xl"
          >
            Dobít MioCoiny
          </Button>
        </div>

        <p className="text-gray-300 text-sm">
          <strong>Zůstatek:</strong> {balance} MioCoinů
        </p>
      </div>

      {/* MIOCOIN SEKCE */}
      <div className="bg-[#111418] rounded-2xl p-6 border border-yellow-500/20 flex items-center gap-4 shadow-[0_0_20px_rgba(250,204,21,0.1)]">
        <img
          src="/miocoin.png"
          alt="MioCoin"
          className="w-8 h-8 object-contain mr-2"
        />
        <p className="text-yellow-300 font-bold text-lg">
          Ve hře je celkem: {bonusMiocoins.toLocaleString("cs-CZ")} MioCoinů
        </p>
      </div>

      {/* CESTA K HLAVNÍ VÝHŘE */}
      <div className="bg-[#111418] rounded-2xl p-6 border border-white/5">
        <h2 className="text-white font-semibold mb-4">Cesta k hlavní výhře</h2>
        <div className="w-full h-3 rounded-full bg-gradient-to-r from-yellow-500 via-yellow-300 to-yellow-600 shadow-[0_0_15px_rgba(250,204,21,0.6)]" />
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

      {/* TICKET RESULT MODAL */}
      <TicketResultModal
        isOpen={modalResult !== null}
        onClose={() => {
          setModalResult(null);
          setModalContestId(null);
        }}
        contestId={modalContestId || ""}
        result={modalResult ? {
          ticket_number: modalResult.ticket_number,
          next_bonus_position: modalResult.next_bonus_position ?? 0,
          distance_to_next_bonus: modalResult.distance_to_next_bonus ?? 0,
          won_prize: modalResult.won_prize,
          remaining_tickets: modalResult.remaining_tickets,
          won_type: modalResult.won_type,
          bonus_prize_id: modalResult.bonus_prize_id
        } : undefined}
      />
    </div>
  );
}
