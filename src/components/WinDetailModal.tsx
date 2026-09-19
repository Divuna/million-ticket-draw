import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trophy, Gift, CheckCircle, Clock, Package, Calendar, Share2, Copy, Check } from 'lucide-react';
import { MIOCOIN_IMAGE_URL } from '@/components/MioCoin';
import { toast } from '@/hooks/use-toast';
import Confetti from 'react-confetti';
import { supabaseUrl } from '@/integrations/supabase/client';

const getStorageUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${supabaseUrl}/storage/v1/object/public/contest-images/${path}`;
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
}

export const WinDetailModal: React.FC<WinDetailModalProps> = ({ win, open, onClose, onNavigateToContest }) => {
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

  // Nutnost zákonného zástupce určuje výhradně atribut ceny. Věk se
  // nepočítá — OneMil ověřuje 18+ jen checkboxem při registraci a datum
  // narození nesmí být podmínkou převzetí výhry.
  const needsGuardian = win.type === 'bonus' &&
    win.bonus_prize?.guardian_required === true;

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

  // Light-premium badge: zelená zůstává jen pro doručeno (sémantika stavu),
  // ostatní stavy drží OneMil orange/amber — žádná fialová.
  const statusBadgeClass =
    'gap-1 rounded-full border px-2.5 py-1 font-sans text-[11px] font-semibold tracking-[0.01em]';

  const getStatusBadge = () => {
    if (win.delivered || win.status === 'delivered') {
      return (
        <Badge className={`${statusBadgeClass} border-[#BBE7C8] bg-[#EFFAF2] text-[#1B7A3D] hover:bg-[#EFFAF2]`}>
          <CheckCircle className="w-3 h-3" /> Předáno
        </Badge>
      );
    }
    switch (win.status) {
      case 'připraveno k odeslání':
        return (
          <Badge className={`${statusBadgeClass} border-[#F4D6AD] bg-[#FFF4E4] text-[#B4600B] hover:bg-[#FFF4E4]`}>
            <Package className="w-3 h-3" /> Připraveno k odeslání
          </Badge>
        );
      case 'shipped':
        return (
          <Badge className={`${statusBadgeClass} border-[#FFCE97] bg-[#FFF1DF] text-[#A85A00] hover:bg-[#FFF1DF]`}>
            <Package className="w-3 h-3" /> Odesláno
          </Badge>
        );
      case 'pending':
      default:
        return (
          <Badge className={`${statusBadgeClass} border-[#F4D6AD] bg-[#FFF4E4] text-[#B4600B] hover:bg-[#FFF4E4]`}>
            <Clock className="w-3 h-3" /> Čeká
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

  // Confetti v OneMil paletě a jemnější než dřív — hlavní výhra má výraznější
  // oranžovo-amber detail, bonus drží stejný systém v tišší variantě.
  const confettiConfig = win.type === 'main'
    ? { pieces: 180, gravity: 0.22, colors: ['#FF8A00', '#FFB547', '#FFD9A0', '#FFF1DF', '#FFFFFF'] }
    : { pieces: 70, gravity: 0.3, colors: ['#FFB547', '#FFD9A0', '#FFF1DF', '#FFFFFF'] };

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
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg max-h-[92vh] overflow-y-auto overflow-x-hidden rounded-[20px] border border-[#F4D6AD] bg-[#FFF9F0] p-0 text-[#111827] shadow-[0_28px_100px_rgba(81,49,10,0.28)]">
        {/* Certifikát výhry — světlý cream ticket s jemným rámečkem a perforací. */}
        <div className="relative m-3 rounded-2xl border border-[#F0DFC4] bg-gradient-to-b from-white to-[#FFFCF6] shadow-[0_10px_28px_rgba(91,57,16,0.10)] sm:m-4">
          {/* Hlavní obrázek ceny */}
          {imageUrl && (
            <div className="relative h-48 w-full overflow-hidden rounded-t-2xl bg-[#FFF4E8] sm:h-60">
              <img
                src={imageUrl}
                alt={prizeName || 'Výhra'}
                className="h-full w-full object-cover"
                onError={(e) => {
                  if (win.type === 'bonus' && e.currentTarget.src !== MIOCOIN_IMAGE_URL) {
                    e.currentTarget.src = MIOCOIN_IMAGE_URL;
                  }
                }}
              />
              {/* Cream fade místo černého gradientu — drží světlou plochu. */}
              <div className="absolute inset-0 bg-gradient-to-t from-white via-white/25 to-transparent" />

              <div className="absolute left-3 top-3 sm:left-4 sm:top-4">
                {win.type === 'main' ? (
                  <Badge className="gap-1 rounded-full border-0 bg-gradient-to-r from-[#FF8A00] to-[#FFB547] px-3 py-1 font-sans text-[11px] font-bold tracking-[0.02em] text-white shadow-[0_4px_12px_rgba(249,115,22,0.30)] hover:brightness-105">
                    <Trophy className="h-3.5 w-3.5" /> Hlavní výhra
                  </Badge>
                ) : (
                  <Badge className="gap-1 rounded-full border border-[#F4D6AD] bg-white/90 px-3 py-1 font-sans text-[11px] font-semibold tracking-[0.02em] text-[#B4600B] backdrop-blur-sm hover:bg-white">
                    <Gift className="h-3.5 w-3.5 text-[#FF8A00]" /> Bonusová výhra
                  </Badge>
                )}
              </div>
            </div>
          )}

          <div className="space-y-4 px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
            {/* Název ceny + soutěž */}
            <DialogHeader className="space-y-1.5 text-left">
              <p className="font-heading text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B08247]">
                Certifikát výhry
              </p>
              <DialogTitle className="font-heading text-xl font-extrabold leading-[1.2] tracking-[-0.01em] text-[#111827] sm:text-2xl">
                {prizeName}
              </DialogTitle>
              <p className="font-sans text-sm text-[#4B5563]">
                Soutěž: {win.contest?.title || 'Neznámá soutěž'}
              </p>
            </DialogHeader>

            {/* Stav + datum */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {getStatusBadge()}
              <div className="flex items-center gap-1.5 font-sans text-[13px] text-[#4B5563]">
                <Calendar className="h-3.5 w-3.5 text-[#B08247]" />
                <span>Vyhráno: {new Date(win.created_at).toLocaleDateString('cs-CZ')}</span>
              </div>
            </div>

            {/* Poznámka */}
            {win.notes && (
              <div className="rounded-xl border border-[#E5E7EB] bg-white p-3.5">
                <p className="font-sans text-sm leading-relaxed text-[#4B5563]">
                  <span className="font-semibold text-[#111827]">Poznámka: </span>
                  {win.notes}
                </p>
              </div>
            )}

            {/* Zákonný zástupce */}
            {needsGuardian && (
              <div className="rounded-xl border border-[#F4D6AD] bg-[#FFF4E4] p-3.5">
                <p className="font-sans text-sm font-medium leading-relaxed text-[#B4600B]">
                  ⚠ Pro převzetí této výhry je nutný doprovod zákonného zástupce. Kontaktujte nás přes chat.
                </p>
              </div>
            )}

            {/* Informace o zpracování */}
            <div className="rounded-xl border border-[#F0DFC4] bg-[#FFF9F0] p-3.5">
              <p className="font-sans text-sm leading-relaxed text-[#4B5563]">
                {win.delivered || win.status === 'delivered' ? (
                  'Vaše výhra byla úspěšně předána.'
                ) : win.status === 'shipped' ? (
                  'Vaše výhra byla odeslána a brzy dorazí.'
                ) : win.status === 'připraveno k odeslání' ? (
                  'Vaše výhra je připravena k odeslání.'
                ) : (
                  'Vaše výhra čeká na zpracování. Brzy vás budeme kontaktovat.'
                )}
              </p>
            </div>

            {/* Perforace — ticket charakter oddělující útržek se sdílením. */}
            <div className="relative -mx-4 py-1 sm:-mx-6" aria-hidden="true">
              <div className="absolute left-0 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#F0DFC4] bg-[#FFF9F0]" />
              <div className="absolute right-0 top-1/2 h-5 w-5 translate-x-1/2 -translate-y-1/2 rounded-full border border-[#F0DFC4] bg-[#FFF9F0]" />
              <div className="mx-5 border-t border-dashed border-[#E0CBA8] sm:mx-7" />
            </div>

            {/* Sdílení */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 font-sans text-[13px] font-medium text-[#4B5563]">
                <Share2 className="h-3.5 w-3.5 text-[#B08247]" />
                <span>Sdílet výhru</span>
              </div>
              {/* flex-wrap + basis drží tlačítka čitelná i na 375px. */}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleShareFacebook}
                  variant="outline"
                  size="sm"
                  className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] border-[#D6E4FB] bg-white font-sans text-[13px] font-medium text-[#1877F2] hover:bg-[#F2F7FF] sm:basis-0"
                >
                  <svg className="mr-1.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  Facebook
                </Button>
                <Button
                  onClick={handleShareTwitter}
                  variant="outline"
                  size="sm"
                  className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] border-[#E5E7EB] bg-white font-sans text-[13px] font-medium text-[#111827] hover:bg-[#F6F6F7] sm:basis-0"
                >
                  <svg className="mr-1.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  X
                </Button>
                <Button
                  onClick={handleShareWhatsApp}
                  variant="outline"
                  size="sm"
                  className="min-w-0 flex-1 basis-full border-[#CCEFD9] bg-white font-sans text-[13px] font-medium text-[#1FA855] hover:bg-[#F2FBF5] sm:basis-0"
                >
                  <svg className="mr-1.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </Button>
              </div>
              <Button
                onClick={handleCopyLink}
                variant="outline"
                size="sm"
                className="w-full border-[#F4D6AD] bg-white font-sans text-[13px] font-medium text-[#111827] hover:bg-[#FFF4E8]"
              >
                {copied ? <Check className="mr-2 h-4 w-4 text-[#1B7A3D]" /> : <Copy className="mr-2 h-4 w-4 text-[#B08247]" />}
                {copied ? 'Zkopírováno!' : 'Kopírovat text'}
              </Button>
            </div>

            {/* Zobrazit soutěž */}
            <Button
              onClick={() => {
                onClose();
                onNavigateToContest(win.contest_id);
              }}
              className={
                win.type === 'main'
                  ? 'w-full border-0 bg-gradient-to-r from-[#FF8A00] via-[#FFB547] to-[#FF8A00] font-sans font-bold text-white shadow-[0_6px_18px_rgba(249,115,22,0.28)] hover:brightness-110'
                  : 'w-full border border-[#F4D6AD] bg-white font-sans font-semibold text-[#111827] hover:bg-[#FFF4E8]'
              }
              variant={win.type === 'main' ? 'default' : 'outline'}
            >
              Zobrazit soutěž
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
