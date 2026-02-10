/**
 * ⚠️ INFLUENCER SYSTEM — Monetary CZK payouts, invoiced, admin-controlled.
 * Terms acceptance uses the shared `user_legal_acceptances` table (same mechanism as user profiles).
 * This component is intentionally separate from the Player Referral system.
 */
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { FileText, CheckCircle2, AlertTriangle, ExternalLink, Loader2, ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { transformContentToHtml } from '@/lib/cms-content-utils';

interface TermsData {
  termsSlug: string;
  termsTitle: string;
  termsVersion: string | null;
  termsUpdatedAt: string | null;
  agreedAt: string | null;
  needsUpdate: boolean;
  termsContent: string | null;
}

interface Props {
  partnerId: string;
  onAccepted?: () => void;
}

const InfluencerTermsSection: React.FC<Props> = ({ partnerId, onAccepted }) => {
  const { user } = useAuth();
  const [data, setData] = useState<TermsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const loadData = async () => {
    if (!user) return;

    const [termsRes, acceptanceRes] = await Promise.all([
      supabase
        .from('content_pages')
        .select('slug, title, version, updated_at, content')
        .eq('slug', 'obchodni-podminky')
        .eq('section', 'legal')
        .maybeSingle(),
      supabase
        .from('user_legal_acceptances')
        .select('accepted_at, document_version')
        .eq('user_id', user.id)
        .eq('document_slug', 'obchodni-podminky')
        .order('accepted_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const terms = termsRes.data;
    const acceptance = acceptanceRes.data;

    const agreedAt = acceptance?.accepted_at || null;
    const termsVersion = terms?.version || null;
    const termsUpdatedAt = terms?.updated_at || null;

    const needsUpdate = !!(
      agreedAt &&
      termsVersion &&
      acceptance?.document_version &&
      termsVersion !== acceptance.document_version
    );

    setData({
      termsSlug: terms?.slug || 'obchodni-podminky',
      termsTitle: terms?.title || 'Všeobecné obchodní podmínky',
      termsVersion,
      termsUpdatedAt,
      agreedAt,
      needsUpdate,
      termsContent: terms?.content || null,
    });
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [partnerId, user?.id]);

  const handleAccept = async () => {
    if (!user || !data) return;
    setAccepting(true);
    try {
      const [legalRes, partnerRes] = await Promise.all([
        supabase.from('user_legal_acceptances').insert({
          user_id: user.id,
          document_slug: 'obchodni-podminky',
          document_version: data.termsVersion || '1.0',
        }),
        supabase.from('partners').update({
          terms_accepted_at: new Date().toISOString(),
        }).eq('id', partnerId),
      ]);
      if (legalRes.error) throw legalRes.error;
      if (partnerRes.error) throw partnerRes.error;
      toast.success('Podmínky byly úspěšně přijaty');
      setShowTerms(false);
      await loadData();
      onAccepted?.();
    } catch (e: any) {
      toast.error('Nepodařilo se uložit souhlas: ' + (e.message || ''));
    } finally {
      setAccepting(false);
    }
  };

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
            <button
              onClick={() => setShowTerms(!showTerms)}
              className="text-sm font-medium text-[hsl(var(--neon-gold))] hover:underline inline-flex items-center gap-1.5"
            >
              {data.termsTitle}
              {showTerms ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
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

        {/* Inline terms content — displayed without navigating away */}
        {showTerms && data.termsContent && (
          <div className="space-y-4">
            <div
              className="rounded-xl border border-[hsl(var(--border)/0.2)] bg-[hsl(var(--muted)/0.15)] p-5 max-h-[60vh] overflow-y-auto cms-content"
              dangerouslySetInnerHTML={{ __html: transformContentToHtml(data.termsContent) }}
            />

            {/* Sticky action area */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {!accepted && (
                <button
                  onClick={handleAccept}
                  disabled={accepting}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--neon-gold)/0.4)] bg-[hsl(var(--neon-gold)/0.12)] hover:bg-[hsl(var(--neon-gold)/0.2)] text-[hsl(var(--neon-gold))] font-semibold text-sm px-5 py-3 transition-colors disabled:opacity-50"
                >
                  {accepting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {accepting ? 'Ukládám…' : 'Souhlasím a vrátit se zpět'}
                </button>
              )}
              <button
                onClick={() => setShowTerms(false)}
                className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.2)] hover:bg-[hsl(var(--muted)/0.4)] text-[hsl(var(--text-silver))] text-sm px-5 py-3 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Zpět do administrace
              </button>
            </div>
          </div>
        )}

        {/* Accept button when terms are collapsed but not yet accepted */}
        {!showTerms && !accepted && (
          <button
            onClick={() => setShowTerms(true)}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--neon-gold)/0.4)] bg-[hsl(var(--neon-gold)/0.08)] hover:bg-[hsl(var(--neon-gold)/0.15)] text-[hsl(var(--neon-gold))] font-semibold text-sm px-5 py-3 transition-colors"
          >
            <FileText className="w-4 h-4" />
            Zobrazit a přijmout podmínky
          </button>
        )}
      </div>
    </div>
  );
};

export default InfluencerTermsSection;
