import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo, useCallback, memo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { MIOCOIN_IMAGE_URL } from "@/components/MioCoin";
import YouTubeEmbed from "@/components/YouTubeEmbed";
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

// Memoized thumbnail strip to avoid re-renders on gallery index change
type GalleryMediaItem = { id: string; type: string; url: string; sort_order: number | null };
const GalleryThumbnails = memo(({ items, activeIndex, onSelect, getYouTubeId, getMediaUrl }: {
  items: GalleryMediaItem[];
  activeIndex: number;
  onSelect: (idx: number) => void;
  getYouTubeId: (url: string) => string | null;
  getMediaUrl: (url: string) => string;
}) => (
  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide justify-center">
    {items.map((m, idx) => {
      const isVideo = m.type === 'video';
      const thumbUrl = isVideo
        ? `https://img.youtube.com/vi/${getYouTubeId(m.url) ?? ''}/mqdefault.jpg`
        : getMediaUrl(m.url);
      return (
        <button
          key={m.id}
          type="button"
          onClick={() => onSelect(idx)}
          className={`flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all duration-300 ${
            idx === activeIndex
              ? 'border-[hsl(40_75%_55%)] scale-110 shadow-[0_0_14px_rgba(250,204,21,0.35)]'
              : 'border-white/10 opacity-60 hover:opacity-90 hover:scale-105'
          }`}
        >
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
        </button>
      );
    })}
  </div>
));
GalleryThumbnails.displayName = 'GalleryThumbnails';

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
  const [galleryMedia, setGalleryMedia] = useState<{ id: string; contest_id: string; type: string; url: string; sort_order: number | null; created_at: string | null }[]>([]);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  
  const { banners: placementBanners } = usePlacementBanners(['vzhled_karta_vyher']);
  const starryBackgroundUrl = placementBanners.vzhled_karta_vyher?.image_url || null;

  // Live activity rotating messages
  const LIVE_MESSAGES = [
    'Soutěž je aktivní',
    'Bonusové výhry mohou padnout kdykoliv',
    'Každý ticket může rozhodnout',
    'Hraj a vyhraj',
    'Šance na výhru s každým tiketem',
  ];
  const [liveMessageIndex, setLiveMessageIndex] = useState(0);
  const [liveVisible, setLiveVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveVisible(false);
      setTimeout(() => {
        setLiveMessageIndex((prev) => (prev + 1) % LIVE_MESSAGES.length);
        setLiveVisible(true);
      }, 400);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Realtime winner toast with rate limiting
  const lastWinnerToastRef = useRef(0);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`winners-live-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'winners',
          filter: `contest_id=eq.${id}`,
        },
        (payload) => {
          const newRow = payload.new as Record<string, unknown>;
          // Safely parse with fallbacks for varying schema shapes
          const winType = (newRow.type ?? newRow.winner_type ?? newRow.prize_type ?? newRow.win_type) as string | undefined;
          const winnerUserId = (newRow.user_id ?? newRow.winner_user_id ?? newRow.profile_id) as string | undefined;
          // Only show for bonus/main wins by OTHER users
          if (!winType || !['bonus', 'main'].includes(winType)) return;
          if (user?.id && winnerUserId === user.id) return;

          const now = Date.now();
          if (now - lastWinnerToastRef.current < 120_000) return; // 120s rate limit
          lastWinnerToastRef.current = now;

          const msg = newRow.type === 'main'
            ? '🏆 Padla hlavní výhra!'
            : '🎁 Padla bonusová výhra!';
          toast(msg, { duration: 5000 });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, user?.id]);

  async function loadUserBalance(userId: string) {
    console.log('[DEBUG ContestDetail] loadUserBalance called with userId:', userId);
    try {
      const { data: wallet, error: walletError } = await supabase.from("wallets").select("balance_coins").eq("user_id", userId).maybeSingle();

      if (walletError) {
        console.error('[DEBUG ContestDetail] loadUserBalance wallet error:', walletError, JSON.stringify(walletError));
      }

      if (wallet?.balance_coins != null) {
        console.log('[DEBUG ContestDetail] setBalance (wallet):', wallet.balance_coins);
        setBalance(wallet.balance_coins);
        return;
      }

      const { data: profile, error: profileError } = await supabase.from("profiles").select("miocoin_balance").eq("id", userId).maybeSingle();

      if (profileError) {
        console.error('[DEBUG ContestDetail] loadUserBalance profile error:', profileError, JSON.stringify(profileError));
      }

      if (profile?.miocoin_balance != null) {
        console.log('[DEBUG ContestDetail] setBalance (profile):', profile.miocoin_balance);
        setBalance(profile.miocoin_balance);
      }
    } catch (err) {
      console.error('[DEBUG ContestDetail] loadUserBalance CAUGHT:', err, JSON.stringify(err));
    }
  }

  useEffect(() => {
    console.log('[DEBUG ContestDetail] Auth listener useEffect mounted');
    try {
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        console.log('[DEBUG ContestDetail] onAuthStateChange event:', _event, 'user:', session?.user?.id);
        if (session?.user) {
          loadUserBalance(session.user.id);
        }
      });

      return () => {
        console.log('[DEBUG ContestDetail] Auth listener cleanup');
        listener.subscription.unsubscribe();
      };
    } catch (err) {
      console.error('[DEBUG ContestDetail] Auth listener useEffect CAUGHT:', err, JSON.stringify(err));
    }
  }, []);

  async function handleUseMiocoins() {
    console.log('[DEBUG ContestDetail] handleUseMiocoins called, user:', user?.id, 'contest:', contest?.id);
    if (!user) {
      toast.error("Pro nákup tiketu se musíš přihlásit.");
      navigate("/login");
      return;
    }

    if (!contest) return;

    console.log('[DEBUG ContestDetail] setProcessingContestId:', contest.id);
    setProcessingContestId(contest.id);

    try {
      const { data, error } = await supabase.rpc('buy_ticket_atomic', {
        p_contest_id: contest.id,
        p_user_id: user.id
      });

      if (error) {
        console.error("[DEBUG ContestDetail] RPC error:", error, JSON.stringify(error));
        if (error.message?.includes("closed") || error.message?.includes("uzavřena")) {
          toast.error("Soutěž je již uzavřena.");
        } else if (error.message?.includes("insufficient") || error.message?.includes("nedostatek")) {
          toast.error("Nedostatek MioCoinů. Dobi si kredit.");
        } else if (error.message?.includes("full") || error.message?.includes("plná")) {
          toast.error("Soutěž je již plná.");
        } else {
          toast.error("Chyba při nákupu tiketu.");
        }
        console.log('[DEBUG ContestDetail] setProcessingContestId: null (error)');
        setProcessingContestId(null);
        return;
      }

      if (data && typeof data === 'object') {
        const result = data as { success?: boolean; error?: string } & UnlockTicketResult;
        
        if (result.success === false || result.error) {
          const errorMsg = result.error || "Chyba při nákupu tiketu.";
          console.error('[DEBUG ContestDetail] RPC result error:', errorMsg);
          if (errorMsg.includes("closed") || errorMsg.includes("uzavřena")) {
            toast.error("Soutěž je již uzavřena.");
          } else if (errorMsg.includes("insufficient") || errorMsg.includes("nedostatek")) {
            toast.error("Nedostatek MioCoinů. Dobi si kredit.");
          } else if (errorMsg.includes("full") || errorMsg.includes("plná")) {
            toast.error("Soutěž je již plná.");
          } else {
            toast.error(errorMsg);
          }
          console.log('[DEBUG ContestDetail] setProcessingContestId: null (result error)');
          setProcessingContestId(null);
          return;
        }

        console.log('🔥 RPC raw response:', JSON.stringify(result, null, 2));
        
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
        
        console.log('[DEBUG ContestDetail] setModalResult:', JSON.stringify(mappedResult));
        setModalResult(mappedResult);
        console.log('[DEBUG ContestDetail] setModalContestId:', contest.id);
        setModalContestId(contest.id);

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
      console.error("[DEBUG ContestDetail] handleUseMiocoins CAUGHT:", err, JSON.stringify(err));
      toast.error("Neočekávaná chyba při nákupu tiketu.");
    } finally {
      console.log('[DEBUG ContestDetail] setProcessingContestId: null (finally)');
      setProcessingContestId(null);
    }
  }

  useEffect(() => {
    const load = async () => {
      console.log('[DEBUG ContestDetail] load() called, id:', id);
      if (!id) return;
      console.log('[DEBUG ContestDetail] setLoading: true');
      setLoading(true);

      try {
        const { data: contestData, error: contestError } = await supabase
          .from("contests")
          .select("id, title, description, ticket_price, main_prize_secondary_image, main_image, banner_image, total_miocoin_bonus")
          .eq("id", id)
          .maybeSingle();

        if (contestError) {
          console.error('[DEBUG ContestDetail] contest fetch error:', contestError, JSON.stringify(contestError));
        }

        if (!contestData) {
          console.log('[DEBUG ContestDetail] No contest found, setLoading: false');
          setLoading(false);
          return;
        }

        console.log('[DEBUG ContestDetail] setContest:', JSON.stringify(contestData));
        setContest(contestData as Contest);

        const { data: bonusData, error: bonusError } = await supabase
          .from("bonus_prizes")
          .select("*")
          .eq("contest_id", id)
          .or("amount.is.null,amount.eq.0");

        if (bonusError) {
          console.error('[DEBUG ContestDetail] bonus_prizes fetch error:', bonusError, JSON.stringify(bonusError));
        }

        console.log('[DEBUG ContestDetail] setBonusPrizes:', bonusData?.length, 'items');
        setBonusPrizes((bonusData ?? []) as BonusPrize[]);

        const { data: wins, error: winsError } = await supabase.from("winners").select("*").eq("contest_id", id);

        if (winsError) {
          console.error('[DEBUG ContestDetail] winners fetch error:', winsError, JSON.stringify(winsError));
        }

        console.log('[DEBUG ContestDetail] setMyWins:', wins?.length, 'items');
        setMyWins((wins ?? []) as Winner[]);

        const { data: auth } = await supabase.auth.getUser();
        if (auth?.user) {
          console.log('[DEBUG ContestDetail] Loading balance for auth user:', auth.user.id);
          loadUserBalance(auth.user.id);
        }

        const { data: mediaData, error: mediaError } = await supabase
          .from("contest_media")
          .select("*")
          .eq("contest_id", id)
          .order("sort_order", { ascending: true });

        if (mediaError) {
          console.error('[DEBUG ContestDetail] contest_media fetch error:', mediaError, JSON.stringify(mediaError));
        }

        console.log('[DEBUG ContestDetail] setGalleryMedia:', mediaData?.length, 'items');
        setGalleryMedia(mediaData ?? []);
        console.log("galleryMedia", mediaData);

        console.log('[DEBUG ContestDetail] setLoading: false');
        setLoading(false);
      } catch (err) {
        console.error('[DEBUG ContestDetail] load() CAUGHT:', err, JSON.stringify(err));
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const stableResult = useMemo(() => {
    if (!modalResult) return undefined;
    return {
      ticket_number: modalResult.ticket_number,
      next_bonus_position: modalResult.next_bonus_position ?? 0,
      distance_to_next_bonus: modalResult.distance_to_next_bonus ?? 0,
      won_prize: modalResult.won_prize,
      remaining_tickets: modalResult.remaining_tickets,
      won_type: modalResult.won_type,
      bonus_prize_id: modalResult.bonus_prize_id
    };
  }, [
    modalResult?.ticket_number,
    modalResult?.next_bonus_position,
    modalResult?.distance_to_next_bonus,
    modalResult?.won_prize,
    modalResult?.remaining_tickets,
    modalResult?.won_type,
    modalResult?.bonus_prize_id
  ]);

  const getYouTubeId = useCallback((url: string) => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&\n?#]+)/);
    return match?.[1] ?? null;
  }, []);

  const getMediaUrl = useCallback((url: string) => {
    return url.startsWith('http') ? url : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/contest-images/${url}`;
  }, []);

  const displayGallery = useMemo(() => galleryMedia.filter((m) => m.type !== 'background'), [galleryMedia]);
  const activeMedia = useMemo(() => displayGallery[activeGalleryIndex] ?? null, [displayGallery, activeGalleryIndex]);

  if (loading || !contest) {
    return (
      <div className="p-6">
        <Skeleton className="w-full h-[400px] rounded-2xl" />
      </div>
    );
  }

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

  const backgroundMedia = galleryMedia.find((m) => m.type === 'background');
  const bgImageUrl = backgroundMedia
    ? (backgroundMedia.url.startsWith('http')
        ? backgroundMedia.url
        : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/contest-images/${backgroundMedia.url}`)
    : (contest.main_prize_secondary_image
      ? (contest.main_prize_secondary_image.startsWith('http')
        ? contest.main_prize_secondary_image
        : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/contest-images/${contest.main_prize_secondary_image}`)
      : null);

  return (
    <div className="relative min-h-screen">
      {/* Cinematic background - Image */}
      {bgImageUrl && (
        <div
          className="fixed inset-0 z-0"
          style={{
            backgroundImage: `url(${bgImageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />
      )}
      {/* Dark gradient overlay */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.75) 50%, rgba(0,0,0,0.92) 100%)',
        }}
      />
      <div 
        className="relative z-10 p-4 md:p-6 w-full max-w-5xl mx-auto space-y-6 pb-28"
        style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom, 0px))' }}
      >



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

      {/* GALLERY SECTION */}
      {displayGallery.length > 0 && (
        <section className="voucher-card-glow max-w-4xl mx-auto bg-[hsl(220_25%_8%)]/60 backdrop-blur rounded-xl p-3 md:p-4 border-[2px] border-[hsl(40_50%_45%/0.3)] space-y-3 animate-fade-in">
          {/* Main display – 16:9 capped with premium transitions */}
          <div className="relative aspect-video max-h-[420px] rounded-xl overflow-hidden bg-black/40 mx-auto">
            {activeMedia && (
              activeMedia.type === 'video' ? (
                <div
                  key={`video-${activeMedia.id}`}
                  className="absolute inset-0"
                  style={{
                    animation: 'galleryFadeSlide 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
                  }}
                >
                  <YouTubeEmbed url={activeMedia.url} className="absolute inset-0" />
                </div>
              ) : (
                <img
                  key={`img-${activeMedia.id}`}
                  src={getMediaUrl(activeMedia.url)}
                  alt="Gallery"
                  className="w-full h-full object-contain"
                  style={{
                    animation: 'galleryFadeSlide 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
                  }}
                />
              )
            )}
          </div>

          {/* Memoized thumbnail strip */}
          {displayGallery.length > 1 && (
            <GalleryThumbnails
              items={displayGallery}
              activeIndex={activeGalleryIndex}
              onSelect={setActiveGalleryIndex}
              getYouTubeId={getYouTubeId}
              getMediaUrl={getMediaUrl}
            />
          )}
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Box 1: Stav MioCoinů + akce */}
        <section className="voucher-card-glow bg-[hsl(220_25%_8%)]/80 backdrop-blur rounded-[20px] p-5 border-[2px] border-[hsl(40_50%_45%/0.5)] flex flex-col gap-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center h-full gap-4">
            <img
              src={MIOCOIN_IMAGE_URL}
              className="h-[70%] max-h-20 md:max-h-24 w-auto object-contain flex-shrink-0 drop-shadow-[0_0_16px_rgba(234,179,8,0.3)]"
              alt="MioCoin"
            />
            <div className="flex-1 flex flex-col justify-center">
              <p className="text-xs text-gray-400">Tvůj stav MioCoinů</p>
              <p className="text-4xl md:text-5xl font-extrabold text-white leading-none mt-1">{balance.toLocaleString("cs-CZ", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}</p>
            </div>
          </div>
          {/* Live activity strip */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 w-fit">
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="relative inline-flex flex-col overflow-hidden">
              <span
                className="text-xs text-gray-300 font-medium transition-all duration-[350ms] ease-out"
                style={{
                  opacity: liveVisible ? 1 : 0,
                  transform: liveVisible ? 'translateY(0)' : 'translateY(-14px)',
                }}
              >
                {LIVE_MESSAGES[liveMessageIndex]}
              </span>
              {/* Gold shimmer underline */}
              <span
                className="h-[1px] w-full mt-0.5"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, hsl(45,80%,55%) 50%, transparent 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'liveShimmer 8s ease-in-out infinite',
                }}
              />
            </span>
          </div>
          <style>{`@keyframes liveShimmer { 0%,100% { background-position: -200% center; } 50% { background-position: 200% center; } }`}</style>
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
        <section className="voucher-card-glow bg-gradient-to-br from-[hsl(45_60%_50%/0.1)] to-[hsl(45_60%_40%/0.05)] rounded-[20px] p-5 border-[2px] border-[hsl(40_60%_50%/0.3)] flex items-center gap-4 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="flex-1 flex flex-col justify-center">
            <p className="text-sm text-gray-200 leading-relaxed">
              Do této soutěže jsme navíc přidali{" "}
              <span className="text-yellow-400 font-bold text-2xl md:text-3xl">{(contest.total_miocoin_bonus ?? 0).toLocaleString("cs-CZ")}</span>{" "}
              MioCoinů jako bonusové výhry, které můžete během soutěže získat.
            </p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <img
                  src={MIOCOIN_IMAGE_URL}
                  className="h-[70%] max-h-20 md:max-h-24 w-auto object-contain flex-shrink-0 hover:scale-110 transition-transform cursor-pointer drop-shadow-[0_0_24px_rgba(234,179,8,0.4)]"
                  alt="MioCoin"
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>MioCoiny můžeš vyhrát při nákupu tiketů</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
                  onClick={() => {
                    console.log('[DEBUG ContestDetail] setSelectedBonusPrize:', b.id);
                    setSelectedBonusPrize({ ...b, image_url: bonusImageUrl });
                  }}
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
        onClose={() => {
          console.log('[DEBUG ContestDetail] setSelectedBonusPrize: null');
          setSelectedBonusPrize(null);
        }}
        prize={selectedBonusPrize}
        backgroundImageUrl={starryBackgroundUrl}
      />
      {/* TICKET RESULT MODAL */}
      <TicketResultModal
        isOpen={modalResult !== null}
        onClose={() => {
          console.log('[DEBUG ContestDetail] setModalResult: null, setModalContestId: null');
          setModalResult(null);
          setModalContestId(null);
        }}
        contestId={modalContestId || ""}
        result={stableResult}
      />
      </div>
    </div>
  );
}
