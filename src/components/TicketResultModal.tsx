import React, { useEffect, useLayoutEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import Confetti from 'react-confetti';
import { useWindowSize } from 'react-use';
import { supabase, supabaseUrl } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Facebook, Download, Share2, X, ChevronRight } from 'lucide-react';
import logoOnemil from '@/assets/logo-onemil.png';
import miocoinLogo from '@/assets/miocoin.png';
import { bonusPrizeDisplayName } from '@/lib/miocoin';
import auroraIdle from '@/assets/aurora-idle.jpg';
import auroraWinVideo from '@/assets/aurora-win.mp4';
import auroraWinPoster from '@/assets/aurora-win-poster.jpg';
import { cn } from '@/lib/utils';
import { playWinChime } from '@/lib/playWinChime';
import { pickRandomAlmostWinMessage, rollAlmostWinEffect } from '@/lib/retentionLocal';
import { VoucherTicketFrame, voucherTicketText } from '@/components/VoucherTicketFrame';
import './TicketResultModal.css';

// Preload an image with anonymous CORS so canvas stays untainted.
const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

const loadImageSafe = async (src: string | null | undefined): Promise<HTMLImageElement | null> => {
  if (!src) return null;
  try {
    return await loadImage(src);
  } catch {
    return null;
  }
};

const loadLogoImage = (): Promise<HTMLImageElement> => loadImage(logoOnemil);

interface BonusPrizeData {
  id: string;
  title: string | null;
  description: string;
  detailed_description: string | null;
  image_url: string | null;
  amount: number | null;
  status: string;
}

interface TicketResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  contestId: string;
  result: {
    ticket_number: number;
    /** UUID řádku v `tickets` z `buy_ticket_atomic`. Nutné pro upload sdíleného obrázku. */
    ticket_row_id?: string | null;
    distance_to_next_bonus: number | null;
    next_bonus_position: number | null;
    won_prize?: string | null;
    remaining_tickets?: number;
    won_type?: 'bonus' | 'main' | null;
    bonus_prize_id?: string | null;
    won_bonus?: boolean;
    won_main?: boolean;
    partner_offer?: {
      id: string;
      title: string;
      short_text: string | null;
      logo_url: string | null;
      banner_url: string | null;
      link_or_code: string | null;
      valid_to: string | null;
      partner_name: string;
    } | null;
  } | null | undefined;
}

const funnyMessages = [
  "Tentokrát to nevyšlo, ale nevzdávej to! 🎯",
  "Štěstí přeje připraveným, zkus to znovu! 🍀", 
  "Skoro to bylo, příště to určitě vyjde! 💪",
  "Další výherní ticket je zase blíž. 🎪",
  "Neúspěch je jen začátek úspěchu! 🌟"
];

// Czech plural for "tah" (2-4 = tahy, 5+ = tahů)
const tahPlural = (n: number): string => {
  if (n >= 2 && n <= 4) return 'tahy';
  return 'tahů';
};

// Build the "next winning ticket" message for non-winning results
const nextWinTicketText = (n: number): string => {
  if (n === 1) return 'Další výherní ticket čeká už při dalším tahu.';
  return `Další výherní ticket čeká už za ${n.toLocaleString('cs-CZ')} ${tahPlural(n)}.`;
};

const NEXT_WIN_EXPLAINER = 'Může obsahovat MIO, bonusovou cenu nebo hlavní výhru.';

type ShareKind = 'bonus_physical' | 'miocoin' | 'partner_offer' | 'main_prize';

interface ShareCardOptions {
  kind: ShareKind;
  imageUrl: string | null;       // primary product image (already known to exist or null for fallback)
  fallbackImageUrl?: string | null; // e.g. partner logo if banner fails
  headline: string;              // main CZ line
  prizeTitle: string;            // displayed under headline (prize / offer name)
  bonusAmount?: number | null;   // for MioCoin prize
}

// Generate a premium share card image (1200x630) using the real prize image.
const generatePremiumShareCard = async (opts: ShareCardOptions): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get canvas context');

  const W = 1200;
  const H = 630;
  canvas.width = W;
  canvas.height = H;

  // Dark premium background (OneMil brand: Midnight Black -> Deep Navy -> Graphite)
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0A0B0F');
  bg.addColorStop(0.55, '#101722');
  bg.addColorStop(1, '#1D2128');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle radial gold glow behind product
  const glow = ctx.createRadialGradient(W * 0.32, H * 0.55, 20, W * 0.32, H * 0.55, 380);
  glow.addColorStop(0, 'rgba(255, 138, 0, 0.18)');
  glow.addColorStop(1, 'rgba(255, 138, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Outer thin platinum border
  ctx.strokeStyle = 'rgba(231, 235, 240, 0.16)';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, W - 32, H - 32);

  // Product image area (left side)
  const imgBoxX = 70;
  const imgBoxY = 110;
  const imgBoxW = 460;
  const imgBoxH = 410;

  let productImg = await loadImageSafe(opts.imageUrl);
  if (!productImg && opts.fallbackImageUrl) {
    productImg = await loadImageSafe(opts.fallbackImageUrl);
  }

  if (productImg) {
    // contain-fit
    const ratio = Math.min(imgBoxW / productImg.width, imgBoxH / productImg.height);
    const dw = productImg.width * ratio;
    const dh = productImg.height * ratio;
    const dx = imgBoxX + (imgBoxW - dw) / 2;
    const dy = imgBoxY + (imgBoxH - dh) / 2;
    ctx.drawImage(productImg, dx, dy, dw, dh);
  } else {
    // Premium fallback: trophy emoji on graphite plate
    ctx.fillStyle = 'rgba(29, 33, 40, 0.7)';
    ctx.fillRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH);
    ctx.strokeStyle = 'rgba(216, 186, 120, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH);
    ctx.font = '180px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏆', imgBoxX + imgBoxW / 2, imgBoxY + imgBoxH / 2);
    ctx.textBaseline = 'alphabetic';
  }

  // OneMil logo top-right
  try {
    const logoImg = await loadLogoImage();
    const logoH = 56;
    const logoW = (logoImg.width / logoImg.height) * logoH;
    ctx.drawImage(logoImg, W - logoW - 60, 50, logoW, logoH);
  } catch {
    ctx.font = 'bold 36px Poppins, system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#E7EBF0';
    ctx.textAlign = 'right';
    ctx.fillText('OneMil', W - 60, 90);
  }

  // Right column text block
  const textX = 580;
  const textRight = W - 60;
  const textW = textRight - textX;

  // Headline (Czech)
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FF8A00';
  ctx.font = 'bold 46px Poppins, system-ui, -apple-system, sans-serif';
  // wrap headline
  const wrap = (text: string, maxWidth: number, lineHeight: number, startY: number): number => {
    const words = text.split(' ');
    let line = '';
    let y = startY;
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, textX, y);
        line = words[i];
        y += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) {
      ctx.fillText(line, textX, y);
      y += lineHeight;
    }
    return y;
  };

  let cursorY = 220;
  cursorY = wrap(opts.headline, textW, 56, cursorY);

  // Prize title (platinum, slightly smaller)
  cursorY += 18;
  ctx.fillStyle = '#E7EBF0';
  ctx.font = '600 34px Poppins, system-ui, -apple-system, sans-serif';
  cursorY = wrap(opts.prizeTitle, textW, 42, cursorY);

  // MioCoin amount (if applicable)
  if (opts.kind === 'miocoin' && opts.bonusAmount && opts.bonusAmount > 0) {
    cursorY += 14;
    ctx.fillStyle = '#FFB547';
    ctx.font = 'bold 38px Poppins, system-ui, -apple-system, sans-serif';
    ctx.fillText(`+${opts.bonusAmount.toLocaleString('cs-CZ')} MIO`, textX, cursorY);
  }

  // Footer CTA (centered bottom)
  ctx.textAlign = 'center';
  ctx.fillStyle = '#BFC6CF';
  ctx.font = '500 26px Inter, system-ui, -apple-system, sans-serif';
  ctx.fillText('Hraj taky na onemil.cz', W / 2, H - 50);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create blob'));
    }, 'image/png', 1.0);
  });
};

export const TicketResultModal: React.FC<TicketResultModalProps> = ({
  isOpen,
  onClose,
  contestId,
  result
}) => {
  const { width, height } = useWindowSize();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [bonusPrize, setBonusPrize] = useState<BonusPrizeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [publicShareUrl, setPublicShareUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const generatedForTicketRef = useRef<number | null>(null);
  const winSoundPlayedForRef = useRef<string | null>(null);
  const prizeTitleFocusRef = useRef<HTMLDivElement>(null);
  const [lossRetentionNudge, setLossRetentionNudge] = useState<string | null>(null);

  // Query bonus_prizes when modal opens
  useEffect(() => {
    if (!isOpen || !result || !contestId) {
      setBonusPrize(null);
      return;
    }

    const fetchBonusPrize = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('bonus_prizes')
          .select('id, title, description, detailed_description, image_url, amount, status')
          .eq('contest_id', contestId)
          .eq('ticket_position', result.ticket_number)
          .maybeSingle();

        if (error) {
          console.error('Error fetching bonus prize:', error);
          setBonusPrize(null);
        } else {
          setBonusPrize(data);
        }
      } catch (err) {
        console.error('Error in bonus prize query:', err);
        setBonusPrize(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBonusPrize();
  }, [isOpen, result, contestId]);

  // Reset ref when modal closes
  useEffect(() => {
    if (!isOpen) {
      winSoundPlayedForRef.current = null;
      generatedForTicketRef.current = null;
      // Clean up preview URL when modal closes
      if (previewImageUrl) {
        URL.revokeObjectURL(previewImageUrl);
      }
      setPreviewImageUrl(null);
      setPreviewBlob(null);
      setPublicShareUrl(null);
      setIsLoading(true);
    }
  }, [isOpen]);

  // Generate preview image and upload to storage when modal opens
  useEffect(() => {
    if (!isOpen || !result || isLoading) {
      return;
    }

    // Skip if already generated for this ticket
    if (generatedForTicketRef.current === result.ticket_number) {
      return;
    }

    const isBonusWinCheck = bonusPrize !== null;
    const isMainPrizeCheck = result.won_type === 'main' || result.won_main === true;
    const isPartnerOfferCheck = !!result.partner_offer;
    const isWinnerCheck = isBonusWinCheck || isMainPrizeCheck || isPartnerOfferCheck;

    // Sharing only for real wins (bonus physical, MioCoin, main prize, or partner offer).
    if (!isWinnerCheck) {
      return;
    }

    // Determine share-card kind, image, and Czech texts.
    let kind: ShareKind;
    let imageUrl: string | null = null;
    let fallbackImageUrl: string | null = null;
    let headline = 'Vyhrál jsem na OneMil';
    let prizeTitle = '';
    let bonusAmount: number | null = null;

    if (isPartnerOfferCheck && result.partner_offer) {
      kind = 'partner_offer';
      headline = 'Získal jsem speciální nabídku na OneMil';
      imageUrl = result.partner_offer.banner_url || null;
      fallbackImageUrl = result.partner_offer.logo_url || null;
      prizeTitle = result.partner_offer.title || result.partner_offer.partner_name || '';
    } else if (isMainPrizeCheck) {
      kind = 'main_prize';
      // No reliable main-prize image is available in this modal; keep clean fallback.
      imageUrl = null;
      prizeTitle = result.won_prize?.trim() || 'Hlavní výhra';
    } else if (isBonusWinCheck && bonusPrize) {
      if (bonusPrize.image_url) {
        kind = 'bonus_physical';
        imageUrl = bonusPrize.image_url;
      } else {
        kind = 'miocoin';
        imageUrl = miocoinLogo;
        bonusAmount = bonusPrize.amount ?? null;
      }
      prizeTitle = bonusPrizeDisplayName(bonusPrize, 'Bonusová výhra');
    } else {
      return;
    }

    const generateAndUpload = async () => {
      setIsGeneratingImage(true);
      setIsUploading(true);
      try {
        const blob = await generatePremiumShareCard({
          kind,
          imageUrl,
          fallbackImageUrl,
          headline,
          prizeTitle,
          bonusAmount,
        });
        
        // Revoke old URL before setting new one
        if (previewImageUrl) {
          URL.revokeObjectURL(previewImageUrl);
        }
        
        const url = URL.createObjectURL(blob);
        setPreviewImageUrl(url);
        setPreviewBlob(blob);
        
        // Mark as generated for this ticket
        generatedForTicketRef.current = result.ticket_number;

        // Veřejná sdílecí URL zůstává beze změny — `og-ticket-share` má vlastní
        // identifikátor `${contestId}-${ticket_number}`, není to UUID tiketu.
        const ticketShareId = `${contestId}-${result.ticket_number}`;
        // Upload obrázku naopak vyžaduje UUID řádku `tickets` (ověření vlastnictví).
        const ticketRowId = result.ticket_row_id ?? null;

        // Convert blob to base64 for upload
        const reader = new FileReader();
        reader.onloadend = () => {
          // Show share URL immediately; upload is fully background.
          setPublicShareUrl(
            `${supabaseUrl}/functions/v1/og-ticket-share?id=${encodeURIComponent(ticketShareId)}`
          );
          setIsUploading(false);

          const base64 = reader.result as string;

          if (!ticketRowId) {
            // Bez UUID tiketu nelze ověřit vlastnictví — upload bezpečně přeskočíme.
            console.warn('Upload skipped: missing ticket_row_id');
            return;
          }

          // Upload via edge function (non-blocking; no awaits)
          supabase.auth.getSession().then(({ data: sessionData }) => {
            const session = sessionData.session;

            fetch(`${supabaseUrl}/functions/v1/upload-ticket-share`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session?.access_token ?? ''}`,
              },
              body: JSON.stringify({
                ticketId: ticketRowId,
                imageBase64: base64,
              }),
            })
              .then((response) => {
                if (!response.ok) {
                  response.text().then((text) => {
                    console.warn('Upload failed:', text);
                  });
                  return;
                }

                response.json().then((data) => {
                  console.log('Image uploaded:', data.publicUrl);
                });
              })
              .catch((uploadErr) => {
                console.warn('Upload error:', uploadErr);
              });
          }).catch((err) => {
            console.warn('Upload error:', err);
          });
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.error('Error generating preview:', err);
        setIsUploading(false);
      } finally {
        setIsGeneratingImage(false);
      }
    };

    generateAndUpload();
  }, [isOpen, result, isLoading, bonusPrize, contestId]);

  // Memoize random message to prevent re-renders changing it
  const funnyMessage = useMemo(() => {
    return funnyMessages[Math.floor(Math.random() * funnyMessages.length)];
  }, [result?.ticket_number]);

  const handleClaimBonus = async () => {
    if (!bonusPrize || !user) return;
    
    setIsClaiming(true);
    try {
      const { error } = await supabase.rpc('claim_miocoin_bonus', {
        p_bonus_id: bonusPrize.id,
        p_user_id: user.id
      });

      if (error) {
        toast({
          title: 'Chyba',
          description: error.message || 'Nepodařilo se uplatnit výhru.',
          variant: 'destructive'
        });
        return;
      }

      toast({
        title: 'Výhra uplatněna!',
        description: 'MIO byla připsána na tvůj účet.'
      });

      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });

      onClose();
    } catch (err) {
      console.error('Error claiming bonus:', err);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se uplatnit výhru.',
        variant: 'destructive'
      });
    } finally {
      setIsClaiming(false);
    }
  };

  // Detection logic - use safe access since result can be null.
  // isBonusWin uses both the DB-fetched bonusPrize AND the RPC-returned won_type
  // as a fallback, so a race condition or empty bonus_prizes row never silently
  // hides the win celebration.
  const isBonusWin = bonusPrize !== null || result?.won_type === 'bonus';
  const isMainPrize = result?.won_type === 'main' || result?.won_main === true;
  // Partner offer assigned to this specific ticket → treated as special win type.
  const isPartnerOffer = !!result?.partner_offer;
  const isWinner = isBonusWin || isMainPrize || isPartnerOffer;
  const isBonusClaimed = bonusPrize?.status === 'won';

  /** Real win only — not “no prize” ticket purchase UI */
  const shouldCelebrateWin =
    isWinner && (isMainPrize || !isLoading);

  useEffect(() => {
    if (!isOpen || !result || isWinner || isLoading) {
      setLossRetentionNudge(null);
      return;
    }
    if (rollAlmostWinEffect()) {
      setLossRetentionNudge(pickRandomAlmostWinMessage());
    } else {
      setLossRetentionNudge(null);
    }
  }, [isOpen, result?.ticket_number, isWinner, isLoading]);

  useEffect(() => {
    if (!isOpen || !shouldCelebrateWin || !result) return;
    const key = `${contestId || 'c'}-${result.ticket_number}`;
    if (winSoundPlayedForRef.current === key) return;
    winSoundPlayedForRef.current = key;
    playWinChime();
  }, [isOpen, shouldCelebrateWin, contestId, result?.ticket_number]);

  // Keep keyboard / SR attention on the winning ticket (beat dialog auto-focus to close button)
  useLayoutEffect(() => {
    if (!isOpen || !shouldCelebrateWin) return;
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        prizeTitleFocusRef.current?.focus({ preventScroll: true });
      });
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [isOpen, shouldCelebrateWin, result?.ticket_number]);

  const prizeValueLine =
    !isMainPrize && bonusPrize?.amount != null && bonusPrize.amount > 0
      ? `${bonusPrize.amount.toLocaleString('cs-CZ')} MIO`
      : null;

  // Dominant win-ticket content — same source data the old per-branch blocks used
  // (bonusPrize / result.won_prize / result.partner_offer), just consolidated so
  // the winning ticket can show image + real name + prize type in one place.
  const winKind: 'bonus' | 'main' | 'partner' | null =
    isBonusWin && bonusPrize ? 'bonus' : isMainPrize ? 'main' : (isPartnerOffer && result?.partner_offer) ? 'partner' : null;

  const winImage: string | null =
    winKind === 'bonus'
      ? (bonusPrize?.image_url || ((bonusPrize?.amount && bonusPrize.amount > 0) ? miocoinLogo : null))
      : winKind === 'partner'
        ? (result?.partner_offer?.banner_url ?? result?.partner_offer?.logo_url ?? null)
        : null;

  const winTypeLabel: string =
    winKind === 'main'
      ? 'Hlavní výhra ze soutěže'
      : winKind === 'bonus'
        ? ((bonusPrize?.amount && bonusPrize.amount > 0) ? 'MIO' : 'Bonusová výhra ze soutěže')
        : winKind === 'partner'
          ? 'Speciální nabídka od partnera'
          : '';

  const winName: string =
    winKind === 'main'
      ? (result?.won_prize?.trim() || 'Hlavní výhra')
      : winKind === 'bonus'
        ? bonusPrizeDisplayName(bonusPrize, 'Bonusová výhra')
        : winKind === 'partner'
          ? (result?.partner_offer?.title || result?.partner_offer?.partner_name || 'Speciální nabídka')
          : '';

  // Popis bonusové výhry na ticketu — jen když nese jinou informaci než
  // winName výše (bez title fallback na description by se stejný text
  // zobrazil dvakrát pod sebou).
  const bonusDescriptionText: string | null =
    bonusPrize?.detailed_description ||
    (bonusPrize?.amount && bonusPrize.amount > 0 ? null : bonusPrize?.description) ||
    null;

  // Distance to the nearest real contest prize (bonus or main), excluding partner offers.
  // distance_to_next_bonus = next pending bonus_prizes position minus purchased ticket number (from RPC).
  // remaining_tickets      = ticket_count minus purchased ticket number = distance to main prize (from RPC).
  const nearestPrizeDistance = useMemo(() => {
    if (!result || isWinner) return null;
    const dtb = typeof result.distance_to_next_bonus === 'number' && result.distance_to_next_bonus > 0
      ? result.distance_to_next_bonus : null;
    const rem = typeof result.remaining_tickets === 'number' && result.remaining_tickets > 0
      ? result.remaining_tickets : null;
    if (dtb !== null && rem !== null) return Math.min(dtb, rem);
    return dtb ?? rem ?? null;
  }, [result, isWinner]);

  // Dynamic share text based on result — no ticket number
  const getShareText = () => {
    if (isWinner) {
      return `Vyhrál jsem na OneMil 🎉🎟️ Zkus štěstí taky 👉 onemil.cz`;
    }
    const motivationalPart = nearestPrizeDistance !== null
      ? nextWinTicketText(nearestPrizeDistance)
      : 'Další výhra může být blíž, než si myslíš.';
    return `Zahrál jsem si na OneMil 🎟️ ${motivationalPart} 👉 onemil.cz`;
  };

  /** Text copied by „Sdílet výhru“ — short viral hook + CTA (clipboard only) */
  const getWinRetentionShareText = () => {
    if (!isWinner || !result) return '';
    const ticket = result.ticket_number.toLocaleString('cs-CZ');
    if (isMainPrize) {
      const prize = result.won_prize?.trim() || 'hlavní výhru';
      return `🔥 Vyhrál jsem „${prize}“ na OneMil! Zkus štěstí taky → onemil.cz · ticket #${ticket}`;
    }
    if (bonusPrize) {
      // U MIO výhry už název nese částku („500 MIO“).
      const name = bonusPrizeDisplayName(bonusPrize, 'bonus');
      return `🎯 Trefa na OneMil: ${name}! Hraj i ty → onemil.cz · #${ticket}`;
    }
    return getShareText();
  };

  const handleCopyWinShare = async () => {
    const text = getWinRetentionShareText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Zkopírováno',
        description: 'Text výhry je ve schránce — vlož ho kam chceš.',
      });
    } catch {
      toast({
        title: 'Kopírování se nepovedlo',
        description: 'Zkopíruj text ručně nebo zkontroluj oprávnění prohlížeče.',
        variant: 'destructive',
      });
    }
  };

  const handleShare = (platform: 'facebook' | 'instagram' | 'tiktok' | 'x') => {
    const shareText = getShareText();
    
    // For FB/X, we need the public share URL
    if ((platform === 'facebook' || platform === 'x') && !publicShareUrl) {
      toast({
        title: 'Čekejte',
        description: 'Obrázek se nahrává...',
      });
      return;
    }

    if (!previewBlob) {
      toast({
        title: 'Chyba',
        description: 'Obrázek ještě není připraven.',
        variant: 'destructive'
      });
      return;
    }

    switch (platform) {
      case 'facebook':
        // Open public share page URL (with OG tags)
        window.open(
          `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicShareUrl!)}`,
          '_blank',
          'width=600,height=400'
        );
        break;
      case 'instagram':
        downloadImage(previewBlob);
        toast({
          title: 'Obrázek stažen',
          description: 'Nahraj ručně do IG/TikTok.'
        });
        break;
      case 'tiktok':
        downloadImage(previewBlob);
        toast({
          title: 'Obrázek stažen',
          description: 'Nahraj ručně do IG/TikTok.'
        });
        break;
      case 'x':
        // Open public share page URL (with OG tags)
        window.open(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(publicShareUrl!)}`,
          '_blank',
          'width=600,height=400'
        );
        break;
    }
  };

  const downloadImage = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `onemil-ticket-${result?.ticket_number ?? 0}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCard = () => {
    if (!previewBlob) {
      toast({
        title: 'Chyba',
        description: 'Obrázek ještě není připraven.',
        variant: 'destructive'
      });
      return;
    }
    downloadImage(previewBlob);
    toast({
      title: 'Staženo!',
      description: 'Obrázek ticketu byl uložen.'
    });
  };

  const handleGoToWins = () => {
    navigate('/wins');
    onClose();
  };

  const handlePlayAgain = () => {
    onClose();
    if (contestId) {
      navigate(`/contest/${contestId}`);
    } else {
      navigate('/games');
    }
  };

  // Always render Dialog to prevent mount/unmount flicker in React StrictMode
  // Control visibility via isOpen && result !== null
  return (
    <Dialog open={isOpen && result !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        onOpenAutoFocus={(e) => {
          if (shouldCelebrateWin) {
            e.preventDefault();
          }
        }}
        className="w-[calc(100vw-1.5rem)] max-w-2xl max-h-[92vh] overflow-y-auto overflow-x-hidden rounded-[20px] border border-[#F4D6AD] bg-[#FFF9F0] p-0 text-[#111827] shadow-[0_28px_100px_rgba(81,49,10,0.28)] data-[state=open]:duration-[280ms] data-[state=closed]:duration-[280ms]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>
            {isWinner ? `Vyhrál jsi: ${winName}` : 'Výsledek ticketu'}
          </DialogTitle>
        </DialogHeader>

        {shouldCelebrateWin && result && (
          <div
            key={`win-flash-${contestId}-${result.ticket_number}`}
            className="win-moment-screen-flash"
            aria-hidden
          />
        )}

        {shouldCelebrateWin && (
          <Confetti
            width={width}
            height={height}
            recycle={false}
            numberOfPieces={isMainPrize ? 520 : 220}
            gravity={isMainPrize ? 0.18 : 0.32}
            colors={
              isMainPrize
                ? ['#FFD700', '#FFA500', '#FF4500', '#DC143C', '#8A2BE2', '#FFF8DC']
                : (isPartnerOffer && !isBonusWin)
                  ? ['#60A5FA', '#818CF8', '#A78BFA', '#34D399', '#F472B6']
                  : ['#FDE047', '#A78BFA', '#38BDF8', '#FB923C', '#F472B6']
            }
            style={{ zIndex: 120, pointerEvents: 'none' }}
          />
        )}

        {/* Explicit close button */}
        <button
          type="button"
          aria-label="Zavřít"
          onClick={() => onClose()}
          className="absolute right-4 top-4 z-[200] flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-[#7A5230] ring-1 ring-[#F4D6AD] backdrop-blur transition hover:bg-white hover:text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#F97316]/60"
        >
          <X className="h-5 w-5" />
        </button>

        {/* ── Hero reveal — real generated Aurora Ignition footage, not CSS ── */}
        <div className="relative h-56 w-full animate-in fade-in zoom-in-95 duration-500 overflow-hidden rounded-t-[20px] bg-[#FFF9F0] sm:h-64">
          <img
            src={logoOnemil}
            alt="OneMil"
            className="absolute left-4 top-4 z-10 h-6 w-auto object-contain drop-shadow-[0_1px_4px_rgba(255,255,255,0.9)] sm:h-7"
          />

          {isWinner ? (
            shouldCelebrateWin ? (
              <video
                key={`aurora-win-${contestId}-${result?.ticket_number}`}
                src={auroraWinVideo}
                poster={auroraWinPoster}
                autoPlay
                muted
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <img src={auroraWinPoster} alt="" className="absolute inset-0 h-full w-full object-cover" />
            )
          ) : (
            <img
              src={auroraIdle}
              alt=""
              className="absolute inset-0 h-full w-full animate-[pulse_3.4s_ease-in-out_infinite] object-cover"
            />
          )}

          <div
            ref={prizeTitleFocusRef}
            tabIndex={-1}
            className="win-moment-prize-title absolute inset-x-0 bottom-0 animate-in fade-in slide-in-from-bottom-3 duration-700 bg-gradient-to-t from-[#FFF9F0] via-[#FFF9F0]/75 to-transparent px-5 pb-4 pt-10 text-center outline-none"
          >
            {isWinner ? (
              <>
                <p className="win-moment-win-headline text-base font-extrabold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-[#FF8A00] to-[#FFB547] sm:text-lg">
                  {winKind === 'partner' ? '🎁 SPECIÁLNÍ NABÍDKA!' : '🎉 GRATULUJEME!'}
                </p>
                {winKind !== 'partner' && (
                  <p className="text-2xl font-black leading-none text-[#111827] sm:text-3xl">
                    VYHRÁL JSI!
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="font-heading text-xl font-black leading-tight tracking-tight text-[#111827] sm:text-2xl">
                  TENTOKRÁT <span className="text-[#F97316]">BEZ VÝHRY</span>
                </p>
                <p className="font-heading text-sm font-black text-[#111827] sm:text-base">
                  Ale jsi stále ve hře!
                </p>
              </>
            )}
          </div>
        </div>

        <div className="relative p-5 sm:p-6">
          {isWinner ? (
            <>
              {/* ── Prize detail — schválený ticket/voucher objekt, sdílený
                    napříč všemi výsledkovými stavy (VoucherTicketFrame) ── */}
              <VoucherTicketFrame
                testId="ticket-result-prize"
                animationDelayMs={150}
                main={
                  <>
                    <p className={voucherTicketText.eyebrow}>{winTypeLabel}</p>
                    <p data-testid="ticket-result-prize-name" className={voucherTicketText.title}>
                      {winName}
                    </p>
                    {winKind === 'bonus' && bonusDescriptionText && bonusDescriptionText !== winName && (
                      <p className={voucherTicketText.description}>
                        {bonusDescriptionText}
                      </p>
                    )}
                    {winKind === 'partner' && result?.partner_offer?.short_text && (
                      <p className={voucherTicketText.description}>{result.partner_offer.short_text}</p>
                    )}
                  </>
                }
                stub={
                  prizeValueLine ? (
                    <p data-testid="ticket-result-prize-value" className={voucherTicketText.stubValue}>
                      {prizeValueLine}
                    </p>
                  ) : winImage ? (
                    <img
                      src={winImage}
                      alt={winName}
                      className="h-[65%] w-auto max-w-[85%] rounded-lg object-contain drop-shadow-[0_4px_10px_rgba(91,57,16,0.2)]"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : undefined
                }
              />

              {winKind === 'partner' && result?.partner_offer && (
                <div className="mt-3 animate-in fade-in duration-700 [animation-delay:250ms] fill-mode-both text-center">
                  {result.partner_offer.valid_to && (
                    <p className="mt-1 text-xs text-[#94A3B8]">
                      Platná do: {new Date(result.partner_offer.valid_to).toLocaleDateString('cs-CZ')}
                    </p>
                  )}
                  <p className="mt-2 text-[11px] font-semibold uppercase text-[#9A6B2E]">
                    Nabídka je uložena v tvých{' '}
                    <span className="text-[#F97316]">výhrách → Nabídky</span>
                  </p>
                </div>
              )}

              {/* Bonus win: distance to the NEXT winning ticket after this one */}
              {winKind === 'bonus' && result?.distance_to_next_bonus != null && result.distance_to_next_bonus > 0 && (() => {
                const nextN = Math.min(
                  result.distance_to_next_bonus,
                  typeof result.remaining_tickets === 'number' && result.remaining_tickets > 0
                    ? result.remaining_tickets
                    : result.distance_to_next_bonus
                );
                return (
                  <div className="mt-3 animate-in fade-in slide-in-from-bottom-3 duration-700 [animation-delay:300ms] fill-mode-both rounded-2xl border border-[#FFD69E] bg-white/75 px-5 py-3 text-center shadow-[0_12px_30px_rgba(249,115,22,0.12)]">
                    <p className="text-sm text-[#111827]">
                      {nextN === 1 ? (
                        <>Další výherní ticket čeká už při dalším tahu.</>
                      ) : (
                        <>
                          Další výherní ticket čeká už za{' '}
                          <span className="font-bold text-[#F97316]">
                            {nextN.toLocaleString('cs-CZ')}
                          </span>
                          {' '}{tahPlural(nextN)}.
                        </>
                      )}
                    </p>
                    <p className="mt-1 text-[11px] text-[#94A3B8]">{NEXT_WIN_EXPLAINER}</p>
                  </div>
                );
              })()}

              {/* ── Actions (secondary to the ticket above) ────────────────── */}
              <div className="mt-6 animate-in fade-in slide-in-from-bottom-2 duration-700 [animation-delay:400ms] fill-mode-both space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    onClick={handlePlayAgain}
                    className="win-moment-cta-play-again w-full border-0 font-bold shadow-lg bg-gradient-to-r from-[#FF8A00] via-[#FFB547] to-[#FF8A00] text-black hover:brightness-110"
                  >
                    Hrát znovu
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGoToWins}
                    className="w-full font-semibold border-[#F4D6AD] bg-white text-[#111827] hover:bg-[#FFF4E8]"
                  >
                    {winKind === 'partner' ? 'Zobrazit nabídku' : 'Zobrazit výhru'}
                  </Button>
                </div>

                {winKind === 'bonus' && !isBonusClaimed && (
                  <Button
                    type="button"
                    onClick={handleClaimBonus}
                    disabled={isClaiming || !user}
                    className="w-full"
                  >
                    {isClaiming ? 'Uplatňuji...' : 'Uplatnit výhru'}
                  </Button>
                )}

                {/* Sharing is secondary — compact row, never a large preview competing with the ticket */}
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyWinShare}
                    className="h-9 gap-1.5 text-[#C26A00] hover:bg-[#FFF4E8] hover:text-[#F97316]"
                  >
                    <Share2 className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                    Sdílet výhru
                    {isUploading && <span className="text-[10px] opacity-70">(nahrávám…)</span>}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-full border-[#F4D6AD] bg-white hover:bg-[#FFF4E8]"
                    onClick={() => handleShare('facebook')}
                    disabled={isGeneratingImage || isUploading || !publicShareUrl}
                    title={isUploading ? 'Nahrávám obrázek...' : 'Sdílet na Facebook'}
                  >
                    <Facebook className="h-4 w-4 text-[#1877F2]" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-full border-[#F4D6AD] bg-white hover:bg-[#FFF4E8]"
                    onClick={() => handleShare('instagram')}
                    disabled={isGeneratingImage || !previewBlob}
                    title="Sdílet na Instagram"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="url(#instagram-gradient-compact)">
                      <defs>
                        <linearGradient id="instagram-gradient-compact" x1="0%" y1="100%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#FFDC80" />
                          <stop offset="25%" stopColor="#FCAF45" />
                          <stop offset="50%" stopColor="#F77737" />
                          <stop offset="75%" stopColor="#F56040" />
                          <stop offset="100%" stopColor="#C13584" />
                        </linearGradient>
                      </defs>
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-full border-[#F4D6AD] bg-white hover:bg-[#FFF4E8]"
                    onClick={() => handleShare('tiktok')}
                    disabled={isGeneratingImage || !previewBlob}
                    title="Sdílet na TikTok"
                  >
                    <svg className="h-4 w-4 text-[#111827]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                    </svg>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-full border-[#F4D6AD] bg-white hover:bg-[#FFF4E8]"
                    onClick={() => handleShare('x')}
                    disabled={isGeneratingImage || isUploading || !publicShareUrl}
                    title={isUploading ? 'Nahrávám obrázek...' : 'Sdílet na X'}
                  >
                    <svg className="h-3.5 w-3.5 text-[#111827]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-full border-[#F4D6AD] bg-white hover:bg-[#FFF4E8]"
                    onClick={handleDownloadCard}
                    disabled={isGeneratingImage || !previewBlob}
                    title="Stáhnout obrázek"
                  >
                    <Download className="h-4 w-4 text-[#111827]" />
                  </Button>
                </div>
              </div>
            </>
          ) : isLoading ? (
            <div className="mt-6 py-10 text-center">
              <div className="text-4xl">⏳</div>
              <p className="mt-2 text-lg font-medium text-[#111827]">Kontroluji výhru...</p>
            </div>
          ) : (
            <>
              {/* ── Retention copy + next-win panel (headline lives in the hero above) ── */}
              <p className="animate-in fade-in slide-in-from-bottom-2 duration-700 [animation-delay:150ms] fill-mode-both text-center text-sm text-[#4B5563]">{funnyMessage}</p>
              {lossRetentionNudge && (
                <p className="mt-1 animate-in fade-in duration-700 [animation-delay:200ms] fill-mode-both text-center text-sm font-medium text-[#9A6B2E]">{lossRetentionNudge}</p>
              )}

              <div className="mt-4 animate-in fade-in slide-in-from-bottom-3 duration-700 [animation-delay:300ms] fill-mode-both">
                <VoucherTicketFrame
                  testId="ticket-result-nowin"
                  animationDelayMs={0}
                  main={
                    <>
                      <p className={voucherTicketText.title}>
                        {nearestPrizeDistance !== null ? (
                          nearestPrizeDistance === 1 ? (
                            <>Další výherní ticket čeká už při dalším tahu.</>
                          ) : (
                            <>Další výherní ticket čeká už za {nearestPrizeDistance.toLocaleString('cs-CZ')} {tahPlural(nearestPrizeDistance)}.</>
                          )
                        ) : (
                          'Další výhra může být blíž, než si myslíš.'
                        )}
                      </p>
                      {nearestPrizeDistance !== null && (
                        <p className={voucherTicketText.description}>{NEXT_WIN_EXPLAINER}</p>
                      )}
                    </>
                  }
                  stub={
                    nearestPrizeDistance !== null ? (
                      <p data-testid="ticket-result-nowin-distance" className={voucherTicketText.stubValue}>
                        {nearestPrizeDistance.toLocaleString('cs-CZ')} {tahPlural(nearestPrizeDistance)}
                      </p>
                    ) : undefined
                  }
                />

                {nearestPrizeDistance !== null && nearestPrizeDistance <= 4 && (() => {
                  const completedSteps = Math.min(Math.trunc(nearestPrizeDistance), 4);
                  return (
                    <div aria-hidden="true" className="relative mt-4 grid grid-cols-5 items-center px-2">
                      <span className="absolute left-[10%] right-[10%] top-1/2 h-[2px] -translate-y-1/2 bg-[#F1E3D2]" />
                      <span
                        className="absolute left-[10%] top-1/2 h-[2px] -translate-y-1/2 bg-[#FF8A00]"
                        style={{ width: `${completedSteps * 20}%` }}
                      />
                      {Array.from({ length: 5 }, (_, index) => {
                        const isDone = index < completedSteps;
                        const isCurrent = index === completedSteps;
                        return (
                          <span
                            key={index}
                            className={cn(
                              'relative z-10 mx-auto flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                              isDone
                                ? 'bg-[#FF8A00] text-white shadow-[0_4px_10px_rgba(249,115,22,0.25)]'
                                : isCurrent
                                  ? 'border border-[#FFB35C] bg-white text-[#F97316]'
                                  : 'border border-[#E8DED2] bg-[#FAF8F5] text-[#C9C0B7]'
                            )}
                          >
                            {index + 1}
                          </span>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              <Button
                type="button"
                onClick={onClose}
                className="mt-6 h-12 w-full animate-in fade-in slide-in-from-bottom-2 duration-700 [animation-delay:400ms] fill-mode-both rounded-full text-base font-bold bg-gradient-to-b from-[#F6A63A] via-[#E47B0A] to-[#C35A00] text-white shadow-[0_8px_20px_rgba(180,82,0,0.3)] hover:brightness-105"
              >
                Pokračovat <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
