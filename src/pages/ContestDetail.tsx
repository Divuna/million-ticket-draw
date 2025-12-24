import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { MIOCOIN_IMAGE_URL } from "@/components/MioCoin";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { TicketResultModal } from "@/components/TicketResultModal";

/* ================= TYPES ================= */

type Contest = {
  id: string;
  title: string;
  description: string | null;
  ticket_price: number;
  main_prize_secondary_image: string | null;
  main_image: string | null;
  banner_image: string | null;
  total_miocoin_bonus: number | null;
};

type BonusPrize = {
  id: string;
  contest_id: string;
  description: string | null;
  amount: number | null;
  image?: string | null;
  image_url?: string | null;
  ticket_position?: number | null;
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
  won_type?: "bonus" | "main" | null;
  bonus_prize_id?: string | null;
}

/* ================= COMPONENT ================= */

export default function ContestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);

  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  const [myWins, setMyWins] = useState<Winner[]>([]);
  const [balance, setBalance] = useState(0);
  const [computedMiocoinBonus, setComputedMiocoinBonus] = useState(0);

  const [processingContestId, setProcessingContestId] = useState<string | null>(null);
  const [modalResult, setModalResult] = useState<UnlockTicketResult | null>(null);
  const [modalContestId, setModalContestId] = useState<string | null>(null);

  /* ================= HELPERS ================= */

  async function loadUserBalance(userId: string) {
    const { data: wallet } = await supabase.from("wallets").select("balance_coins").eq("user_id", userId).maybeSingle();

    if (wallet?.balance_coins != null) {
      setBalance(wallet.balance_coins);
    }
  }

  /* ================= AUTH LISTENER ================= */

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUserBalance(session.user.id);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  /* ================= BUY TICKET ================= */

  async function handleUseMiocoins() {
    if (!user) {
      toast.error("Pro nákup tiketu se musíš přihlásit.");
      navigate("/login");
      return;
    }

    if (!contest) return;

    setProcessingContestId(contest.id);

    try {
      const { data, error } = await supabase.rpc("buy_ticket_atomic", {
        p_contest_id: contest.id,
        p_user_id: user.id,
      });

      if (error) {
        toast.error("Chyba při nákupu tiketu.");
        return;
      }

      if (data && typeof data === "object") {
        const result = data as UnlockTicketResult;

        setModalResult(result);
        setModalContestId(contest.id);

        await loadUserBalance(user.id);

        if (result.won_type === "main") {
          toast.success("Gratulujeme! Vyhrál jsi hlavní cenu!");
        } else if (result.won_type === "bonus") {
          toast.success("Gratulujeme! Vyhrál jsi bonusovou cenu!");
        } else {
          toast.success(`Tiket #${result.ticket_number} zakoupen!`);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Neočekávaná chyba.");
    } finally {
      setProcessingContestId(null);
    }
  }

  /* ================= LOAD DATA ================= */

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);

      const { data: contestData } = await supabase
        .from("contests")
        .select(
          "id, title, description, ticket_price, main_prize_secondary_image, main_image, banner_image, total_miocoin_bonus",
        )
        .eq("id", id)
        .maybeSingle();

      if (!contestData) {
        setLoading(false);
        return;
      }

      setContest(contestData as Contest);

      const { data: bonusData } = await supabase
        .from("bonus_prizes")
        .select("*")
        .eq("contest_id", id)
        .or("amount.is.null,amount.eq.0");

      setBonusPrizes((bonusData ?? []) as BonusPrize[]);

      /* 🔧 JEDINÁ LOGICKÁ ZMĚNA – SPRÁVNÝ SOUČET */
      const { data: miocoinSum } = await supabase.rpc("get_contest_miocoin_bonus", { p_contest_id: id });
      setComputedMiocoinBonus(miocoinSum ?? 0);

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

  /* ================= RENDER ================= */

  if (loading || !contest) {
    return (
      <div className="p-6">
        <Skeleton className="w-full h-[400px] rounded-2xl" />
      </div>
    );
  }

  const heroImage = contest.main_prize_secondary_image
    ? contest.main_prize_secondary_image.startsWith("http")
      ? contest.main_prize_secondary_image
      : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/contest-images/${contest.main_prize_secondary_image}`
    : contest.main_image
      ? contest.main_image.startsWith("http")
        ? contest.main_image
        : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/contest-images/${contest.main_image}`
      : "/fallback-car.png";

  const isProcessing = processingContestId === contest.id;

  return (
    <div className="p-4 md:p-6 w-full max-w-5xl mx-auto space-y-6">
      {/* HERO */}
      <section className="w-full rounded-2xl bg-[#0b0e12] p-6 border border-yellow-500/30">
        <h1 className="text-3xl font-extrabold text-yellow-400">{contest.title}</h1>
        {contest.description && <p className="text-gray-300 mt-2">{contest.description}</p>}
      </section>

      {/* INFO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="bg-[#111418] rounded-2xl p-5 border border-white/10">
          <p className="text-gray-400 text-sm">Tvůj stav MioCoinů</p>
          <p className="text-xl font-bold text-white">{balance.toLocaleString("cs-CZ")}</p>
          <Button onClick={handleUseMiocoins} disabled={isProcessing} className="mt-4 w-full">
            {isProcessing ? "Zpracovávám..." : `Uplatnit ${contest.ticket_price} MioCoin`}
          </Button>
        </section>

        <section className="bg-yellow-500/10 rounded-2xl p-5 border border-yellow-500/20">
          <p className="text-sm text-gray-200">
            Do této soutěže jsme navíc přidali{" "}
            <span className="text-yellow-400 font-bold">{computedMiocoinBonus.toLocaleString("cs-CZ")}</span> MioCoinů
            jako bonusové výhry.
          </p>
        </section>
      </div>

      <TicketResultModal
        isOpen={modalResult !== null}
        onClose={() => {
          setModalResult(null);
          setModalContestId(null);
        }}
        contestId={modalContestId || ""}
        result={modalResult ?? undefined}
      />
    </div>
  );
}
