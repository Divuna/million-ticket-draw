import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Facebook, Download } from 'lucide-react';
import logoOnemil from '@/assets/logo-onemil.png';

const SUPABASE_URL = 'https://xkzhjldrojjlrkezorey.supabase.co';

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
  const [isLoading, setIsLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [publicShareUrl, setPublicShareUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

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
          .select('id, title, description, amount, status')
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

  // Generate preview image and upload to storage when modal opens
  useEffect(() => {
    if (!isOpen || !result || isLoading) {
      return;
    }

    // Clean up previous preview
    if (previewImageUrl) {
      URL.revokeObjectURL(previewImageUrl);
      setPreviewImageUrl(null);
      setPreviewBlob(null);
      setPublicShareUrl(null);
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
        const url = URL.createObjectURL(blob);
        setPreviewImageUrl(url);
        setPreviewBlob(blob);

        // Generate unique ticket ID for sharing
        const ticketShareId = `${contestId}-${result.ticket_number}`;

        // Convert blob to base64 for upload
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result as string;
          
          try {
            // Upload via edge function
            const response = await fetch(
              `${SUPABASE_URL}/functions/v1/upload-ticket-share`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  ticketId: ticketShareId,
                  imageBase64: base64
                })
              }
            );

            if (response.ok) {
              const data = await response.json();
              console.log('Image uploaded:', data.publicUrl);
              setPublicShareUrl(`https://onemil.cz/share/ticket/${ticketShareId}`);
            } else {
              console.error('Upload failed:', await response.text());
            }
          } catch (uploadErr) {
            console.error('Upload error:', uploadErr);
          } finally {
            setIsUploading(false);
          }
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

    // Cleanup on unmount
    return () => {
      if (previewImageUrl) {
        URL.revokeObjectURL(previewImageUrl);
      }
    };
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

  // Detection logic - use safe access since result can be null
  const isBonusWin = bonusPrize !== null;
  const isMainPrize = result?.won_type === 'main' || result?.won_main === true;
  const isWinner = isBonusWin || isMainPrize;
  const isBonusClaimed = bonusPrize?.status === 'won';

  // Dynamic share text based on result
  const getShareText = () => {
    if (isWinner) {
      return `Vyhrál jsem na OneMil 🎉🎟️ Ticket #${result?.ticket_number?.toLocaleString('cs-CZ') ?? ''}. Zkus štěstí taky 👉 onemil.cz`;
    }
    return `Zahrál jsem si na OneMil 🎟️ Ticket #${result?.ticket_number?.toLocaleString('cs-CZ') ?? ''}. Každý ticket tě blíží k výhře 👉 onemil.cz`;
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

  // Always render Dialog to prevent mount/unmount flicker in React StrictMode
  // Control visibility via isOpen && result !== null
  return (
    <Dialog open={isOpen && result !== null} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md rounded-2xl border border-yellow-500/40 bg-gradient-to-b from-[#0b1220] via-[#0f1b33] to-[#0a1428] shadow-[0_0_40px_rgba(255,200,0,0.15)]">
        {isWinner && (
          <Confetti
            width={width}
            height={height}
            recycle={false}
            numberOfPieces={isMainPrize ? 500 : 150}
            gravity={isMainPrize ? 0.2 : 0.4}
            colors={isMainPrize ? ['#FFD700', '#FFA500', '#FF4500', '#DC143C', '#8A2BE2'] : undefined}
          />
        )}
        
        <DialogHeader>
          <DialogTitle className="text-center text-xl">
            {isMainPrize ? '' : isWinner ? 'Výhra! 🎉' : 'Výsledek tiketu'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isWinner ? (
            isBonusWin && bonusPrize ? (
              <div className="text-center space-y-3">
                <div className="text-6xl">🎉</div>
                <p className="text-lg font-semibold text-green-600">
                  Gratulujeme, vyhrál jsi bonus: {bonusPrize.title || bonusPrize.description}
                </p>
                {bonusPrize.amount && bonusPrize.amount > 0 && (
                  <p className="text-md text-muted-foreground">
                    MioCoin: <span className="font-semibold text-primary">{bonusPrize.amount.toLocaleString('cs-CZ')}</span>
                  </p>
                )}
                <p className="text-muted-foreground">
                  Tiket #{result?.ticket_number?.toLocaleString('cs-CZ')}
                </p>
                {result?.distance_to_next_bonus && result.distance_to_next_bonus > 0 && (
                  <div className="mx-auto max-w-[280px] rounded-full border border-[hsl(43_70%_50%/0.25)] bg-[hsl(220_40%_13%)] px-5 py-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Do další bonusové výhry</p>
                    <p>
                      <span className="text-2xl font-bold bg-gradient-to-r from-[hsl(43_80%_65%)] to-[hsl(35_90%_55%)] bg-clip-text text-transparent">{result.distance_to_next_bonus.toLocaleString('cs-CZ')}</span>
                      <span className="text-sm text-muted-foreground ml-1.5">tiketů</span>
                    </p>
                  </div>
                )}
                {isBonusClaimed ? (
                  <Button 
                    onClick={handleGoToWins}
                    className="w-full mt-2"
                  >
                    Přejít do výher
                  </Button>
                ) : (
                  <Button 
                    onClick={handleClaimBonus}
                    disabled={isClaiming || !user}
                    className="w-full mt-2"
                  >
                    {isClaiming ? 'Uplatňuji...' : 'Uplatnit výhru'}
                  </Button>
                )}
              </div>
            ) : isMainPrize ? (
              <div className="text-center space-y-3">
                <div className="text-6xl">🏆</div>
                <p className="text-lg font-semibold text-yellow-600">
                  Gratulujeme, vyhrál jsi hlavní cenu!
                </p>
                <p className="text-muted-foreground">
                  Tiket #{result?.ticket_number?.toLocaleString('cs-CZ')}
                </p>
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
              <div className="rounded-2xl p-5 space-y-2 border border-yellow-500/30 bg-gradient-to-b from-[#101c33] to-[#0d172b] shadow-xl">
                <p className="text-sm text-muted-foreground">
                  Tvůj tiket: <span className="font-semibold">#{result?.ticket_number?.toLocaleString('cs-CZ')}</span>
                </p>
                {result?.distance_to_next_bonus && !isWinner && (
                  <div className="mx-auto max-w-[280px] rounded-full border border-[hsl(43_70%_50%/0.25)] bg-[hsl(220_40%_13%)] px-5 py-3 text-center mt-2">
                    <p className="text-xs text-muted-foreground mb-1">Do bonusové výhry zbývá</p>
                    <p>
                      <span className="text-2xl font-bold bg-gradient-to-r from-[hsl(43_80%_65%)] to-[hsl(35_90%_55%)] bg-clip-text text-transparent">{result.distance_to_next_bonus.toLocaleString('cs-CZ')}</span>
                      <span className="text-sm text-muted-foreground ml-1.5">tiketů</span>
                    </p>
                  </div>
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
          <Button onClick={onClose} className="w-full">
            Zavřít
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
