import { useParams, useNavigate, useLocation } from "react-router-dom";
import { buildLoginRedirectUrl } from "@/lib/loginRedirect";
import { useEffect, useState, useMemo, useCallback, memo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import YouTubeEmbed from "@/components/YouTubeEmbed";
import { toast } from "sonner";
import { recordLocalTicketPlay } from "@/lib/retentionLocal";
import {
  logTicketPurchaseException,
  logTicketPurchaseRejected,
  logTicketPurchaseSuccess,
} from "@/lib/monitoring";
import { analytics } from "@/lib/analytics";
import { TicketResultModal } from "@/components/TicketResultModal";
import { useLatestWinners } from "@/hooks/useLatestWinners";
import {
  MysteryPurchaseResultDialog,
  type MysteryTicketOutcome,
} from "@/components/MysteryPurchaseResultDialog";
import {
  mysteryErrorMessage,
  purchaseMysteryCoupon,
  type MysteryCoupon,
} from "@/lib/mysteryCouponPurchase";
import { BonusPrizeDetailModal } from "@/components/BonusPrizeDetailModal";
import { usePlacementBanners } from "@/hooks/usePlacementBanners";
import { isNativeApp } from "@/lib/nativeApp";
import "@/components/ContestCard.css";
import { Helmet } from "react-helmet-async";
import { usePartners } from "@/hooks/usePartners";
import { OneMilCartIcon, OneMilMioCoinIcon, OneMilTicketIcon } from "@/components/icons/OneMilIcons";
import onemilEmblem from "@/assets/redesign/onemil-emblem.png";

/** Stoupající zlaté částice v rámečku hlavní výhry (jen vzhled, deska 5). */
const CD_RISE = [
  { left: '12%', size: 4, dur: '7s', delay: '-1s', dx: '-18px' },
  { left: '45%', size: 3, dur: '6s', delay: '-2.7s', dx: '0px' },
  { left: '78%', size: 6, dur: '11s', delay: '-4.4s', dx: '18px' },
  { left: '22%', size: 5, dur: '10s', delay: '-6.1s', dx: '-18px' },
  { left: '55%', size: 4, dur: '9s', delay: '-7.8s', dx: '0px' },
  { left: '88%', size: 3, dur: '8s', delay: '-1.5s', dx: '18px' },
  { left: '31%', size: 6, dur: '7s', delay: '-4.2s', dx: '-18px' },
  { left: '65%', size: 5, dur: '6s', delay: '-0.9s', dx: '0px' },
];

/** Šířky proužků dekorativního čárového kódu na kartě tiketu (jen vzhled). */
const CD_BARCODE = [3, 1, 2, 1, 4, 1, 1, 3, 2, 1, 1, 2, 4, 1, 2, 1, 3, 1, 1, 2, 1, 4, 2, 1, 1, 3, 1, 2, 1, 1, 4, 2];

/** České skloňování podle počtu: 1 tiket, 2–4 tikety, 5+ tiketů. */
const czechPlural = (n: number, one: string, few: string, many: string) => {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
};

type Contest = {
  id: string;
  title: string;
  description: string | null;
  rules: string | null;
  rules_pdf_url: string | null;
  main_prize: string | null;
  ticket_price: number;
  ticket_count: number;
  status: string;
  main_prize_secondary_image: string | null;
  main_image: string | null;
  banner_image: string | null;
  fast_game?: boolean;
};

type BonusPrize = {
  /** Počet kusů v soutěži – jen pro zobrazení v detailu výhry. */
  quantity?: number | null;
  id: string;
  contest_id: string;
  description: string | null;
  detailed_description?: string | null;
  amount: number | null;
  image?: string | null;
  image_url?: string | null;
  ticket_position?: number | null;
};

/**
 * Row of get_contest_bonus_catalogue(): the customer-safe view of a contest's
 * bonus prizes — WHAT can be won and how many of each, never WHERE
 * (ticket_position is deliberately absent). See migration 20260825120000.
 */
type BonusCatalogueRow = {
  description: string | null;
  detailed_description: string | null;
  image_url: string | null;
  quantity: number;
  miocoin_positions: number;
  miocoin_total: number;
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
  /** UUID řádku v `tickets` z `buy_ticket_atomic` — nutné pro upload sdíleného obrázku. */
  ticket_row_id?: string | null;
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
              ? 'border-[#E9B949] scale-110 shadow-[0_0_14px_rgba(233,185,73,0.6)]'
              : 'border-white/25 opacity-65 hover:opacity-90 hover:scale-105'
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
  const { partners } = usePartners();

  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);

  const [bonusCatalogue, setBonusCatalogue] = useState<BonusCatalogueRow[]>([]);
  // Group keys ("description||detailed_description") the current user has won —
  // resolved from their own winner rows, used only to highlight their win.
  const [myWonPrizeKeys, setMyWonPrizeKeys] = useState<Set<string>>(new Set());
  /** Sum of `bonus_prizes.amount` for coin rows (amount > 0); physical rows use null/0 amount */
  const [miocoinBonusPoolTotal, setMiocoinBonusPoolTotal] = useState(0);
  /** Count of MioCoin bonus prize positions (bonus_prizes rows with amount > 0) */
  const [miocoinBonusPositions, setMiocoinBonusPositions] = useState(0);
  const [myWins, setMyWins] = useState<Winner[]>([]);
  const [balance, setBalance] = useState(0);
  const [balanceLoaded, setBalanceLoaded] = useState(false);

  const [processingContestId, setProcessingContestId] = useState<string | null>(null);
  const [modalResult, setModalResult] = useState<UnlockTicketResult | null>(null);
  const [modalContestId, setModalContestId] = useState<string | null>(null);
  const requestInFlightRef = useRef(false);
  const [mysteryResult, setMysteryResult] = useState<{
    contestId: string;
    ticket: MysteryTicketOutcome;
    coupon: MysteryCoupon | null;
  } | null>(null);
  const [selectedBonusPrize, setSelectedBonusPrize] = useState<BonusPrize | null>(null);
  const [galleryMedia, setGalleryMedia] = useState<{ id: string; contest_id: string; type: string; url: string; sort_order: number | null; created_at: string | null }[]>([]);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);
  
  const { banners: placementBanners } = usePlacementBanners(['vzhled_karta_vyher']);
  const starryBackgroundUrl = placementBanners.vzhled_karta_vyher?.image_url || null;

  // Realtime status for Live strip (local channel just for status indicator)
  const [realtimeStatus, setRealtimeStatus] = useState<string>('');
  const [lastWinnersEventAt, setLastWinnersEventAt] = useState<number | null>(null);
  const [, forceUpdate] = useState(0);
  const [progressTicketsTotal, setProgressTicketsTotal] = useState(1_000_000);

  // Live activity rotating messages: nejdřív skutečné nedávné výhry této soutěže
  // (veřejný zdroj jako „Poslední výherci“), pak obecné hlášky.
  const BASE_LIVE_MESSAGES = [
    'Soutěž je aktivní',
    'Bonusové výherní pozice jsou součástí pravidel soutěže',
    'Každý další tiket posouvá pořadí soutěže',
    'Otevři další tiket v pořadí',
    'Výherní pozice jsou předem určeny',
  ];
  const { data: latestWins, refetch: refetchLatestWins } = useLatestWinners(40);
  const refetchLatestWinsRef = useRef(refetchLatestWins);
  refetchLatestWinsRef.current = refetchLatestWins;
  const LIVE_MESSAGES = useMemo(() => {
    const title = contest?.title;
    const wins = title
      ? (latestWins ?? [])
          .filter((w) => w.contest_title === title && w.prize_name)
          .slice(0, 5)
          .map((w) => {
            const who = (w.user_nickname || w.user_name || '').trim();
            return who && who !== 'Výherce' ? `${who} získává ${w.prize_name}` : `Nová výhra: ${w.prize_name}`;
          })
      : [];
    return [...wins, ...BASE_LIVE_MESSAGES];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestWins, contest?.title]);
  const liveCountRef = useRef(LIVE_MESSAGES.length);
  liveCountRef.current = LIVE_MESSAGES.length;
  const [liveMessageIndex, setLiveMessageIndex] = useState(0);
  const [liveVisible, setLiveVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveVisible(false);
      setTimeout(() => {
        setLiveMessageIndex((prev) => (prev + 1) % liveCountRef.current);
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
          void refetchLatestWinsRef.current();
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

  /**
   * Mystery kupon: za contests.ticket_price dostane zákazník náhodný dostupný
   * kupon a tiket zdarma. Celý nákup je jedna atomická transakce — při chybě
   * se nestrhnou MioCoiny ani nevznikne tiket.
   */
  async function runMysteryPurchase(contestId: string, userId: string) {
    const outcome = await purchaseMysteryCoupon(userId, contestId);

    if (!outcome.success) {
      logTicketPurchaseRejected({
        userId,
        contestId,
        errorCode: outcome.error.slice(0, 200),
      });
      toast.error(mysteryErrorMessage(outcome.error));
      return;
    }

    logTicketPurchaseSuccess({ userId, contestId, ticketNumber: outcome.ticket_number });
    analytics.ticketPurchase({ contestId, ticketNumber: outcome.ticket_number });

    recordLocalTicketPlay();
    await loadUserBalance(userId);

    // Jeden společný výsledek: výhra z tiketu nahoře, kupon jako druhý bonus.
    // Tiket i kupon už jsou uložené — dialog jen ukazuje, co vzniklo.
    setMysteryResult({
      contestId,
      ticket: {
        ticket_number: outcome.ticket_number,
        won_type: outcome.won_type,
        won_prize: outcome.won_prize,
        distance_to_next_bonus: outcome.distance_to_next_bonus,
      },
      coupon: outcome.coupon,
    });
  }

  async function handleUseMiocoins() {
    console.log('[DEBUG ContestDetail] handleUseMiocoins called, user:', user?.id, 'contest:', contest?.id);

    // Zámek se bere synchronně, ještě před prvním awaitem. Načtení zůstatku
    // níž je await, takže dva kliky ve stejném ticku by při nenačtené peněžence
    // jinak prošly oba a koupily dvakrát. Platí pro mystery i klasický nákup.
    if (requestInFlightRef.current) {
      console.log('[DEBUG ContestDetail] Request already in flight, ignoring click');
      return;
    }
    requestInFlightRef.current = true;

    if (!user) {
      toast.error("Pro nákup tiketu se musíš přihlásit.");
      requestInFlightRef.current = false;
      navigate(buildLoginRedirectUrl(location.pathname + location.search));
      return;
    }

    if (!contest) {
      requestInFlightRef.current = false;
      return;
    }

    if (contest.status !== 'active') {
      toast.error("Soutěž není aktivní");
      requestInFlightRef.current = false;
      return;
    }

    let effectiveBalance: number;
    try {
      if (!balanceLoaded) {
        effectiveBalance = await loadUserBalance(user.id);
      } else {
        effectiveBalance = balance;
      }
    } catch (err) {
      // loadUserBalance si dnes chyby řeší sám, ale kdyby to někdy přestalo
      // platit, nesmí nám tu uváznout zámek — tlačítko by zůstalo mrtvé
      // až do znovunačtení stránky.
      console.error('[DEBUG ContestDetail] loadUserBalance failed:', err);
      toast.error("Nepodařilo se načíst zůstatek MIO.");
      requestInFlightRef.current = false;
      return;
    }
    if (contest.status === 'active' && effectiveBalance < contest.ticket_price) {
      const shortage = Math.max(0, Math.ceil(contest.ticket_price - effectiveBalance));
      toast.error(`Chybí ti ${shortage.toLocaleString('cs-CZ')} MIO`);
      requestInFlightRef.current = false;
      return;
    }

    console.log('[DEBUG ContestDetail] setProcessingContestId:', contest.id);
    setProcessingContestId(contest.id);

    try {
      // Nákup vede vždy přes garantovaný benefit bundle
      // (purchase_guaranteed_benefit_bundle_atomic — omezený i neomezený
      // fallback). Klasický holý nákup tiketu (`buy_ticket_atomic`) z téhle
      // cesty už NENÍ dosažitelný: když benefit není dostupný, je vypnutý
      // feature flag, nebo soutěž není na allowlistu, RPC to vrátí jako
      // běžnou chybu — MioCoiny se nestrhnou a tiket nevznikne.
      await runMysteryPurchase(contest.id, user.id);
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
          .select("id, title, description, rules, rules_pdf_url, main_prize, ticket_price, ticket_count, status, main_prize_secondary_image, main_image, banner_image, fast_game, total_miocoin_bonus")
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
        setProgressTicketsTotal(contestData.ticket_count ?? 1_000_000);

        // === Bonusové výhry — POUZE přes position-free katalog ===
        // bonus_prizes se z klienta nečte přímo: řádky nesou ticket_position,
        // tedy budoucí výherní pozice. Protože se tikety vydávají sekvenčně,
        // znalost pozic dělá ze soutěže deterministicky vytěžitelnou hru
        // (viz migrace 20260825120000). RPC vrací jen KATALOG (co lze vyhrát
        // a v jakém počtu) + agregáty, nikdy pozice.
        const { data: catalogue, error: catalogueError } = await supabase
          .rpc("get_contest_bonus_catalogue", { p_contest_id: id });
        if (catalogueError) {
          console.error('[ContestDetail] bonus catalogue RPC error:', catalogueError);
        }
        const catalogueRows = (catalogue ?? []) as BonusCatalogueRow[];

        // Agregáty přijdou na každém řádku (i na tom s description = null,
        // který vznikne u soutěže bez věcných cen).
        const coinPositions = Number(catalogueRows[0]?.miocoin_positions ?? 0);
        setMiocoinBonusPositions(coinPositions);

        // Součet MioCoinů bere rovnou z katalogu. Dřív se na to volalo zvlášť
        // get_contest_miocoin_bonus, jenže ta funkce NENÍ security definer, takže
        // po zavedení RLS na bonus_prizes (migrace 20260825120000) skenovala
        // 126 tisíc řádků pod per-row policy a trvala sekundy (u anonyma rovnou
        // padala na 42501). Katalogové RPC je SECURITY DEFINER a stejnou hodnotu
        // vrací okamžitě v už provedeném dotazu.
        // Fallback na contests.total_miocoin_bonus zůstává, aby box nikdy
        // neukázal 0, když bonusy nastavené jsou.
        const rpcMiocoinTotal = Number(catalogueRows[0]?.miocoin_total ?? 0);
        const storedMiocoinTotal = Number((contestData as any).total_miocoin_bonus ?? 0);
        setMiocoinBonusPoolTotal(rpcMiocoinTotal > 0 ? rpcMiocoinTotal : storedMiocoinTotal);

        setBonusCatalogue(catalogueRows.filter((r) => r.description !== null));

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

          // Resolve WHICH catalogue entries this user won. Reading these rows is
          // allowed by RLS because a won prize is no longer 'pending' — it leaks
          // nothing about future positions.
          const wonPrizeIds = nextMyWins
            .map((w) => w.bonus_prize_id)
            .filter((x): x is string => !!x);

          if (wonPrizeIds.length > 0) {
            const { data: wonPrizes, error: wonPrizesError } = await supabase
              .from("bonus_prizes")
              .select("description, detailed_description")
              .in("id", wonPrizeIds);
            if (wonPrizesError) {
              console.error('[ContestDetail] won prizes fetch error:', wonPrizesError);
            }
            setMyWonPrizeKeys(
              new Set(
                (wonPrizes ?? []).map(
                  (p) => `${p.description ?? ''}||${p.detailed_description ?? ''}`,
                ),
              ),
            );
          } else {
            setMyWonPrizeKeys(new Set());
          }
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
      ticket_row_id: modalResult.ticket_row_id ?? null,
      next_bonus_position: modalResult.next_bonus_position ?? null,
      distance_to_next_bonus: modalResult.distance_to_next_bonus ?? null,
      won_prize: modalResult.won_prize,
      remaining_tickets: modalResult.remaining_tickets,
      won_type: modalResult.won_type,
      bonus_prize_id: modalResult.bonus_prize_id,
      partner_offer: modalResult.partner_offer ?? null,
    };
  }, [
    modalResult?.ticket_number,
    modalResult?.ticket_row_id,
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

  // Group identical physical bonus prizes so one product with quantity N shows as one
  // card with a "N× v soutěži" badge instead of N duplicate cards.
  // Key: description + detailed_description ONLY — image_url is intentionally excluded
  // because bulk prizes (qty > 1) are each uploaded with a unique UUID storage path,
  // making their image_url values differ even though they represent the same product.
  // The first row in each group is used as the representative card/image/modal data.
  // MioCoin bonuses (amount > 0) each get their own group key so they remain individual.
  /** Total number of physical bonus prizes (sum of per-prize quantities). */
  const physicalBonusCount = useMemo(
    () => bonusCatalogue.reduce((sum, r) => sum + Number(r.quantity ?? 0), 0),
    [bonusCatalogue],
  );

  /**
   * The catalogue arrives already grouped from the DB (one row per distinct
   * physical prize + quantity), so this only resolves the image URL and marks
   * whether the current user won that prize. No ticket positions involved.
   */
  const groupedBonusPrizes = useMemo(() => {
    return bonusCatalogue.map((row) => {
      const key = `${row.description ?? ''}||${row.detailed_description ?? ''}`;
      let imgUrl: string | null = null;
      if (row.image_url) {
        imgUrl = row.image_url.startsWith('http')
          ? row.image_url
          : supabase.storage.from('contest-images').getPublicUrl(row.image_url).data.publicUrl;
      }
      return {
        key,
        prize: {
          id: key,
          contest_id: id ?? '',
          description: row.description,
          detailed_description: row.detailed_description,
          amount: null,
          image_url: row.image_url,
        } as BonusPrize,
        count: Number(row.quantity ?? 0),
        imageUrl: imgUrl,
        isMyWin: myWonPrizeKeys.has(key),
      };
    });
  }, [bonusCatalogue, myWonPrizeKeys, id]);

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

  // Helper: resolve relative storage path or pass-through absolute URL
  const resolveImg = (path?: string | null, bucket: string = 'contest-images'): string | null => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  };

  // HERO image fallback chain: secondary -> main -> banner -> fallback
  const heroImage =
    resolveImg(contest.main_prize_secondary_image) ||
    resolveImg(contest.main_image) ||
    resolveImg(contest.banner_image, 'contest-banners') ||
    "/fallback-car.png";

  const isProcessing = processingContestId === contest.id;

  const insufficientFunds =
    Boolean(user) &&
    contest.status === 'active' &&
    balanceLoaded &&
    balance < contest.ticket_price;
  const shortageCoins = insufficientFunds
    ? Math.max(0, Math.ceil(contest.ticket_price - balance))
    : 0;

  // BACKGROUND fallback chain: explicit background media -> banner -> secondary -> main
  const backgroundMedia = galleryMedia.find((m) => m.type === 'background');
  const bgImageUrl =
    resolveImg(backgroundMedia?.url) ||
    resolveImg(contest.banner_image, 'contest-banners') ||
    resolveImg(contest.main_prize_secondary_image) ||
    resolveImg(contest.main_image);

  const PRIMARY_DOMAIN = "https://onemil.cz";
  const canonicalUrl = `${PRIMARY_DOMAIN}/contest/${contest.id}`;
  const fallbackDescription =
    "OneMil je prémiová platforma spotřebitelských soutěží o exkluzivní a luxusní věcné ceny. Pro využití voucherů a účast ve spotřebitelských soutěžích slouží MIO jako interní kredit OneMil.";
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
      {/* Pozadí soutěže (nahrané adminem) jen jako jemný nádech nahoře – nový světlý vzhled (deska 5). */}
      {bgImageUrl && (
        <div
          aria-hidden="true"
          className="om-cd-bgimg"
          style={{ backgroundImage: `url(${bgImageUrl})` }}
        />
      )}
      <div
        className="om-cd relative z-10 p-4 md:p-6 w-full max-w-5xl mx-auto space-y-6 pb-28"
        style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom, 0px))' }}
      >

      {/* 1. HLAVNÍ VÝHRA – zlatý rámeček */}
      <section className="om-cd-frame">
        <div className="om-cd-inner">
          <span aria-hidden="true" className="om-cd-corner om-cd-c1" />
          <span aria-hidden="true" className="om-cd-corner om-cd-c2" />
          <span aria-hidden="true" className="om-cd-corner om-cd-c3" />
          <span aria-hidden="true" className="om-cd-corner om-cd-c4" />
          {CD_RISE.map((r, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="om-cd-rise"
              style={{
                left: r.left,
                width: r.size,
                height: r.size,
                animationDuration: r.dur,
                animationDelay: r.delay,
                ['--dx' as string]: r.dx,
              }}
            />
          ))}
          <div className="relative z-[1] flex flex-col md:flex-row md:items-center md:justify-between gap-6 p-[22px_18px_18px] md:p-8">
            <div className="flex-1 min-w-0 md:max-w-[50%] flex flex-col gap-3.5">
              {contest.fast_game && (
                <div className="flex justify-end md:justify-start">
                  <span className="om-cd-fast">Fast game</span>
                </div>
              )}
              <div>
                <h1 className="om-cd-title text-[34px] md:text-[44px]">{contest.title}</h1>
                <span aria-hidden="true" className="om-cd-uline" />
              </div>
              {contest.main_prize && (
                <div className="om-cd-plaque">
                  <span className="om-cd-medal">
                    <img src={onemilEmblem} alt="" aria-hidden="true" className="w-[26px]" />
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="om-cd-plaque-label">Hlavní výhra</span>
                    <strong className="om-cd-plaque-name">{contest.main_prize}</strong>
                  </div>
                </div>
              )}
              {contest.description && (
                <div className="space-y-2">
                  <p
                    className={`om-cd-desc whitespace-pre-line break-words ${
                      descExpanded ? '' : 'line-clamp-6 md:line-clamp-8 overflow-hidden'
                    }`}
                  >
                    {contest.description}
                  </p>
                  {contest.description.length > 280 && (
                    <button
                      type="button"
                      onClick={() => setDescExpanded((v) => !v)}
                      className="om-cd-more"
                    >
                      {descExpanded ? 'Zobrazit méně' : 'Zobrazit více'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Fotka / video hlavní výhry + náhledy galerie */}
            <div className="md:w-[380px] md:flex-none w-full flex flex-col gap-3">
              <div className="om-cd-photo">
                {activeMedia ? (
                  activeMedia.type === 'video' ? (
                    <div
                      key={`video-${activeMedia.id}`}
                      className="absolute inset-0"
                      style={{ animation: 'galleryFadeSlide 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards' }}
                    >
                      <YouTubeEmbed url={activeMedia.url} className="absolute inset-0" />
                    </div>
                  ) : (
                    <img
                      key={`img-${activeMedia.id}`}
                      src={getMediaUrl(activeMedia.url)}
                      alt={contest.title}
                      className="w-full h-full object-contain"
                      style={{ animation: 'galleryFadeSlide 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards' }}
                    />
                  )
                ) : (
                  <img
                    src={heroImage}
                    alt={contest.title}
                    className="w-full h-full object-contain"
                    onError={(e) => (e.currentTarget.src = "/fallback-car.png")}
                  />
                )}
                {contest.status === 'active' && (
                  <span className="om-cd-live-badge">
                    <i aria-hidden="true" />
                    ŽIVĚ
                  </span>
                )}
              </div>

              {displayGallery.length > 1 && (
                <GalleryThumbnails
                  items={displayGallery}
                  activeIndex={activeGalleryIndex}
                  onSelect={setActiveGalleryIndex}
                  getYouTubeId={getYouTubeId}
                  getMediaUrl={getMediaUrl}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-4">
        {/* 2. Stav MIO + akce – karta ve tvaru tiketu */}
        <section className="om-cd-ticket animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <span aria-hidden="true" className="om-cd-tk-grain" />
          <span aria-hidden="true" className="om-cd-tk-shine" />
          <div className="om-cd-tk-stub">
            <span className="om-cd-barcode" aria-hidden="true">
              {CD_BARCODE.map((w, i) => (
                <i key={i} style={{ width: w }} />
              ))}
              <span className="om-cd-barcode-scan" />
            </span>
            <span className="om-cd-stub-label">ONEMIL · MIO</span>
          </div>
          <div className="om-cd-tk-main">
            <p className="om-cd-label">Tvůj stav MIO</p>
            <p className="om-cd-num text-[44px]">
              {balance.toLocaleString("cs-CZ", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
            </p>

            {/* Živý pásek soutěže */}
            <div className="om-cd-feed">
              <div className="flex items-center gap-2">
                <span
                  className={`om-cd-sig ${realtimeStatus === 'SUBSCRIBED' ? '' : 'om-cd-sig-off'}`}
                  aria-hidden="true"
                >
                  <i /><i /><i />
                </span>
                <span
                  className={`text-[11px] font-bold ${
                    realtimeStatus === 'SUBSCRIBED' ? 'text-[rgba(74,222,128,0.9)]' : 'text-[rgba(248,113,113,0.85)]'
                  }`}
                >
                  {realtimeStatus === 'SUBSCRIBED' ? 'Live: připojeno' : 'Live: nepřipojeno'}
                </span>
                {lastWinnersEventAt !== null && (
                  <span className="ml-auto text-[10px] text-[#8E8F98]">
                    Poslední live event: před {Math.max(1, Math.round((Date.now() - lastWinnersEventAt) / 1000))}&nbsp;s
                  </span>
                )}
              </div>
              <div className="om-cd-feedbox">
                <span className="om-cd-fi" aria-hidden="true">
                  <OneMilTicketIcon size={18} className="w-[18px] h-[18px]" />
                </span>
                <span
                  className="om-cd-ft transition-all duration-[350ms] ease-out"
                  style={{
                    opacity: liveVisible ? 1 : 0,
                    transform: liveVisible ? 'translateX(0)' : 'translateX(-24px)',
                  }}
                >
                  {LIVE_MESSAGES[liveMessageIndex % LIVE_MESSAGES.length]}
                </span>
              </div>
              <div className="om-cd-timer" aria-hidden="true">
                <i key={liveMessageIndex} />
              </div>
            </div>

            {insufficientFunds && (
              <p className="text-xs text-[#F6D77A] font-semibold">
                Chybí ti {shortageCoins.toLocaleString('cs-CZ')} MIO
              </p>
            )}
            <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-2.5 mt-auto">
              {insufficientFunds ? (
                isNativeApp() ? (
                  <div className="col-span-2 h-[52px] flex items-center justify-center text-sm font-semibold text-[#F6D77A]">
                    Nedostatek MIO
                  </div>
                ) : (
                  <Button
                    onClick={() =>
                      navigate('/profile', {
                        state: { paymentReturnTo: `/contest/${contest.id}` },
                      })
                    }
                    className="om-cd-gold col-span-2"
                  >
                    Dobít MIO
                  </Button>
                )
              ) : (
                <>
                  <Button
                    onClick={handleUseMiocoins}
                    disabled={isProcessing}
                    className={`om-cd-gold ${isNativeApp() ? 'col-span-2' : ''}`}
                  >
                    {isProcessing ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                        Otevírám…
                      </span>
                    ) : `Uplatnit ${contest.ticket_price} MIO`}
                  </Button>
                  {!isNativeApp() && (
                    <Button
                      onClick={() =>
                        navigate('/profile', {
                          state: { paymentReturnTo: `/contest/${contest.id}` },
                        })
                      }
                      variant="outline"
                      className="om-cd-ghost"
                    >
                      Dobít MIO
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        {/* 3. Tikety a bonusové výhry v soutěži – karta ve tvaru tiketu */}
        <section className="om-cd-ticket animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <span aria-hidden="true" className="om-cd-tk-grain" />
          <span aria-hidden="true" className="om-cd-tk-shine" style={{ animationDelay: '-3s' }} />
          <div className="om-cd-tk-stub">
            <img
              src={onemilEmblem}
              alt=""
              aria-hidden="true"
              className="w-10"
              style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }}
            />
            <span className="om-cd-stub-label text-[#F2C55C]">ONEMIL</span>
          </div>
          <div className="om-cd-tk-main gap-1.5">
            <span aria-hidden="true" className="om-cd-holo" />
            <p className="om-cd-label">V této soutěži je celkem</p>
            <div className="flex items-baseline gap-2.5 mt-1">
              <strong className="om-cd-plat text-[36px]">{progressTicketsTotal.toLocaleString('cs-CZ')}</strong>
              <span className="om-cd-sub">{czechPlural(progressTicketsTotal, 'tiket', 'tikety', 'tiketů')}</span>
            </div>
            <strong className="om-cd-num text-[36px] whitespace-nowrap">
              {(miocoinBonusPositions + physicalBonusCount).toLocaleString('cs-CZ')}
            </strong>
            <span className="om-cd-sub -mt-0.5">
              {czechPlural(
                miocoinBonusPositions + physicalBonusCount,
                'bonusová výhra',
                'bonusové výhry',
                'bonusových výher',
              )}
            </span>
            <span className="text-xs leading-relaxed text-[#A9AAB3] mt-1">
              Z toho <b className="text-[#F2C55C]">{miocoinBonusPoolTotal.toLocaleString('cs-CZ')} MIO</b>, které ti mohou
              otevřít cestu k dalším soutěžím nebo k nákupu voucherů u našich partnerů.
            </span>
            <div className="mt-2 border-t border-dashed border-[rgba(233,185,73,0.25)] pt-2.5 flex flex-col gap-1.5">
              <div className="om-cd-seq" aria-hidden="true">
                {['1', '2', '3', '…'].map((n, i) => (
                  <span key={n} className="om-cd-mt" style={{ animationDelay: `${i * 0.45}s` }}>
                    {n}
                  </span>
                ))}
                <span className="om-cd-dots" />
                <span className="om-cd-fin">
                  <i>
                    <img src={onemilEmblem} alt="" className="w-[18px]" />
                  </i>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="om-cd-seq-l">Start</span>
                <span className="om-cd-seq-l text-[#F2C55C]">Hlavní výhra</span>
              </div>
              <span className="text-[11.5px] text-[#8E8F98]">
                Tikety se otevírají postupně v pořadí 1, 2, 3 a dále.
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* 4. Nakupuj a soutěž – jak získat MIO u partnerů (✦ NAVÍC, schváleno) */}
      <section className="om-cd-lightcard p-[16px_14px_14px] md:p-6 flex flex-col gap-3.5 overflow-hidden">
        <strong className="om-cd-section-title text-[22px]">Nakupuj a soutěž</strong>
        <div className="relative flex justify-between max-w-xl md:mx-auto md:w-full">
          <span aria-hidden="true" className="om-cd-track"><i /></span>
          {[
            { label: 'Nakoupíš u partnera', Icon: OneMilCartIcon },
            { label: 'Dostaneš MIO kód', Icon: OneMilMioCoinIcon },
            { label: 'Otevřeš tiket v soutěži', Icon: OneMilTicketIcon },
          ].map(({ label, Icon }, i) => (
            <div key={label} className="om-cd-step">
              <span className="om-cd-stepi" style={{ animationDelay: `${i * 2}s` }}>
                <Icon size={24} className="w-6 h-6" />
              </span>
              <span className="text-xs font-bold leading-snug text-[#17171B]">{label}</span>
            </div>
          ))}
        </div>
        {partners.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-extrabold tracking-[0.12em] text-[#8A5A10]">NAŠI PARTNEŘI</span>
            <div className="om-cd-marq-mask">
              <div className="om-cd-marq">
                {[...partners, ...partners].map((p, i) => (
                  <span key={`${p.id}-${i}`} className="om-cd-logo" aria-hidden={i >= partners.length}>
                    <img
                      src={p.logo_url}
                      alt={i < partners.length ? p.name : ''}
                      onError={(e) => {
                        const tile = e.currentTarget.parentElement;
                        if (tile) tile.style.display = 'none';
                      }}
                    />
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 5. BONUSOVÉ VĚCNÉ VÝHRY */}
      <section className="om-cd-lightcard p-[18px_16px_22px] md:p-6">
        <h2 className="om-cd-section-title text-2xl mb-7 pb-2.5">Bonusové věcné výhry</h2>

        {groupedBonusPrizes.length === 0 ? (
          <p className="text-[#5E5B57] text-sm py-4 text-center">Zatím nebyly přidány žádné věcné bonusové výhry.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-9 pr-3.5">
            {groupedBonusPrizes.map(({ key, prize: b, count, imageUrl: bonusImageUrl, isMyWin }) => {
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSelectedBonusPrize({ ...b, image_url: bonusImageUrl, quantity: count });
                  }}
                  className={`om-cd-bp ${count > 1 ? 'om-cd-bp-multi' : ''}`}
                >
                  {count > 1 && (
                    <span className="om-cd-cnt">
                      <b>{count.toLocaleString('cs-CZ')}×</b>
                      <small>v soutěži</small>
                    </span>
                  )}
                  {bonusImageUrl && (
                    <span className="om-cd-bp-im">
                      <img
                        src={bonusImageUrl}
                        alt={b.description ?? "Bonusová výhra"}
                        onError={(e) => (e.currentTarget.style.display = "none")}
                      />
                    </span>
                  )}
                  <strong className="text-[15px] text-white">{b.description || "Bonusová výhra"}</strong>
                  {isMyWin && <span className="om-cd-mine">Moje výhra</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* PRAVIDLA SOUTĚŽE */}
      {(contest.rules_pdf_url || (contest.rules && contest.rules.trim())) && (
        <section className="om-cd-lightcard p-6 md:p-8">
          <h2 className="om-cd-section-title text-2xl md:text-3xl mb-5 pb-2.5">Pravidla soutěže</h2>
          {contest.rules_pdf_url && (
            <a
              href={contest.rules_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="om-cd-rules-btn mb-4"
            >
              📄 Zobrazit pravidla soutěže
            </a>
          )}
          {contest.rules && contest.rules.trim() && (
            <div className="text-[#3A3A40] whitespace-pre-wrap leading-relaxed">
              {contest.rules}
            </div>
          )}
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
      <MysteryPurchaseResultDialog
        open={mysteryResult !== null}
        contestId={mysteryResult?.contestId ?? null}
        ticket={mysteryResult?.ticket ?? null}
        coupon={mysteryResult?.coupon ?? null}
        onClose={() => setMysteryResult(null)}
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
