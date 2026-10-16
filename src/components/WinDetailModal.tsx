import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Share2, Copy, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MioBadge } from '@/components/brand/MioBadge';
import emblem from '@/assets/redesign/onemil-emblem.png';
import avatarGift from '@/assets/redesign/avatar/avatar-darek.png';
import { bonusPrizeDisplayName } from '@/lib/miocoin';
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
    description?: string | null;
    amount?: number | null;
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
  const [showShare, setShowShare] = useState(false);
  const navigate = useNavigate();

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
      setShowShare(false);
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
    : (win.notes || bonusPrizeDisplayName(win.bonus_prize, 'Bonusová cena'));

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

  const isMio = win.type === 'bonus' && Number(win.bonus_prize?.amount ?? 0) > 0;
  const isDelivered = win.delivered || win.status === 'delivered';
  const isShipped = isDelivered || win.status === 'shipped' || (win.notes ?? '').toLowerCase().includes('shipped');
  const wonDate = new Date(win.created_at).toLocaleDateString('cs-CZ');
  const contestTitle = win.contest?.title || 'Soutěž OneMil';

  const image = win.type === 'main'
    ? win.contest?.main_prize_secondary_image || win.contest?.main_image || null
    : getStorageUrl(win.bonus_prize?.image_url);

  // Kroky cesty k zákazníkovi (věcná a hlavní výhra). MIO výhra se připisuje hned.
  type StepState = 'done' | 'current' | 'todo';
  const steps: { title: string; text: string; state: StepState }[] = [
    { title: 'Vyhráno', text: wonDate, state: 'done' },
    {
      title: isShipped ? 'Odesláno' : win.status === 'připraveno k odeslání' ? 'Připraveno k odeslání' : 'Čeká na odeslání',
      text: isShipped ? 'Výhra je na cestě k tobě.' : 'Ozveme se ti e-mailem a ve Zprávách.',
      state: isShipped ? 'done' : 'current',
    },
    {
      title: 'Doručeno',
      text: isDelivered ? 'Výhra je u tebe. Užij si ji!' : 'Brzy',
      state: isDelivered ? 'done' : isShipped ? 'current' : 'todo',
    },
  ];
  const progress = isDelivered ? 100 : isShipped ? 72 : 40;

  const confettiConfig = win.type === 'main'
    ? { pieces: 180, gravity: 0.22, colors: ['#C2902F', '#E9B949', '#FFD9A0', '#B5122B', '#FFFFFF'] }
    : { pieces: 70, gravity: 0.3, colors: ['#E9B949', '#FFD9A0', '#FFF1DF', '#FFFFFF'] };

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'OneMil', text: shareText, url: shareUrl });
        return;
      } catch {
        // Zrušené sdílení nebo nepodporovaný prohlížeč – ukážeme vlastní volby.
      }
    }
    setShowShare((v) => !v);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
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
      <DialogContent className="om-wd w-[calc(100vw-1.5rem)] max-w-md max-h-[92vh] overflow-y-auto overflow-x-hidden rounded-[24px] border-0 p-0">
        {/* Hero */}
        <div className="om-wd-hero">
          {isMio ? (
            <div className="om-wd-hero-mio" aria-hidden="true"><MioBadge width={170} /></div>
          ) : image ? (
            <img
              src={image}
              alt=""
              aria-hidden="true"
              className="om-wd-hero-img"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : null}
          <div className="om-wd-hero-shade" aria-hidden="true" />
          <div className="om-wd-crown" aria-hidden="true"><img src={emblem} alt="" /></div>
          <DialogHeader className="om-wd-hero-text space-y-1 text-left">
            <span className="om-wd-kicker">
              {win.type === 'main' ? 'Hlavní výhra' : 'Bonusová výhra'} · {contestTitle}
            </span>
            <DialogTitle className="om-wd-title">{prizeName}</DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex flex-col gap-3.5 p-4">
          {isMio ? (
            <div className="om-wd-card">
              <strong className="om-wd-card-title">Připsáno do bonusových výher</strong>
              <p className="mt-1.5 text-[13px] leading-snug text-[#5E5B57]">
                MIO z této výhry máš v bonusových výhrách. Do hlavního zůstatku si je převedeš v profilu.
              </p>
              <button
                type="button"
                className="om-wd-dark-btn mt-3 w-full"
                onClick={() => { onClose(); navigate('/profile'); }}
              >
                Přejít do profilu
              </button>
            </div>
          ) : (
            <div className="om-wd-card">
              <strong className="om-wd-card-title">Cesta k tobě</strong>
              <ol className="om-wd-steps" style={{ ['--om-wd-progress' as string]: `${progress}%` }}>
                {steps.map((step) => (
                  <li key={step.title} className={`om-wd-step om-wd-step-${step.state}`}>
                    <span className="om-wd-dot" aria-hidden="true">
                      {step.state === 'done' && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
                      )}
                    </span>
                    <strong>{step.title}</strong>
                    <span>{step.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {needsGuardian && (
            <div className="om-wd-warn">
              Pro převzetí této výhry je nutný doprovod zákonného zástupce. Napiš nám do Zpráv.
            </div>
          )}

          <div className="om-wd-quote">
            <img src={avatarGift} alt="" aria-hidden="true" />
            <span>
              {isMio
                ? '„Gratuluju! MIO máš připravená – použij je na další tikety.“'
                : isDelivered
                  ? '„Gratuluju! Užij si svou výhru.“'
                  : '„Gratuluju! Tvoje výhra je na cestě – brzy se ti ozveme.“'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" className="om-wd-dark-btn" onClick={() => { onClose(); navigate('/messages'); }}>
              Napsat podpoře
            </button>
            <button type="button" className="om-wd-gold-btn" onClick={handleShare} aria-expanded={showShare}>
              <Share2 className="h-4 w-4" aria-hidden="true" /> Sdílet výhru
            </button>
          </div>

          {showShare && (
            <div className="om-wd-share">
              <button type="button" onClick={handleShareFacebook}>Facebook</button>
              <button type="button" onClick={handleShareTwitter}>X</button>
              <button type="button" onClick={handleShareWhatsApp}>WhatsApp</button>
              <button type="button" onClick={handleCopyLink}>
                {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied ? 'Zkopírováno' : 'Kopírovat'}
              </button>
            </div>
          )}

          <button
            type="button"
            className="om-wd-link"
            onClick={() => { onClose(); onNavigateToContest(win.contest_id); }}
          >
            Zobrazit soutěž
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
