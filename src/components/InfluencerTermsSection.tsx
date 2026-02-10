import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FileText, CheckCircle2, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';

interface TermsData {
  termsSlug: string;
  termsTitle: string;
  termsVersion: string | null;
  termsUpdatedAt: string | null;
  agreedAt: string | null;
  needsUpdate: boolean;
}

interface Props {
  partnerId: string;
}

const InfluencerTermsSection: React.FC<Props> = ({ partnerId }) => {
  const [data, setData] = useState<TermsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [partnerRes, termsRes] = await Promise.all([
        supabase
          .from('partners')
          .select('approved_at')
          .eq('id', partnerId)
          .single(),
        supabase
          .from('content_pages')
          .select('slug, title, version, updated_at')
          .eq('slug', 'obchodni-podminky')
          .eq('section', 'legal')
          .maybeSingle(),
      ]);

      const partner = partnerRes.data;
      const terms = termsRes.data;

      const agreedAt = partner?.approved_at || null;
      const termsUpdatedAt = terms?.updated_at || null;

      const needsUpdate = !!(
        agreedAt &&
        termsUpdatedAt &&
        new Date(termsUpdatedAt) > new Date(agreedAt)
      );

      setData({
        termsSlug: terms?.slug || 'obchodni-podminky',
        termsTitle: terms?.title || 'Všeobecné obchodní podmínky',
        termsVersion: terms?.version || null,
        termsUpdatedAt,
        agreedAt,
        needsUpdate,
      });
      setLoading(false);
    };
    load();
  }, [partnerId]);

  if (loading) {
    return (
      <div className="luxury-card p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--neon-gold))]" />
      </div>
    );
  }

  if (!data) return null;

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('cs-CZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const accepted = !!data.agreedAt && !data.needsUpdate;

  return (
    <div className="luxury-card overflow-hidden">
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
          <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">Podmínky spolupráce</h3>
        </div>

        {/* Status bar */}
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${
          accepted
            ? 'border-[hsl(160_55%_45%/0.3)] bg-[hsl(160_55%_45%/0.06)]'
            : 'border-[hsl(43_90%_55%/0.3)] bg-[hsl(43_90%_55%/0.06)]'
        }`}>
          {accepted ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-[hsl(160_55%_45%)] shrink-0" />
              <span className="text-sm text-[hsl(160_55%_45%)]">Podmínky přijaty</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-[hsl(43_90%_55%)] shrink-0" />
              <span className="text-sm text-[hsl(43_90%_55%)]">
                {data.agreedAt ? 'Podmínky byly aktualizovány — vyžadováno nové přijetí' : 'Podmínky dosud nebyly přijaty'}
              </span>
            </>
          )}
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg bg-[hsl(var(--muted)/0.3)] border border-[hsl(var(--border)/0.2)] px-4 py-3">
            <span className="block text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted-gray))] mb-1">Dokument</span>
            <a
              href={`/legal/${data.termsSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-[hsl(var(--neon-gold))] hover:underline inline-flex items-center gap-1.5"
            >
              {data.termsTitle}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="rounded-lg bg-[hsl(var(--muted)/0.3)] border border-[hsl(var(--border)/0.2)] px-4 py-3">
            <span className="block text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted-gray))] mb-1">Verze</span>
            <span className="text-sm font-medium text-[hsl(var(--text-silver))]">
              {data.termsVersion || 'Základní'}
            </span>
          </div>

          <div className="rounded-lg bg-[hsl(var(--muted)/0.3)] border border-[hsl(var(--border)/0.2)] px-4 py-3">
            <span className="block text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted-gray))] mb-1">Datum souhlasu</span>
            <span className="text-sm font-medium text-[hsl(var(--text-silver))]">
              {formatDate(data.agreedAt)}
            </span>
          </div>

          <div className="rounded-lg bg-[hsl(var(--muted)/0.3)] border border-[hsl(var(--border)/0.2)] px-4 py-3">
            <span className="block text-[10px] uppercase tracking-widest text-[hsl(var(--text-muted-gray))] mb-1">Poslední aktualizace podmínek</span>
            <span className="text-sm font-medium text-[hsl(var(--text-silver))]">
              {formatDate(data.termsUpdatedAt)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfluencerTermsSection;
