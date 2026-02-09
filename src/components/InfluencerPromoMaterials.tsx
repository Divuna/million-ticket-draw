import React from 'react';
import { Instagram, Music2, Youtube, Facebook, Copy, Check, AlertTriangle, Gift } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface PromoCard {
  platform: string;
  icon: React.ElementType;
  color: string;
  postText: string;
  cta: string;
  allowed: string[];
  notAllowed: string[];
  bonusNote: string | null;
}

const promoCards: PromoCard[] = [
  {
    platform: 'Instagram',
    icon: Instagram,
    color: 'hsl(330 70% 55%)',
    postText:
      '🎰 Hrajte o luxusní ceny na @onemil_cz! Registrujte se přes můj odkaz v bio a získejte bonus MioCoinů zdarma. 🎁 #onemil #soutez #vyhry',
    cta: '👉 Odkaz v bio – registruj se a získej bonus!',
    allowed: [
      'Stories, Reels, příspěvky ve feedu',
      'Odkaz v bio (link in bio)',
      'Vlastní kreativní úpravy textu',
    ],
    notAllowed: [
      'Garantovat výhru nebo jistý zisk',
      'Používat zavádějící tvrzení',
      'Cílit na osoby mladší 18 let',
    ],
    bonusNote: 'Za každou registraci přes váš odkaz získáte bonus dle aktuální kampaně.',
  },
  {
    platform: 'TikTok',
    icon: Music2,
    color: 'hsl(170 80% 50%)',
    postText:
      '🎰 Chceš vyhrát luxusní ceny? Zkus @onemil_cz – registruj se přes odkaz v mém profilu a dostaneš MioCoiny navíc! 🔥 #onemil #soutez #tiktokcz',
    cta: '🔗 Odkaz v profilu – registrace + bonus zdarma!',
    allowed: [
      'Videa, duety, živá vysílání',
      'Odkaz v profilu',
      'Vlastní styl a humor',
    ],
    notAllowed: [
      'Slibovat konkrétní výhry',
      'Používat klamavé efekty (falešné notifikace apod.)',
      'Propagace pro nezletilé',
    ],
    bonusNote: 'TikTok videa mají nejvyšší organický dosah – využijte trending zvuky.',
  },
  {
    platform: 'YouTube',
    icon: Youtube,
    color: 'hsl(0 70% 50%)',
    postText:
      '🎬 V tomhle videu vám ukážu, jak funguje OneMil – soutěže o luxusní ceny. Registrujte se přes odkaz v popisu a získejte MioCoiny jako bonus!',
    cta: '⬇️ Odkaz v popisu videa – registrace s bonusem',
    allowed: [
      'Videa, Shorts, Community příspěvky',
      'Odkaz v popisu videa',
      'Recenze, unboxing, ukázky výher',
    ],
    notAllowed: [
      'Garantovat výhru',
      'Vynechávat označení spolupráce',
      'Cílit na nezletilé diváky',
    ],
    bonusNote: 'Označte video jako placenou spolupráci dle pravidel YouTube.',
  },
  {
    platform: 'Facebook',
    icon: Facebook,
    color: 'hsl(220 70% 55%)',
    postText:
      '🎰 Znáte OneMil? Soutěže o luxusní ceny – auta, elektroniku a další! Zaregistrujte se přes můj odkaz a získáte MioCoiny jako dárek. 🎁',
    cta: '👉 Klikněte na odkaz a zaregistrujte se s bonusem!',
    allowed: [
      'Příspěvky, Stories, skupiny',
      'Přímý odkaz v příspěvku',
      'Sdílení osobních zkušeností',
    ],
    notAllowed: [
      'Spam ve skupinách',
      'Falešné soutěže nebo giveaway',
      'Cílení na nezletilé',
    ],
    bonusNote: null,
  },
];

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label = 'Kopírovat' }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Text zkopírován');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Nepodařilo se zkopírovat');
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-[hsl(var(--neon-gold))] hover:text-[hsl(43_90%_48%)] transition-colors"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Zkopírováno' : label}
    </button>
  );
};

const InfluencerPromoMaterials: React.FC = () => {
  return (
    <div className="luxury-card overflow-hidden">
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
          <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">Propagační podklady</h3>
        </div>

        <p className="text-sm text-[hsl(var(--text-muted-gray))]">
          Připravené texty a pokyny pro vaše sociální sítě. Texty můžete upravit vlastním stylem, ale dodržujte pravidla uvedená u každé platformy.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {promoCards.map((card) => (
            <div
              key={card.platform}
              className="rounded-xl border border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.15)] p-5 space-y-4"
            >
              {/* Platform header */}
              <div className="flex items-center gap-2.5">
                <div
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: `${card.color} / 0.12)`.replace(')', ''), background: `hsla(${card.color.replace('hsl(', '').replace(')', '')}, 0.12)` }}
                >
                  <card.icon className="w-5 h-5" style={{ color: card.color }} />
                </div>
                <span className="text-sm font-semibold text-[hsl(var(--text-silver))]">{card.platform}</span>
              </div>

              {/* Post text */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted-gray))]">Doporučený text</span>
                  <CopyButton text={card.postText} />
                </div>
                <div className="rounded-lg bg-[hsl(var(--muted)/0.4)] border border-[hsl(var(--border)/0.2)] px-3 py-2.5">
                  <p className="text-sm text-[hsl(var(--text-silver))] leading-relaxed whitespace-pre-wrap">{card.postText}</p>
                </div>
              </div>

              {/* CTA */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted-gray))]">CTA text</span>
                  <CopyButton text={card.cta} />
                </div>
                <div className="rounded-lg bg-[hsl(var(--neon-gold)/0.06)] border border-[hsl(var(--neon-gold)/0.15)] px-3 py-2">
                  <p className="text-sm font-medium text-[hsl(var(--neon-gold))]">{card.cta}</p>
                </div>
              </div>

              {/* Rules */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-[hsl(160_55%_45%)]">✓ Povoleno</span>
                  <ul className="space-y-1">
                    {card.allowed.map((item, i) => (
                      <li key={i} className="text-xs text-[hsl(var(--text-muted-gray))] leading-snug">• {item}</li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-[hsl(0_72%_51%)]">✗ Zakázáno</span>
                  <ul className="space-y-1">
                    {card.notAllowed.map((item, i) => (
                      <li key={i} className="text-xs text-[hsl(var(--text-muted-gray))] leading-snug">• {item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Bonus note */}
              {card.bonusNote && (
                <div className="flex items-start gap-2 rounded-lg bg-[hsl(var(--neon-gold)/0.05)] border border-[hsl(var(--neon-gold)/0.15)] px-3 py-2">
                  <Gift className="w-3.5 h-3.5 text-[hsl(var(--neon-gold))] shrink-0 mt-0.5" />
                  <p className="text-xs text-[hsl(var(--text-muted-gray))]">{card.bonusNote}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default InfluencerPromoMaterials;
