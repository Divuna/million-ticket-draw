import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trophy, Gift, CheckCircle, Clock, Package, Calendar, Share2, Copy, Check } from 'lucide-react';
import { MIOCOIN_IMAGE_URL } from '@/components/MioCoin';
import { toast } from '@/hooks/use-toast';
import Confetti from 'react-confetti';

const SUPABASE_URL = 'https://xkzhjldrojjlrkezorey.supabase.co';

const getStorageUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/contest-images/${path}`;
};

interface Win {
  id: string;
  type: string;
  status: string | null;
  delivered: boolean;
  notes: string | null;
  created_at: string;
  contest_id: string;
  prize_id: string | null;
  contest: {
    id: string;
    title: string;
    main_prize: string;
    main_image: string | null;
    main_prize_secondary_image: string | null;
  } | null;
  bonus_prize: {
    id: string;
    title: string | null;
    image_url: string | null;
    guardian_required: boolean | null;
  } | null;
}

interface WinDetailModalProps {
  win: Win | null;
  open: boolean;
  onClose: () => void;
  onNavigateToContest: (contestId: string) => void;
  userAge?: number | null;
}

export const WinDetailModal: React.FC<WinDetailModalProps> = ({ win, open, onClose, onNavigateToContest, userAge }) => {
  const [copied, setCopied] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Play victory sound for main prize
  const playVictorySound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create a triumphant fanfare sequence
      const notes = [
        { freq: 523.25, start: 0, duration: 0.15 },     // C5
        { freq: 659.25, start: 0.15, duration: 0.15 },  // E5
        { freq: 783.99, start: 0.30, duration: 0.15 },  // G5
        { freq: 1046.50, start: 0.45, duration: 0.4 },  // C6 (longer final note)
      ];

      notes.forEach(note => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = note.freq;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.25, audioContext.currentTime + note.start);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + note.start + note.duration);
        
        oscillator.start(audioContext.currentTime + note.start);
        oscillator.stop(audioContext.currentTime + note.start + note.duration);
      });
    } catch (error) {
      console.log('Could not play victory sound:', error);
    }
  };

  // Play subtle chime for bonus prize
  const playBonusSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Gentle two-note chime
      const notes = [
        { freq: 587.33, start: 0, duration: 0.2 },     // D5
        { freq: 880.00, start: 0.12, duration: 0.3 },  // A5
      ];

      notes.forEach(note => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = note.freq;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime + note.start);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + note.start + note.duration);
        
        oscillator.start(audioContext.currentTime + note.start);
        oscillator.stop(audioContext.currentTime + note.start + note.duration);
      });
    } catch (error) {
      console.log('Could not play bonus sound:', error);
    }
  };

  // Trigger confetti and sound when modal opens
  useEffect(() => {
    if (open && win) {
      setShowConfetti(true);
      
      // Play appropriate sound based on win type
      if (win.type === 'main') {
        playVictorySound();
      } else {
        playBonusSound();
      }
      
      const timer = setTimeout(() => setShowConfetti(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [open, win]);

  if (!win) return null;

  // Check if guardian is required and user is under 18
  const needsGuardian = win.type === 'bonus' && 
    win.bonus_prize?.guardian_required === true && 
    userAge !== null && 
    userAge < 18;

  const prizeName = win.type === 'main' 
    ? win.contest?.main_prize 
    : (win.notes || win.bonus_prize?.title || 'Bonusová cena');

  const shareText = `Vyhrál jsem ${prizeName} v soutěži ${win.contest?.title || 'OneMil'}! 🎉🏆`;
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/contest/${win.contest_id}` : '';

  const handleShareFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank', 'width=600,height=400');
  };

  const handleShareTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank', 'width=600,height=400');
  };

  const handleShareWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;
    window.open(url, '_blank');
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      setCopied(true);
      toast({ title: "Zkopírováno!", description: "Text byl zkopírován do schránky." });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({ title: "Chyba", description: "Nepodařilo se zkopírovat.", variant: "destructive" });
    }
  };

  const getStatusBadge = () => {
    if (win.delivered || win.status === 'vyplaceno') {
      return (
        <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">
          <CheckCircle className="w-3 h-3 mr-1" /> {win.status === 'vyplaceno' ? 'Vyplaceno' : 'Doručeno'}
        </Badge>
      );
    }
    switch (win.status) {
      case 'čeká na potvrzení':
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
            <Clock className="w-3 h-3 mr-1" /> Čeká na potvrzení
          </Badge>
        );
      case 'připraveno k odeslání':
        return (
          <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <Package className="w-3 h-3 mr-1" /> Připraveno k odeslání
          </Badge>
        );
      case 'odesláno':
        return (
          <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/30">
            <Package className="w-3 h-3 mr-1" /> Odesláno
          </Badge>
        );
      default:
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
            <Clock className="w-3 h-3 mr-1" /> Čeká na potvrzení
          </Badge>
        );
    }
  };

  const getImageUrl = (): string | null => {
    if (win.type === 'main') {
      return win.contest?.main_prize_secondary_image || win.contest?.main_image || null;
    }
    return getStorageUrl(win.bonus_prize?.image_url) || MIOCOIN_IMAGE_URL;
  };

  const imageUrl = getImageUrl();

  // Different confetti settings based on win type
  const confettiConfig = win.type === 'main' 
    ? { pieces: 350, gravity: 0.25, colors: ['#FFD700', '#FFA500', '#FFEC8B', '#FFE135', '#F0E68C'] } // Gold theme for main prize
    : { pieces: 120, gravity: 0.35, colors: ['#9370DB', '#BA55D3', '#DDA0DD', '#E6E6FA', '#D8BFD8'] }; // Purple theme for bonus

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      {/* Confetti Animation - intensity based on win type */}
      {showConfetti && (
        <Confetti
          width={window.innerWidth}
          height={window.innerHeight}
          recycle={false}
          numberOfPieces={confettiConfig.pieces}
          gravity={confettiConfig.gravity}
          colors={confettiConfig.colors}
          style={{ position: 'fixed', top: 0, left: 0, zIndex: 9999 }}
        />
      )}
      <DialogContent className="max-w-lg bg-card border-border p-0 overflow-hidden">
        {/* Image Section */}
        {imageUrl && (
          <div className="relative w-full h-64 bg-muted/40">
            <img
              src={imageUrl}
              alt={prizeName || 'Výhra'}
              className="w-full h-full object-cover"
              onError={(e) => {
                if (win.type === 'bonus' && e.currentTarget.src !== MIOCOIN_IMAGE_URL) {
                  e.currentTarget.src = MIOCOIN_IMAGE_URL;
                }
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            
            {/* Type badge overlay */}
            <div className="absolute top-4 left-4">
              <Badge className="bg-background/80 text-foreground border-0 backdrop-blur-sm">
                {win.type === 'main' 
                  ? <><Trophy className="h-4 w-4 text-yellow-400 mr-1" /> Hlavní výhra</>
                  : <><Gift className="h-4 w-4 text-purple-400 mr-1" /> Bonusová výhra</>
                }
              </Badge>
            </div>
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* Header */}
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-xl font-bold text-foreground">
              {prizeName}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Soutěž: {win.contest?.title || 'Neznámá soutěž'}
            </p>
          </DialogHeader>

          {/* Status & Date */}
          <div className="flex items-center justify-between">
            {getStatusBadge()}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>Vyhráno: {new Date(win.created_at).toLocaleDateString('cs-CZ')}</span>
            </div>
          </div>

          {/* Notes if any */}
          {win.notes && (
            <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Poznámka: </span>
                {win.notes}
              </p>
            </div>
          )}

          {/* Guardian Required Notice */}
          {needsGuardian && (
            <div className="bg-amber-500/10 rounded-lg p-4 border border-amber-500/30">
              <p className="text-sm text-amber-400 font-medium">
                ⚠ Pro převzetí této výhry je nutný doprovod zákonného zástupce. Kontaktujte nás přes chat.
              </p>
            </div>
          )}

          {/* Status explanation */}
          <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
            <p className="text-sm text-muted-foreground">
              {win.delivered || win.status === 'vyplaceno' ? (
                'Vaše výhra byla úspěšně doručena/vyplacena.'
              ) : win.status === 'odesláno' ? (
                'Vaše výhra byla odeslána a brzy dorazí.'
              ) : win.status === 'připraveno k odeslání' ? (
                'Vaše výhra je připravena k odeslání.'
              ) : (
                'Vaše výhra čeká na zpracování. Brzy vás budeme kontaktovat.'
              )}
            </p>
          </div>

          {/* Share Buttons */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Share2 className="w-4 h-4" />
              <span>Sdílet výhru</span>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleShareFacebook}
                variant="outline"
                size="sm"
                className="flex-1 bg-[#1877F2]/10 hover:bg-[#1877F2]/20 border-[#1877F2]/30 text-[#1877F2]"
              >
                <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                Facebook
              </Button>
              <Button
                onClick={handleShareTwitter}
                variant="outline"
                size="sm"
                className="flex-1 bg-black/10 hover:bg-black/20 border-white/20 text-foreground"
              >
                <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                X
              </Button>
              <Button
                onClick={handleShareWhatsApp}
                variant="outline"
                size="sm"
                className="flex-1 bg-[#25D366]/10 hover:bg-[#25D366]/20 border-[#25D366]/30 text-[#25D366]"
              >
                <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </Button>
            </div>
            <Button
              onClick={handleCopyLink}
              variant="outline"
              size="sm"
              className="w-full"
            >
              {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? 'Zkopírováno!' : 'Kopírovat text'}
            </Button>
          </div>

          {/* Action Button */}
          <Button 
            onClick={() => {
              onClose();
              onNavigateToContest(win.contest_id);
            }}
            className="w-full"
            variant="outline"
          >
            Zobrazit soutěž
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
