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
import { Facebook, Download, Share2, X } from 'lucide-react';
import logoOnemil from '@/assets/logo-onemil.png';
import miocoinLogo from '@/assets/miocoin.png';
import { cn } from '@/lib/utils';
import { playWinChime } from '@/lib/playWinChime';
import { pickRandomAlmostWinMessage, rollAlmostWinEffect } from '@/lib/retentionLocal';
import './TicketResultModal.css';

// Preload logo image
const loadLogoImage = (): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = logoOnemil;
  });
};

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
  "Každý tiket tě přibližuje k výhře! 🎪",
  "Neúspěch je jen začátek úspěchu! 🌟"
];

// Generate ticket card image using Canvas API
const generateTicketCard = async (
  ticketNumber: number,
  isWinner: boolean,
  isMainPrize: boolean,
  bonusAmount: number | null,
  remainingTickets: number | undefined
): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Cannot get canvas context');
  }

  // Card dimensions (1200x630 for optimal OG preview)
  canvas.width = 1200;
  canvas.height = 630;

  // Dark premium gradient background
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#0a0a0a');
  gradient.addColorStop(0.5, '#1a1a2e');
  gradient.addColorStop(1, '#16213e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Decorative border
  ctx.strokeStyle = isWinner ? '#ffd700' : '#333';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

  // Inner glow for winners
  if (isWinner) {
    const glowGradient = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0,
      canvas.width / 2, canvas.height / 2, 400
    );
    glowGradient.addColorStop(0, 'rgba(255, 215, 0, 0.15)');
    glowGradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = glowGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Draw OneMil Logo
  try {
    const logoImg = await loadLogoImage();
    const logoHeight = 70;
    const logoWidth = (logoImg.width / logoImg.height) * logoHeight;
    ctx.drawImage(logoImg, (canvas.width - logoWidth) / 2, 40, logoWidth, logoHeight);
  } catch (err) {
    // Fallback to text if logo fails to load
    ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('OneMil', canvas.width / 2, 80);
  }

  // Subtitle
  ctx.font = '20px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#888';
  ctx.textAlign = 'center';
  ctx.fillText('Zkus štěstí a vyhraj!', canvas.width / 2, 130);

  // Result emoji
  const emoji = isMainPrize ? '🏆' : isWinner ? '🎉' : '🎟️';
  ctx.font = '120px system-ui, -apple-system, sans-serif';
  ctx.fillText(emoji, canvas.width / 2, 275);

  // Result text
  ctx.font = 'bold 42px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = isMainPrize ? '#ffd700' : isWinner ? '#22c55e' : '#ffffff';
  const resultText = isMainPrize 
    ? 'HLAVNÍ VÝHRA!' 
    : isWinner 
      ? 'VÝHRA!' 
      : 'Zkusil jsem štěstí!';
  ctx.fillText(resultText, canvas.width / 2, 355);

  // Ticket number
  ctx.font = 'bold 64px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Ticket #${ticketNumber.toLocaleString('cs-CZ')}`, canvas.width / 2, 435);

  // Bonus amount if winner
  if (isWinner && bonusAmount && bonusAmount > 0) {
    ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`+${bonusAmount.toLocaleString('cs-CZ')} MioCoinů`, canvas.width / 2, 495);
  }

  // Footer with URL
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#666';
  ctx.fillText('👉 onemil.cz', canvas.width / 2, 600);

  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create blob'));
      }
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
  const prizeTitleFocusRef = useRef<HTMLHeadingElement>(null);
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
    const isWinnerCheck = isBonusWinCheck || isMainPrizeCheck;

    const generateAndUpload = async () => {
      setIsGeneratingImage(true);
      setIsUploading(true);
      try {
        const blob = await generateTicketCard(
          result.ticket_number,
          isWinnerCheck,
          isMainPrizeCheck,
          bonusPrize?.amount || null,
          result.remaining_tickets
        );
        
        // Revoke old URL before setting new one
        if (previewImageUrl) {
          URL.revokeObjectURL(previewImageUrl);
        }
        
        const url = URL.createObjectURL(blob);
        setPreviewImageUrl(url);
        setPreviewBlob(blob);
        
        // Mark as generated for this ticket
        generatedForTicketRef.current = result.ticket_number;

        // Generate unique ticket ID for sharing
        const ticketShareId = `${contestId}-${result.ticket_number}`;

        // Convert blob to base64 for upload
        const reader = new FileReader();
        reader.onloadend = () => {
          // Show share URL immediately; upload is fully background.
          setPublicShareUrl(
            `https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/og-ticket-share?id=${encodeURIComponent(
              ticketShareId
            )}`
          );
          setIsUploading(false);

          const base64 = reader.result as string;

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
                ticketId: ticketShareId,
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
        description: 'MioCoiny byly připsány na tvůj účet.'
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

  const particleSpec = useMemo(() => {
    if (!shouldCelebrateWin) return [];
    return Array.from({ length: 42 }, (_, i) => ({
      id: i,
      left: `${((i * 17 + (i % 7) * 11) % 100)}%`,
      delay: `${((i * 0.09) % 2.2).toFixed(2)}s`,
      duration: `${5.5 + (i % 6) * 0.45}s`,
      color:
        i % 4 === 0
          ? 'hsl(43 95% 62%)'
          : i % 4 === 1
            ? 'hsl(265 82% 68%)'
            : i % 4 === 2
              ? 'hsl(195 90% 62%)'
              : 'hsl(25 95% 58%)',
    }));
  }, [shouldCelebrateWin, result?.ticket_number]);

  useEffect(() => {
    if (!isOpen || !shouldCelebrateWin || !result) return;
    const key = `${contestId || 'c'}-${result.ticket_number}`;
    if (winSoundPlayedForRef.current === key) return;
    winSoundPlayedForRef.current = key;
    playWinChime();
  }, [isOpen, shouldCelebrateWin, contestId, result?.ticket_number]);

  const prizeHeadline = isMainPrize
    ? (result?.won_prize?.trim() || 'Hlavní výhra')
    : (isBonusWin && bonusPrize)
      ? (bonusPrize.title?.trim() || bonusPrize.description || 'Bonusová výhra')
      : isPartnerOffer
        ? 'Gratulujeme!'
        : '';

  // Keep keyboard / SR attention on the prize title (beat dialog auto-focus to close button)
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
  }, [isOpen, shouldCelebrateWin, result?.ticket_number, prizeHeadline]);

  const prizeValueLine =
    !isMainPrize && bonusPrize?.amount != null && bonusPrize.amount > 0
      ? `${bonusPrize.amount.toLocaleString('cs-CZ')} MioCoinů`
      : null;

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

  // Dynamic share text based on result
  const getShareText = () => {
    if (isWinner) {
      return `Vyhrál jsem na OneMil 🎉🎟️ Ticket #${result?.ticket_number?.toLocaleString('cs-CZ') ?? ''}. Zkus štěstí taky 👉 onemil.cz`;
    }
    return `Zahrál jsem si na OneMil 🎟️ Ticket #${result?.ticket_number?.toLocaleString('cs-CZ') ?? ''}. Každý ticket tě blíží k výhře 👉 onemil.cz`;
  };

  /** Text copied by „Sdílet výhru“ — short viral hook + CTA (clipboard only) */
  const getWinRetentionShareText = () => {
    if (!isWinner || !result) return '';
    const ticket = result.ticket_number.toLocaleString('cs-CZ');
    if (isMainPrize) {
      const prize = result.won_prize?.trim() || 'hlavní výhru';
      return `🔥 Vyhrál jsem „${prize}“ na OneMil! Zkus štěstí taky → onemil.cz · tiket #${ticket}`;
    }
    if (bonusPrize) {
      const name = bonusPrize.title?.trim() || bonusPrize.description || 'bonus';
      const coins =
        bonusPrize.amount && bonusPrize.amount > 0
          ? ` +${bonusPrize.amount.toLocaleString('cs-CZ')} MC`
          : '';
      return `🎯 Trefa na OneMil: ${name}${coins}! Hraj i ty → onemil.cz · #${ticket}`;
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
      description: 'Obrázek tiketu byl uložen.'
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
        className={cn(
          'data-[state=open]:duration-[280ms] data-[state=closed]:duration-[280ms]',
          shouldCelebrateWin
            ? 'fixed left-1/2 top-1/2 z-[100] flex max-h-[min(calc(100dvh-2rem),56rem)] w-[min(calc(100vw-2rem),64rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-2xl border border-yellow-500/40 bg-[#050810] p-0 shadow-[0_0_100px_rgba(255,190,60,0.25)]'
            : 'sm:max-w-md rounded-2xl border border-yellow-500/40 bg-gradient-to-b from-[#0b1220] via-[#0f1b33] to-[#0a1428] shadow-[0_0_40px_rgba(255,200,0,0.15)]'
        )}
      >
        {/* Explicit close button — sits above confetti / glow layers so X always works */}
        <button
          type="button"
          aria-label="Zavřít"
          onClick={() => onClose()}
          className="absolute right-4 top-4 z-[200] flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white/90 ring-1 ring-white/20 backdrop-blur transition hover:bg-black/80 hover:text-white focus:outline-none focus:ring-2 focus:ring-amber-400/70"
        >
          <X className="h-5 w-5" />
        </button>

        {shouldCelebrateWin && result && (
          <div
            key={`win-flash-${contestId}-${result.ticket_number}`}
            className="win-moment-screen-flash"
            aria-hidden
          />
        )}

        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col',
            shouldCelebrateWin &&
              'relative z-10 w-full overflow-hidden px-4 md:px-6'
          )}
        >
        {shouldCelebrateWin && (
          <div className="relative flex min-h-[min(42vh,380px)] shrink-0 flex-col items-center justify-center overflow-hidden px-0 pb-6 pt-10">
            <div
              className="win-moment-glow-orb -left-1/4 h-[min(55vw,420px)] w-[min(55vw,420px)] bg-[radial-gradient(circle,hsl(43_90%_55%/0.55)_0%,transparent_70%)]"
              style={{ top: '8%' }}
            />
            <div
              className="win-moment-glow-orb -right-1/4 h-[min(45vw,340px)] w-[min(45vw,340px)] bg-[radial-gradient(circle,hsl(280_70%_55%/0.4)_0%,transparent_70%)]"
              style={{ top: '20%', animationDelay: '0.5s' }}
            />
            <div
              className="win-moment-glow-orb left-1/2 h-[min(70vw,520px)] w-[min(70vw,520px)] -translate-x-1/2 bg-[radial-gradient(circle,hsl(200_85%_50%/0.35)_0%,transparent_65%)]"
              style={{ bottom: '-25%', animationDelay: '1s' }}
            />

            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {particleSpec.map((p) => (
                <span
                  key={p.id}
                  className="win-moment-particle"
                  style={{
                    left: p.left,
                    color: p.color,
                    animationDelay: p.delay,
                    animationDuration: p.duration,
                  }}
                />
              ))}
            </div>

            <div className="relative z-20 mx-auto max-w-lg px-2 text-center">
              <p
                id="win-moment-shout"
                className="win-moment-win-headline mb-3 text-center text-2xl font-black uppercase tracking-[0.08em] text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-yellow-300 to-amber-200 drop-shadow-[0_0_28px_rgba(250,210,80,0.55)] md:text-3xl md:tracking-[0.12em]"
              >
                {isPartnerOffer && !isBonusWin && !isMainPrize ? '🎁 SPECIÁLNÍ NABÍDKA!' : '🎉 VYHRÁL JSI!'}
              </p>
              <h2
                ref={prizeTitleFocusRef}
                tabIndex={-1}
                aria-describedby="win-moment-shout"
                className={cn(
                  'win-moment-prize-title text-balance text-3xl font-black leading-tight text-white drop-shadow-[0_0_24px_rgba(250,204,21,0.35)] md:text-4xl',
                  'outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-4 focus-visible:ring-offset-[#050810]'
                )}
              >
                {prizeHeadline}
              </h2>
              {prizeValueLine && (
                <p
                  className={cn(
                    'mt-4 text-2xl font-bold md:text-3xl',
                    !isMainPrize && 'win-moment-value-shimmer',
                    isMainPrize && 'text-amber-100/90'
                  )}
                >
                  {prizeValueLine}
                </p>
              )}
            </div>
          </div>
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

        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col',
            shouldCelebrateWin && 'win-moment-deferred-content overflow-y-auto pb-6 pt-2'
          )}
        >
          <DialogHeader className={cn(shouldCelebrateWin && 'px-0')}>
            <DialogTitle
              className={cn(
                'text-center text-xl',
                shouldCelebrateWin && 'sr-only'
              )}
            >
              {shouldCelebrateWin ? 'Výhra' : isWinner ? 'Výhra! 🎉' : 'Výsledek tiketu'}
            </DialogTitle>
          </DialogHeader>

        <div className={cn('space-y-4 py-4', shouldCelebrateWin && 'rounded-2xl border border-amber-500/20 bg-[hsl(220_30%_8%/0.85)] px-3 py-5 sm:px-5')}>
          {isWinner ? (
            isBonusWin && bonusPrize ? (
              <div className="text-center space-y-4">
                {!shouldCelebrateWin ? (
                  <>
                    <div className="text-6xl">🎉</div>
                    <p className="text-lg font-semibold text-green-600">
                      Gratulujeme, vyhrál jsi bonus: {bonusPrize.title || bonusPrize.description}
                    </p>
                    {bonusPrize.amount && bonusPrize.amount > 0 && (
                      <p className="text-md text-muted-foreground">
                        MioCoin:{' '}
                        <span className="font-semibold text-primary">
                          {bonusPrize.amount.toLocaleString('cs-CZ')}
                        </span>
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm font-medium text-emerald-400/95">Gratulujeme k výhře!</p>
                )}
                {/* Bonus prize image (or MioCoin logo for MioCoin prizes) */}
                <div className="flex justify-center">
                  <img
                    src={
                      bonusPrize.image_url
                        ? bonusPrize.image_url
                        : (bonusPrize.amount && bonusPrize.amount > 0)
                          ? miocoinLogo
                          : (bonusPrize.image_url ?? miocoinLogo)
                    }
                    alt={bonusPrize.title || bonusPrize.description || 'Bonusová výhra'}
                    className="max-h-40 w-auto object-contain rounded-xl"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
                {/* Bonus prize description */}
                {(bonusPrize.detailed_description || bonusPrize.description) && (
                  <p className="text-sm text-amber-100/90 whitespace-pre-line max-w-md mx-auto">
                    {bonusPrize.detailed_description || bonusPrize.description}
                  </p>
                )}
                {result?.distance_to_next_bonus != null && result.distance_to_next_bonus > 0 && (
                  <div className="mx-auto max-w-[320px] rounded-full border border-[hsl(43_70%_50%/0.25)] bg-[hsl(220_40%_13%)] px-5 py-3 text-center">
                    <p className="text-sm text-amber-100/80">
                      Nejbližší výhra může být už za{' '}
                      <span className="font-bold bg-gradient-to-r from-[hsl(43_80%_65%)] to-[hsl(35_90%_55%)] bg-clip-text text-transparent">
                        {(Math.min(
                          result.distance_to_next_bonus,
                          typeof result.remaining_tickets === 'number' && result.remaining_tickets > 0
                            ? result.remaining_tickets
                            : result.distance_to_next_bonus
                        )).toLocaleString('cs-CZ')}
                      </span>
                      {' '}tahů.
                    </p>
                  </div>
                )}
                <p className="win-moment-cta-hint -mb-1 text-center text-[11px] font-semibold uppercase text-amber-200/75 sm:text-xs">
                  Štěstí frčí —{' '}
                  <span className="text-amber-100">hrát znovu</span> je nejrychlejší cesta k další výhře
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    onClick={handlePlayAgain}
                    className={cn(
                      'win-moment-cta-play-again w-full border-0 font-bold shadow-lg',
                      'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 text-black hover:brightness-110'
                    )}
                  >
                    Hrát znovu
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGoToWins}
                    className="w-full font-semibold border-amber-500/40"
                  >
                    Zobrazit výhru
                  </Button>
                </div>
                <div className="flex justify-center pt-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyWinShare}
                    className="h-9 gap-1.5 text-amber-200/95 hover:bg-amber-500/10 hover:text-amber-50"
                  >
                    <Share2 className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                    Sdílet výhru
                  </Button>
                </div>
                {!isBonusClaimed && (
                  <Button
                    type="button"
                    onClick={handleClaimBonus}
                    disabled={isClaiming || !user}
                    className="w-full mt-1"
                  >
                    {isClaiming ? 'Uplatňuji...' : 'Uplatnit výhru'}
                  </Button>
                )}
              </div>
            ) : isMainPrize ? (
              <div className="text-center space-y-4">
                {!shouldCelebrateWin ? (
                  <>
                    <div className="text-6xl">🏆</div>
                    <p className="text-lg font-semibold text-yellow-600">
                      Gratulujeme, vyhrál jsi hlavní cenu!
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-medium text-amber-200/90">Gratulujeme k výhře!</p>
                )}
                <p className="win-moment-cta-hint -mb-1 text-center text-[11px] font-semibold uppercase text-amber-200/75 sm:text-xs">
                  Štěstí frčí —{' '}
                  <span className="text-amber-100">hrát znovu</span> je nejrychlejší cesta k další výhře
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    onClick={handlePlayAgain}
                    className={cn(
                      'win-moment-cta-play-again w-full border-0 font-bold shadow-lg',
                      'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 text-black hover:brightness-110'
                    )}
                  >
                    Hrát znovu
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGoToWins}
                    className="w-full font-semibold border-amber-500/40"
                  >
                    Zobrazit výhru
                  </Button>
                </div>
                <div className="flex justify-center pt-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyWinShare}
                    className="h-9 gap-1.5 text-amber-200/95 hover:bg-amber-500/10 hover:text-amber-50"
                  >
                    <Share2 className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                    Sdílet výhru
                  </Button>
                </div>
              </div>
            ) : isPartnerOffer && result?.partner_offer ? (
              /* ── Partner Offer win state ─────────────────────────────────── */
              <div className="mx-auto flex min-h-[min(50vh,420px)] w-full max-w-3xl flex-col items-center justify-center p-6">
                <div className="flex w-full flex-col items-center gap-3 text-center">
                  {(result.partner_offer.banner_url || result.partner_offer.logo_url) && (
                    <div className="w-full overflow-hidden rounded-xl">
                      <img
                        src={result.partner_offer.banner_url ?? result.partner_offer.logo_url!}
                        alt={result.partner_offer.title}
                        className="h-48 w-full object-cover sm:h-56"
                        loading="eager"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  )}
                  {!shouldCelebrateWin && <div className="text-5xl">🎁</div>}
                  <div className="flex flex-col items-center gap-2">
                    {!shouldCelebrateWin && (
                      <p className="text-lg font-bold text-amber-300">Gratulujeme!</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Získal jsi speciální nabídku od našeho partnera
                    </p>
                  </div>
                  <div className="flex w-full flex-col items-center gap-2 text-center">
                    {result.partner_offer.partner_name && (
                      <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                        {result.partner_offer.partner_name}
                      </p>
                    )}
                    <p className="text-base font-bold text-white">{result.partner_offer.title}</p>
                    {result.partner_offer.short_text && (
                      <p className="text-sm text-muted-foreground">{result.partner_offer.short_text}</p>
                    )}
                    {result.partner_offer.valid_to && (
                      <p className="text-xs text-muted-foreground">
                        Platná do: {new Date(result.partner_offer.valid_to).toLocaleDateString('cs-CZ')}
                      </p>
                    )}
                  </div>
                  <p className="win-moment-cta-hint text-center text-[11px] font-semibold uppercase text-blue-200/75 sm:text-xs">
                    Nabídka je uložena v tvých{' '}
                    <span className="text-blue-100">výhrách → Nabídky</span>
                  </p>
                  <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      onClick={handlePlayAgain}
                      className="win-moment-cta-play-again w-full border-0 font-bold shadow-lg bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 text-black hover:brightness-110"
                    >
                      Hrát znovu
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGoToWins}
                      className="w-full font-semibold border-blue-500/40"
                    >
                      Zobrazit nabídku
                    </Button>
                  </div>
                  <div className="flex w-full justify-center pt-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyWinShare}
                      className="h-9 gap-1.5 text-amber-200/95 hover:bg-amber-500/10 hover:text-amber-50"
                    >
                      <Share2 className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                      Sdílet výhru
                    </Button>
                  </div>
                </div>
              </div>
            ) : null
          ) : isLoading ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">⏳</div>
              <p className="text-lg font-medium">Kontroluji výhru...</p>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="text-4xl">🎯</div>
              <p className="text-lg font-medium">
                {funnyMessage}
              </p>
              {lossRetentionNudge && (
                <p className="text-sm font-medium text-amber-200/90">{lossRetentionNudge}</p>
              )}
              <div className="rounded-2xl p-5 space-y-3 border border-yellow-500/30 bg-gradient-to-b from-[#101c33] to-[#0d172b] shadow-xl">
                {nearestPrizeDistance !== null && (
                  <p className="text-sm text-amber-100/85 text-center">
                    Nejbližší výhra může být už za{' '}
                    <span className="font-bold bg-gradient-to-r from-[hsl(43_80%_65%)] to-[hsl(35_90%_55%)] bg-clip-text text-transparent">
                      {nearestPrizeDistance.toLocaleString('cs-CZ')}
                    </span>
                    {' '}tahů.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Social Sharing Section with Preview */}
        <div className="border-t border-transparent pt-4 mt-2" style={{ borderImage: 'linear-gradient(to right, transparent, rgba(234,179,8,0.4), transparent) 1' }}>
          <p className="text-sm text-muted-foreground text-center mb-3">
            Sdílet výsledek
            {isUploading && <span className="ml-2 text-xs">(nahrávám...)</span>}
          </p>
          
          {/* Preview Image */}
          <div className="flex justify-center mb-4">
            {isGeneratingImage ? (
              <div className="w-full max-w-[300px] aspect-[1200/630] bg-muted/30 rounded-lg flex items-center justify-center">
                <div className="text-sm text-muted-foreground">Generuji náhled...</div>
              </div>
            ) : previewImageUrl ? (
              <img 
                src={previewImageUrl} 
                alt="Náhled sdílení" 
                className="w-full max-w-[300px] rounded-lg shadow-lg border border-border/30"
              />
            ) : (
              <div className="w-full max-w-[300px] aspect-[1200/630] bg-muted/30 rounded-lg flex items-center justify-center">
                <div className="text-sm text-muted-foreground">Načítám...</div>
              </div>
            )}
          </div>

          {/* Share Buttons */}
          <div className="flex justify-center gap-3">
            {/* Facebook - needs publicShareUrl */}
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => handleShare('facebook')}
              disabled={isGeneratingImage || isUploading || !publicShareUrl}
              title={isUploading ? "Nahrávám obrázek..." : "Sdílet na Facebook"}
            >
              <Facebook className="h-5 w-5 text-[#1877F2]" />
            </Button>
            
            {/* Instagram */}
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => handleShare('instagram')}
              disabled={isGeneratingImage || !previewBlob}
              title="Sdílet na Instagram"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="url(#instagram-gradient)">
                <defs>
                  <linearGradient id="instagram-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
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
            
            {/* TikTok */}
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => handleShare('tiktok')}
              disabled={isGeneratingImage || !previewBlob}
              title="Sdílet na TikTok"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
              </svg>
            </Button>
            
            {/* X (Twitter) - needs publicShareUrl */}
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => handleShare('x')}
              disabled={isGeneratingImage || isUploading || !publicShareUrl}
              title={isUploading ? "Nahrávám obrázek..." : "Sdílet na X"}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </Button>

            {/* Download */}
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={handleDownloadCard}
              disabled={isGeneratingImage || !previewBlob}
              title="Stáhnout obrázek"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex justify-center">
          <Button type="button" onClick={onClose} variant={shouldCelebrateWin ? 'outline' : 'default'} className="w-full border-white/10">
            Zavřít
          </Button>
        </div>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
