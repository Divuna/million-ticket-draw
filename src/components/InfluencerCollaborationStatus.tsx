import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ShieldCheck, Instagram, Music2, Youtube, Facebook, Globe, MessageSquare, Ban, Loader2 } from 'lucide-react';

interface Channel {
  name: string;
  icon: React.ElementType;
  allowed: boolean;
}

const channels: Channel[] = [
  { name: 'Instagram', icon: Instagram, allowed: true },
  { name: 'TikTok', icon: Music2, allowed: true },
  { name: 'YouTube', icon: Youtube, allowed: true },
  { name: 'Facebook', icon: Facebook, allowed: true },
  { name: 'Webové stránky / Blog', icon: Globe, allowed: true },
  { name: 'Spam / hromadné zprávy', icon: Ban, allowed: false },
  { name: 'Neověřené messengery', icon: MessageSquare, allowed: false },
];

interface Props {
  partnerId: string;
}

const statusMap: Record<string, { label: string; color: string; description: string }> = {
  approved: {
    label: 'Aktivní spolupráce',
    color: 'hsl(160 55% 45%)',
    description: 'Vaše spolupráce je plně aktivní. Můžete propagovat OneMil na povolených kanálech a získávat provize za nové uživatele.',
  },
  pending: {
    label: 'Omezená spolupráce',
    color: 'hsl(43 90% 55%)',
    description: 'Váš účet čeká na schválení. Po schválení budete moci plně využívat všechny propagační kanály a získávat provize.',
  },
  suspended: {
    label: 'Pozastavená spolupráce',
    color: 'hsl(0 72% 51%)',
    description: 'Vaše spolupráce byla dočasně pozastavena. Kontaktujte podporu pro více informací.',
  },
};

const InfluencerCollaborationStatus: React.FC<Props> = ({ partnerId }) => {
  const [partnerStatus, setPartnerStatus] = useState<string>('pending');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('partners')
        .select('status')
        .eq('id', partnerId)
        .single();
      if (data) setPartnerStatus(data.status);
      setLoading(false);
    };
    load();
  }, [partnerId]);

  const status = statusMap[partnerStatus] || statusMap.pending;
  const allowed = channels.filter(c => c.allowed);
  const disallowed = channels.filter(c => !c.allowed);

  if (loading) {
    return (
      <div className="luxury-card p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--neon-gold))]" />
      </div>
    );
  }

  return (
    <div className="luxury-card overflow-hidden">
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
          <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">Stav spolupráce</h3>
        </div>

        {/* Status badge + description */}
        <div className="flex items-start gap-3 rounded-xl border px-4 py-3"
          style={{
            borderColor: `${status.color.replace(')', ' / 0.3)')}`,
            backgroundColor: `${status.color.replace(')', ' / 0.06)')}`,
          }}
        >
          <div className="w-2.5 h-2.5 rounded-full shrink-0 mt-1" style={{ backgroundColor: status.color }} />
          <div className="space-y-1">
            <span className="text-sm font-semibold" style={{ color: status.color }}>{status.label}</span>
            <p className="text-xs text-[hsl(var(--text-muted-gray))] leading-relaxed">{status.description}</p>
          </div>
        </div>

        {/* Channels grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-widest text-[hsl(160_55%_45%)]">✓ Povolené kanály</span>
            <div className="space-y-1.5">
              {allowed.map(ch => (
                <div key={ch.name} className="flex items-center gap-2.5 rounded-lg bg-[hsl(var(--muted)/0.3)] border border-[hsl(var(--border)/0.2)] px-3 py-2">
                  <ch.icon className="w-4 h-4 text-[hsl(160_55%_45%)] shrink-0" />
                  <span className="text-sm text-[hsl(var(--text-silver))]">{ch.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-widest text-[hsl(0_72%_51%)]">✗ Zakázané kanály</span>
            <div className="space-y-1.5">
              {disallowed.map(ch => (
                <div key={ch.name} className="flex items-center gap-2.5 rounded-lg bg-[hsl(var(--muted)/0.3)] border border-[hsl(var(--border)/0.2)] px-3 py-2">
                  <ch.icon className="w-4 h-4 text-[hsl(0_72%_51%)] shrink-0" />
                  <span className="text-sm text-[hsl(var(--text-muted-gray))]">{ch.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfluencerCollaborationStatus;
