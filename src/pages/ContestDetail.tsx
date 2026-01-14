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
import { BonusPrizeDetailModal } from "@/components/BonusPrizeDetailModal";
import { usePlacementBanners } from "@/hooks/usePlacementBanners";
import "@/components/ContestCard.css";

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
  detailed_description?: string | null;
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
  const [myWins, setMyWins] = useState<Winner[]>([]);
  const [balance, setBalance] = useState(0);

  const [processingContestId, setProcessingContestId] = useState<string | null>(null);
  const [modalResult, setModalResult] = useState<UnlockTicketResult | null>(null);
  const [modalContestId, setModalContestId] = useState<string | null>(null);
  const [selectedBonusPrize, setSelectedBonusPrize] = useState<BonusPrize | null>(null);
  
  // Fetch the starry background banner used in "Poslední výherci"
  const { banners: placementBanners } = usePlacementBanners(['vzhled_karta_vyher']);
  const starryBackgroundUrl = placementBanners.vzhled_karta_vyher?.image_url || null;

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

        console.log('🔥 RPC raw response:', JSON.stringify(result, null, 2));
        
        // Map with nullish coalescing for proper win detection
        const mappedResult: UnlockTicketResult = {
          ticket_number: result.ticket_number,
          ticket_price: result.ticket_price ?? 1,
          next_bonus_position: result.next_bonus_position ?? null,
          distance_to_next_bonus: result.distance_to_next_bonus ?? null,
          won_prize: result.won_prize ?? null,
          won_type: result.won_type ?? null,
          bonus_prize_id: result.bonus_prize_id ?? null,
          remaining_tickets: result.remaining_tickets ?? 0
        };
        
        // Success - show modal
        setModalResult(mappedResult);
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

      const { data: contestData } = await supabase
        .from("contests")
        .select("id, title, description, ticket_price, main_prize_secondary_image, main_image, banner_image, total_miocoin_bonus")
        .eq("id", id)
        .maybeSingle();

      if (!contestData) {
        setLoading(false);
        return;
      }

      setContest(contestData as Contest);

      // Load only physical bonus prizes (amount is null or 0)
      const { data: bonusData } = await supabase
        .from("bonus_prizes")
        .select("*")
        .eq("contest_id", id)
        .or("amount.is.null,amount.eq.0");

      setBonusPrizes((bonusData ?? []) as BonusPrize[]);

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

  // Hero image: prefer main_prize_secondary_image (AI-generated), fallback to main_image
  const heroImage = contest.main_prize_secondary_image 
    ? (contest.main_prize_secondary_image.startsWith('http') 
        ? contest.main_prize_secondary_image 
        : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/contest-images/${contest.main_prize_secondary_image}`)
    : (contest.main_image 
        ? (contest.main_image.startsWith('http') 
            ? contest.main_image 
            : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/contest-images/${contest.main_image}`)
        : "/fallback-car.png");
  
  const isProcessing = processingContestId === contest.id;

  return (
    <div className="p-4 md:p-6 w-full max-w-5xl mx-auto space-y-6">
      {/* 1. HERO SECTION */}
      <section className="contest-card-glow w-full rounded-[20px] relative overflow-hidden bg-gradient-to-br from-[hsl(220_25%_8%)] to-[hsl(220_20%_12%)] border-[3px] border-[hsl(40_75%_55%)]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 p-6 md:p-8">
          {/* Text content */}
          <div className="flex-1 space-y-4 z-10">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-yellow-400 leading-tight">
              {contest.title}
            </h1>
            {contest.description && (
              <p className="text-gray-300 text-sm md:text-base leading-relaxed whitespace-pre-line max-w-lg">
                {contest.description}
              </p>
            )}
          </div>
          
          {/* Hero image */}
          <div className="flex-shrink-0 flex justify-center md:justify-end">
            <img
              src={heroImage}
              alt={contest.title}
              className="w-full max-w-[280px] md:max-w-[320px] lg:max-w-[380px] object-contain"
              onError={(e) => (e.currentTarget.src = "/fallback-car.png")}
            />
          </div>
        </div>
      </section>

      {/* 2. INFO BOXES - Side by side on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Box 1: Stav MioCoinů + akce */}
        <section className="voucher-card-glow bg-[hsl(220_25%_8%)]/80 backdrop-blur rounded-[20px] p-5 border-[2px] border-[hsl(40_50%_45%/0.5)] flex flex-col gap-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-3">
            <img src={MIOCOIN_IMAGE_URL} className="w-7 h-7" alt="MioCoin" />
            <div>
              <p className="text-xs text-gray-400">Tvůj stav MioCoinů</p>
              <p className="text-xl font-bold text-white">{balance.toLocaleString("cs-CZ")}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch gap-3 mt-auto">
            <Button
              onClick={handleUseMiocoins}
              disabled={isProcessing}
              variant="premium"
              className="flex-1 h-11 font-semibold px-5 rounded-full whitespace-nowrap"
            >
              {isProcessing ? "Zpracovávám..." : `Uplatnit ${contest.ticket_price} MioCoin`}
            </Button>
            <Button
              onClick={() => navigate("/profile")}
              variant="outline"
              className="flex-1 h-11 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border-yellow-500/30 font-semibold px-5 rounded-full transition-colors"
            >
              Dobít MioCoiny
            </Button>
          </div>
        </section>

        {/* Box 2: Bonusové MioCoiny v soutěži */}
        <section className="voucher-card-glow bg-gradient-to-br from-[hsl(45_60%_50%/0.1)] to-[hsl(45_60%_40%/0.05)] rounded-[20px] p-5 border-[2px] border-[hsl(40_60%_50%/0.3)] flex items-start gap-4 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="flex-shrink-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <img 
                    src={MIOCOIN_IMAGE_URL} 
                    className="w-10 h-10 hover:scale-110 transition-transform cursor-pointer" 
                    alt="MioCoin" 
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>MioCoiny můžeš vyhrát při nákupu tiketů</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-sm text-gray-200 leading-relaxed">
            Do této soutěže jsme navíc přidali{" "}
            <span className="text-yellow-400 font-bold">{(contest.total_miocoin_bonus ?? 0).toLocaleString("cs-CZ")}</span>{" "}
            MioCoinů jako bonusové výhry, které můžete během soutěže získat.
          </p>
        </section>
      </div>

      {/* 4. CESTA K HLAVNÍ VÝHŘE */}
      <section className="voucher-card-glow bg-[hsl(220_25%_8%)]/60 rounded-[20px] p-4 md:p-5 border-[2px] border-[hsl(40_60%_50%/0.2)]">
        <h2 className="text-white font-semibold text-sm md:text-base mb-4">Cesta k hlavní výhře</h2>
        
        {/* Milestone labels */}
        <div className="flex justify-between mb-2 px-0.5 overflow-x-auto">
          {['0', '10k', '50k', '100k', '250k', '500k', '750k', '1M'].map((label) => (
            <div key={label} className="flex flex-col items-center min-w-[30px]">
              <span className="text-[10px] md:text-xs text-yellow-400/70 font-medium">{label}</span>
              <div className="w-px h-1.5 bg-yellow-400/40 mt-0.5" />
            </div>
          ))}
        </div>
        
        {/* Progress bar */}
        <div 
          className="w-full h-2.5 rounded-full"
          style={{
            background: 'linear-gradient(to right, #f6e27a, #d4a017)',
            boxShadow: '0 0 20px rgba(250, 204, 21, 0.4)'
          }}
        />
      </section>

      {/* 5. BONUSOVÉ VĚCNÉ VÝHRY */}
      <section className="voucher-card-glow bg-[hsl(220_25%_8%)]/60 rounded-[20px] p-4 md:p-5 border-[2px] border-[hsl(40_50%_45%/0.3)]">
        <h2 className="text-white font-semibold text-sm md:text-base mb-4">Bonusové věcné výhry</h2>

        {bonusPrizes.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">Zatím nebyly přidány žádné věcné bonusové výhry.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bonusPrizes.map((b) => {
              let bonusImageUrl: string | null = null;
              
              if (b.image) {
                bonusImageUrl = b.image.startsWith('http') 
                  ? b.image 
                  : supabase.storage.from('contest-images').getPublicUrl(b.image).data.publicUrl;
              } else if (b.image_url) {
                bonusImageUrl = b.image_url.startsWith('http') 
                  ? b.image_url 
                  : supabase.storage.from('contest-images').getPublicUrl(b.image_url).data.publicUrl;
              }
              
              return (
                <button 
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBonusPrize({ ...b, image_url: bonusImageUrl })}
                  className="p-3 rounded-xl border border-white/5 hover:border-yellow-500/30 transition-colors text-left cursor-pointer relative overflow-hidden"
                  style={{
                    backgroundImage: starryBackgroundUrl ? `url(${starryBackgroundUrl})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundColor: starryBackgroundUrl ? undefined : 'rgba(0,0,0,0.3)'
                  }}
                >
                  {bonusImageUrl && (
                    <div className="aspect-[4/3] mb-2 rounded-lg overflow-hidden bg-black/20">
                      <img
                        src={bonusImageUrl}
                        alt={b.description ?? "Bonus prize"}
                        className="w-full h-full object-contain"
                        onError={(e) => (e.currentTarget.style.display = "none")}
                      />
                    </div>
                  )}
                  <p className="text-white text-sm font-medium">{b.description || "Bonusová výhra"}</p>
                  {myWins.some((w) => w.bonus_prize_id === b.id) && (
                    <span className="inline-block mt-2 text-green-400 text-xs bg-green-500/10 px-2 py-0.5 rounded">
                      Moje výhra
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* BONUS PRIZE DETAIL MODAL */}
      <BonusPrizeDetailModal
        isOpen={selectedBonusPrize !== null}
        onClose={() => setSelectedBonusPrize(null)}
        prize={selectedBonusPrize}
        backgroundImageUrl={starryBackgroundUrl}
      />
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
