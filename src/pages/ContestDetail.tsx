import { useParams, useNavigate, useLocation } from "react-router-dom";
import { buildLoginRedirectUrl } from "@/lib/loginRedirect";
import { useEffect, useState, useMemo, useCallback, memo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { MIOCOIN_IMAGE_URL } from "@/components/MioCoin";
import YouTubeEmbed from "@/components/YouTubeEmbed";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { recordLocalTicketPlay } from "@/lib/retentionLocal";
import {
  logRpcHttpFailure,
  logTicketPurchaseException,
  logTicketPurchaseRejected,
  logTicketPurchaseSuccess,
  recordTicketPurchaseAttemptForAbuseCheck,
} from "@/lib/monitoring";
import { analytics } from "@/lib/analytics";
import { buildBuyTicketAtomicRpcPayload } from "@/utils/buyTicketAtomicRpcArgs";
import { TicketResultModal } from "@/components/TicketResultModal";
import { BonusPrizeDetailModal } from "@/components/BonusPrizeDetailModal";
import { usePlacementBanners } from "@/hooks/usePlacementBanners";
import "@/components/ContestCard.css";
import { Helmet } from "react-helmet-async";

type Contest = {
  id: string;
  title: string;
  description: string | null;
  rules: string | null;
  rules_pdf_url: string | null;
  main_prize: string | null;
  ticket_price: number;
  status: string;
  main_prize_secondary_image: string | null;
  main_image: string | null;
  banner_image: string | null;
  fast_game?: boolean;
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

interface PartnerOfferResult {
  id: string;            // user_partner_offers.id
  title: string;
  short_text: string | null;
  logo_url: string | null;
  banner_url: string | null;
  link_or_code: string | null;
  valid_to: string | null;
  partner_name: string;
}

interface UnlockTicketResult {
  ticket_number: number;
  ticket_price: number;
  next_bonus_position?: number | null;
  distance_to_next_bonus?: number | null;
  won_prize?: string | null;
  remaining_tickets?: number;
  won_type?: 'bonus' | 'main' | null;
  bonus_prize_id?: string | null;
  partner_offer?: PartnerOfferResult | null;
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
              ? 'border-[hsl(32_100%_50%/0.6)] scale-110 shadow-[0_0_14px_rgba(255,138,0,0.35)]'
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
  const location = useLocation();
  const { user } = useAuth();

  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);

  const [bonusPrizes, setBonusPrizes] = useState<BonusPrize[]>([]);
  /** Sum of `bonus_prizes.amount` for coin rows (amount > 0); physical rows use null/0 amount */
  const [miocoinBonusPoolTotal, setMiocoinBonusPoolTotal] = useState(0);
  const [myWins, setMyWins] = useState<Winner[]>([]);
  const [balance, setBalance] = useState(0);
  const [balanceLoaded, setBalanceLoaded] = useState(false);

  const [processingContestId, setProcessingContestId] = useState<string | null>(null);
  const [modalResult, setModalResult] = useState<UnlockTicketResult | null>(null);
  const [modalContestId, setModalContestId] = useState<string | null>(null);
  const requestInFlightRef = useRef(false);
  const [selectedBonusPrize, setSelectedBonusPrize] = useState<BonusPrize | null>(null);
  const [galleryMedia, setGalleryMedia] = useState<{ id: string; contest_id: string; type: string; url: string; sort_order: number | null; created_at: string | null }[]>([]);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  
  const { banners: placementBanners } = usePlacementBanners(['vzhled_karta_vyher']);
  const starryBackgroundUrl = placementBanners.vzhled_karta_vyher?.image_url || null;

  // Realtime status for Live strip (local channel just for status indicator)
  const [realtimeStatus, setRealtimeStatus] = useState<string>('');
  const [lastWinnersEventAt, setLastWinnersEventAt] = useState<number | null>(null);
  const [, forceUpdate] = useState(0);
  const [progressTicketsTotal, setProgressTicketsTotal] = useState(1_000_000);

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

  // Tick the "last event ago" display every 5s
  useEffect(() => {
    if (lastWinnersEventAt === null) return;
    const timer = setInterval(() => forceUpdate((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, [lastWinnersEventAt]);

  // Local realtime channel for status indicator + event tracking (no toasts - handled globally)
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`winners-status-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'winners',
          filter: `contest_id=eq.${id}`,
        },
        () => {
          setLastWinnersEventAt(Date.now());
        }
      )
      .subscribe((status) => {
        setRealtimeStatus(status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  async function loadUserBalance(userId: string): Promise<number> {
    console.log('[DEBUG ContestDetail] loadUserBalance called with userId:', userId);
    try {
      const { data: wallet, error: walletError } = await supabase.from("wallets").select("balance_coins").eq("user_id", userId).maybeSingle();

      if (walletError) {
        console.error('[DEBUG ContestDetail] loadUserBalance wallet error:', walletError, JSON.stringify(walletError));
      }

      const n = wallet?.balance_coins ?? 0;
      console.log('[DEBUG ContestDetail] setBalance (wallet):', n);
      setBalance(n);
      setBalanceLoaded(true);
      return n;
    } catch (err) {
      console.error('[DEBUG ContestDetail] loadUserBalance CAUGHT:', err, JSON.stringify(err));
      setBalance(0);
      setBalanceLoaded(true);
      return 0;
    }
  }

  useEffect(() => {
    console.log('[DEBUG ContestDetail] Auth listener useEffect mounted');
    try {
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        console.log('[DEBUG ContestDetail] onAuthStateChange event:', _event, 'user:', session?.user?.id);
        if (session?.user) {
          loadUserBalance(session.user.id);
        } else {
          setBalance(0);
          setBalanceLoaded(false);
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

    // Strict single-request guard
    if (requestInFlightRef.current) {
      console.log('[DEBUG ContestDetail] Request already in flight, ignoring click');
      return;
    }

    if (!user) {
      toast.error("Pro nákup tiketu se musíš přihlásit.");
      navigate(buildLoginRedirectUrl(location.pathname + location.search));
      return;
    }

    if (!contest) return;

    if (contest.status !== 'active') {
      toast.error("Soutěž není aktivní");
      return;
    }

    let effectiveBalance: number;
    if (!balanceLoaded) {
      effectiveBalance = await loadUserBalance(user.id);
    } else {
      effectiveBalance = balance;
    }
    if (contest.status === 'active' && effectiveBalance < contest.ticket_price) {
      const shortage = Math.max(0, Math.ceil(contest.ticket_price - effectiveBalance));
      toast.error(`Chybí ti ${shortage.toLocaleString('cs-CZ')} MioCoinů`);
      return;
    }

    // Lock immediately
    requestInFlightRef.current = true;
    console.log('[DEBUG ContestDetail] setProcessingContestId:', contest.id);
    setProcessingContestId(contest.id);

    try {
      const built = buildBuyTicketAtomicRpcPayload(contest.id, user.id);
      if (!built.ok) {
        toast.error((built as { ok: false; message: string }).message);
        requestInFlightRef.current = false;
        setProcessingContestId(null);
        return;
      }
      const payload = built.payload;
      console.log("buy_ticket_atomic RPC payload", payload);

      recordTicketPurchaseAttemptForAbuseCheck(user.id);
      const { data, error } = await supabase.rpc("buy_ticket_atomic", payload);

      if (error) {
        console.error("[DEBUG ContestDetail] RPC error:", error, JSON.stringify(error));
        logRpcHttpFailure({
          userId: user.id,
          operation: "buy_ticket_atomic",
          message: error.message,
          code: error.code,
          details: (error as { details?: string }).details,
          hint: (error as { hint?: string }).hint,
        });
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

        logTicketPurchaseSuccess({
          userId: user.id,
          contestId: contest.id,
          ticketNumber: result.ticket_number,
        });
        analytics.ticketPurchase({ contestId: contest.id, ticketNumber: result.ticket_number });
        
        // Refresh balance and progress immediately
        loadUserBalance(user.id);
        const { data: prog } = await supabase
          .from("contest_progress")
          .select("tickets_total")
          .eq("contest_id", contest.id)
          .maybeSingle();
        if (prog) {
          setProgressTicketsTotal(prog.tickets_total ?? 1_000_000);
        }

        // ── Partner Offer lookup ──────────────────────────────────────────────
        // buy_ticket_atomic returns ticket_row_id (UUID of the new tickets row).
        // The DB trigger trg_assign_offer_on_ticket_insert runs synchronously in
        // the same transaction, so the offer (if any) is already committed here.
        let partnerOffer: PartnerOfferResult | null = null;
        const ticketRowId = (data as any)?.ticket_row_id as string | undefined;
        if (ticketRowId && user) {
          try {
            const { data: upoRow } = await supabase
              .from('user_partner_offers')
              .select(`
                id,
                partner_offers (
                  title, short_text, logo_url, banner_url, link_or_code, valid_to,
                  partners (company_name, name)
                )
              `)
              .eq('ticket_id', ticketRowId)
              .eq('user_id', user.id)
              .maybeSingle();
            if (upoRow?.partner_offers) {
              const po = upoRow.partner_offers as any;
              partnerOffer = {
                id: upoRow.id,
                title: po.title ?? '',
                short_text: po.short_text ?? null,
                logo_url: po.logo_url ?? null,
                banner_url: po.banner_url ?? null,
                link_or_code: po.link_or_code ?? null,
                valid_to: po.valid_to ?? null,
                partner_name: po.partners?.company_name || po.partners?.name || '',
              };
            }
          } catch (poErr) {
            console.warn('[ContestDetail] partner offer lookup skipped:', poErr);
          }
        }

        const mappedResult: UnlockTicketResult = {
          ticket_number: result.ticket_number,
          ticket_price: result.ticket_price ?? 1,
          next_bonus_position: result.next_bonus_position ?? null,
          distance_to_next_bonus: result.distance_to_next_bonus ?? null,
          won_prize: result.won_prize ?? null,
          won_type: result.won_type ?? null,
          bonus_prize_id: result.bonus_prize_id ?? null,
          remaining_tickets: result.remaining_tickets ?? 0,
          partner_offer: partnerOffer,
        };

        const isWin = result.won_type === 'main' || result.won_type === 'bonus';

        recordLocalTicketPlay();

        // Always show the ticket result modal (win or no-win) — user should
        // always see a reveal screen. Win celebration triggers inside the modal.
        setModalResult(mappedResult);
        setModalContestId(contest.id);

        if (isWin) {
          console.log('[DEBUG ContestDetail] WIN detected, modal opened');
          if (result.won_type === 'main') {
            toast.success("Gratulujeme! Vyhrál jsi hlavní cenu!");
          } else {
            toast.success("Gratulujeme! Vyhrál jsi bonusovou cenu!");
          }
        }
      }
    } catch (err) {
      console.error("[DEBUG ContestDetail] handleUseMiocoins CAUGHT:", err, JSON.stringify(err));
      if (user && contest) {
        logTicketPurchaseException({
          userId: user.id,
          contestId: contest.id,
          error: err,
        });
      }
      toast.error("Neočekávaná chyba při nákupu tiketu.");
    } finally {
      console.log('[DEBUG ContestDetail] setProcessingContestId: null (finally)');
      setProcessingContestId(null);
      requestInFlightRef.current = false;
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
          .select("id, title, description, rules, rules_pdf_url, main_prize, ticket_price, status, main_prize_secondary_image, main_image, banner_image, fast_game, total_miocoin_bonus")
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

        if (contestData.status === 'draft') {
          navigate('/games', { replace: true });
          return;
        }

        console.log('[DEBUG ContestDetail] setContest:', JSON.stringify(contestData));
        setContest(contestData as Contest);

        const { data: bonusData, error: bonusError } = await supabase
          .from("bonus_prizes")
          .select("*")
          .eq("contest_id", id)
          .or("amount.is.null,amount.eq.0")
          .order("ticket_position", { ascending: true });

        if (bonusError) {
          console.error('[DEBUG ContestDetail] bonus_prizes fetch error:', bonusError, JSON.stringify(bonusError));
        }

        const physicalPrizes = (bonusData ?? []) as BonusPrize[];
        console.log('[DEBUG ContestDetail] setBonusPrizes:', physicalPrizes.length, 'items');
        setBonusPrizes(physicalPrizes);
        setMiocoinBonusPoolTotal((contestData as any).total_miocoin_bonus ?? 0);

        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id ?? null;

        let nextMyWins: Winner[] = [];
        if (uid) {
          const { data: wins, error: winsError } = await supabase
            .from("winners")
            .select("id, prize_id")
            .eq("contest_id", id)
            .eq("user_id", uid);

          if (winsError) {
            console.error('[DEBUG ContestDetail] winners fetch error:', winsError, JSON.stringify(winsError));
          }

          nextMyWins = (wins ?? []).map((w) => ({
            id: w.id,
            prize: "",
            bonus_prize_id: w.prize_id ?? null,
          }));
        }

        console.log('[DEBUG ContestDetail] setMyWins:', nextMyWins.length, 'items');
        setMyWins(nextMyWins);

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

        const { data: prog } = await supabase
          .from("contest_progress")
          .select("tickets_total")
          .eq("contest_id", id)
          .maybeSingle();
        setProgressTicketsTotal(prog?.tickets_total ?? 1_000_000);
        console.log("galleryMedia", mediaData);

        console.log('[DEBUG ContestDetail] setLoading: false');
        setLoading(false);
      } catch (err) {
        console.error('[DEBUG ContestDetail] load() CAUGHT:', err, JSON.stringify(err));
        setLoading(false);
      }
    };

    load();
  }, [id, user?.id]);

  const stableResult = useMemo(() => {
    if (!modalResult) return undefined;
    return {
      ticket_number: modalResult.ticket_number,
      next_bonus_position: modalResult.next_bonus_position ?? 0,
      distance_to_next_bonus: modalResult.distance_to_next_bonus ?? 0,
      won_prize: modalResult.won_prize,
      remaining_tickets: modalResult.remaining_tickets,
      won_type: modalResult.won_type,
      bonus_prize_id: modalResult.bonus_prize_id,
      partner_offer: modalResult.partner_offer ?? null,
    };
  }, [
    modalResult?.ticket_number,
    modalResult?.next_bonus_position,
    modalResult?.distance_to_next_bonus,
    modalResult?.won_prize,
    modalResult?.remaining_tickets,
    modalResult?.won_type,
    modalResult?.bonus_prize_id,
    modalResult?.partner_offer,
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

  if (loading) {
    return (
      <div className="p-6">
        <Skeleton className="w-full h-[400px] rounded-2xl" />
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-16 text-center space-y-6">
          <h2 className="text-xl font-bold text-foreground">Soutěž nenalezena</h2>
          <p className="text-muted-foreground">Požadovaná soutěž neexistuje nebo byla odstraněna.</p>
          <Button onClick={() => navigate("/games")} variant="default">
            Zpět na soutěže
          </Button>
        </div>
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

  const insufficientFunds =
    Boolean(user) &&
    contest.status === 'active' &&
    balanceLoaded &&
    balance < contest.ticket_price;
  const shortageCoins = insufficientFunds
    ? Math.max(0, Math.ceil(contest.ticket_price - balance))
    : 0;

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

  const PRIMARY_DOMAIN = "https://onemil.cz";
  const canonicalUrl = `${PRIMARY_DOMAIN}/contest/${contest.id}`;
  const fallbackDescription =
    "OneMil je prémiová platforma spotřebitelských soutěží o exkluzivní a luxusní věcné ceny. Pro využití voucherů a účast ve spotřebitelských soutěžích slouží MioCoin jako interní digitální kredit.";
  const cleanDescription = (contest.description ?? "").replace(/\s+/g, " ").trim();
  const metaDescription =
    cleanDescription.length > 0 ? (cleanDescription.length > 170 ? `${cleanDescription.slice(0, 167)}…` : cleanDescription) : fallbackDescription;
  const metaTitle = `${contest.title} | OneMil`;
  const ogImage = heroImage?.startsWith("http") ? heroImage : `${PRIMARY_DOMAIN}/og-image.png`;

  return (
    <div className="relative min-h-screen">
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta name="robots" content="index,follow" />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="OneMil" />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={ogImage} />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDescription} />
        <meta name="twitter:image" content={ogImage} />
      </Helmet>
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
      <section className="contest-card-glow w-full rounded-[20px] relative overflow-hidden bg-gradient-to-br from-[hsl(220_25%_8%)] to-[hsl(220_20%_12%)] border-[3px] border-[hsl(32_100%_50%/0.6)]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 p-6 md:p-8">
          {/* Text content */}
          <div className="flex-1 space-y-4 z-10">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-yellow-400 leading-tight">
                {contest.title}
              </h1>
              {contest.fast_game && (
                <Badge className="bg-amber-500/80 text-white text-sm px-3 py-1">Fast game</Badge>
              )}
            </div>
            {contest.main_prize && (
              <p className="text-xl md:text-2xl font-semibold text-gray-200">
                Hlavní výhra: {contest.main_prize}
              </p>
            )}
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
            <span className="flex flex-col items-end ml-2">
              <span className={`text-[10px] leading-tight ${realtimeStatus === 'SUBSCRIBED' ? 'text-green-400/70' : 'text-red-400/70'}`}>
                {realtimeStatus === 'SUBSCRIBED' ? 'Live: připojeno' : 'Live: nepřipojeno'}
              </span>
              {lastWinnersEventAt !== null && (
                <span className="text-[9px] leading-tight text-gray-400/60">
                  Poslední live event: před {Math.max(1, Math.round((Date.now() - lastWinnersEventAt) / 1000))}&nbsp;s
                </span>
              )}
            </span>
          </div>
          <style>{`@keyframes liveShimmer { 0%,100% { background-position: -200% center; } 50% { background-position: 200% center; } }`}</style>
          {insufficientFunds && (
            <p className="text-xs text-amber-300/95 font-medium">
              Chybí ti {shortageCoins.toLocaleString('cs-CZ')} MioCoinů
            </p>
          )}
          <div className="flex flex-col sm:flex-row items-stretch gap-3 mt-auto">
            {insufficientFunds ? (
              <Button
                onClick={() =>
                  navigate('/profile', {
                    state: { paymentReturnTo: `/contest/${contest.id}` },
                  })
                }
                variant="premium"
                className="flex-1 h-11 font-semibold px-5 rounded-full whitespace-nowrap"
              >
                Dobít MioCoiny
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleUseMiocoins}
                  disabled={isProcessing}
                  variant="premium"
                  className="flex-1 h-11 font-semibold px-5 rounded-full whitespace-nowrap"
                >
                  {isProcessing ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      Losujeme…
                    </span>
                  ) : `Uplatnit ${contest.ticket_price} MioCoin`}
                </Button>
                <Button
                  onClick={() =>
                    navigate('/profile', {
                      state: { paymentReturnTo: `/contest/${contest.id}` },
                    })
                  }
                  variant="outline"
                  className="flex-1 h-11 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border-yellow-500/30 font-semibold px-5 rounded-full transition-colors"
                >
                  Dobít MioCoiny
                </Button>
              </>
            )}
          </div>
        </section>

        {/* Box 2: Bonusové MioCoiny v soutěži */}
        <section className="voucher-card-glow bg-gradient-to-br from-[hsl(45_60%_50%/0.1)] to-[hsl(45_60%_40%/0.05)] rounded-[20px] p-5 border-[2px] border-[hsl(40_60%_50%/0.3)] flex items-center gap-4 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="flex-1 flex flex-col justify-center">
            <p className="text-sm text-gray-200 leading-relaxed">
              Do této soutěže jsme navíc přidali{" "}
              <span className="text-yellow-400 font-bold text-2xl md:text-3xl">{miocoinBonusPoolTotal.toLocaleString("cs-CZ")}</span>{" "}
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
        <p className="text-yellow-400/90 font-medium text-sm md:text-base mb-2">
          Celkem {progressTicketsTotal.toLocaleString("cs-CZ")} ticketů
        </p>

        {/* Progress bar — static fill (no sold/total ratio) */}
        <div
          className="w-full h-2.5 rounded-full overflow-hidden bg-white/10"
          style={{ boxShadow: '0 0 20px rgba(250, 204, 21, 0.2)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: "100%",
              background: 'linear-gradient(to right, #FF8A00, #FFB547)',
              boxShadow: '0 0 20px rgba(255, 138, 0, 0.4)'
            }}
          />
        </div>
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

      {/* CONTEST RULES */}
      {(contest.rules_pdf_url || (contest.rules && contest.rules.trim())) && (
        <section className="relative z-10 px-4 py-12 max-w-4xl mx-auto">
          <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm p-6 md:p-8">
            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-heading-gold">
              Pravidla soutěže
            </h2>
            {contest.rules_pdf_url && (
              <a
                href={contest.rules_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 px-5 py-2.5 text-sm font-semibold text-black shadow-lg hover:from-amber-400 hover:to-yellow-300 transition mb-4"
              >
                📄 Stáhnout pravidla soutěže
              </a>
            )}
            {contest.rules && contest.rules.trim() && (
              <div className="text-white/80 whitespace-pre-wrap leading-relaxed">
                {contest.rules}
              </div>
            )}
          </div>
        </section>
      )}

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
