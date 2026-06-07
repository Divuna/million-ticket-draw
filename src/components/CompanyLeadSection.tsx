import { useEffect, useState, useCallback } from 'react';
import { Building2, FileText, Plus, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { AddCompanyLeadDialog } from './AddCompanyLeadDialog';

interface CompanyLead {
  id: string;
  company_name: string;
  company_email: string;
  status: string;
  created_at: string;
}

interface Props {
  affiliateId: string;
}

function leadStatusBadge(status: string) {
  const b =
    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap';
  switch (status) {
    case 'sent_to_company':
      return (
        <span className={`${b} bg-[hsl(43_90%_55%/0.15)] text-[hsl(43_90%_55%)] border-[hsl(43_90%_55%/0.3)]`}>
          Odesláno firmě
        </span>
      );
    case 'company_confirmed':
      return (
        <span className={`${b} bg-[hsl(180_55%_45%/0.15)] text-[hsl(180_55%_45%)] border-[hsl(180_55%_45%/0.3)]`}>
          Firma potvrdila
        </span>
      );
    case 'company_rejected':
      return (
        <span className={`${b} bg-[hsl(0_72%_51%/0.15)] text-[hsl(0_72%_51%)] border-[hsl(0_72%_51%/0.3)]`}>
          Firma zamítla
        </span>
      );
    case 'pending_admin_approval':
      return (
        <span className={`${b} bg-[hsl(215_70%_55%/0.15)] text-[hsl(215_70%_55%)] border-[hsl(215_70%_55%/0.3)]`}>
          Čeká na schválení adminem
        </span>
      );
    case 'approved':
      return (
        <span className={`${b} bg-[hsl(160_55%_45%/0.15)] text-[hsl(160_55%_45%)] border-[hsl(160_55%_45%/0.3)]`}>
          Schváleno
        </span>
      );
    case 'admin_rejected':
      return (
        <span className={`${b} bg-[hsl(0_60%_40%/0.15)] text-[hsl(0_60%_40%)] border-[hsl(0_60%_40%/0.3)]`}>
          Zamítnuto adminem
        </span>
      );
    case 'expired':
      return (
        <span className={`${b} bg-[hsl(215_15%_70%/0.1)] text-[hsl(215_15%_70%)] border-[hsl(215_15%_70%/0.2)]`}>
          Expirováno
        </span>
      );
    default:
      return (
        <span className={`${b} bg-muted text-muted-foreground border-border`}>
          {status}
        </span>
      );
  }
}

export function CompanyLeadSection({ affiliateId }: Props) {
  const [leads, setLeads] = useState<CompanyLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from('affiliate_company_leads')
        .select('id,company_name,company_email,status,created_at')
        .eq('affiliate_id', affiliateId)
        .order('created_at', { ascending: false });
      setLeads((data ?? []) as CompanyLead[]);
    } finally {
      setLoading(false);
    }
  }, [affiliateId]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  return (
    <>
      <div
        className="luxury-card overflow-hidden"
        data-testid="company-lead-section"
      >
        <div className="p-6 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[hsl(var(--neon-gold))]" />
              <h3 className="text-base font-semibold text-[hsl(var(--text-silver))]">
                Žádosti o registraci firem
              </h3>
              {leads.length > 0 && (
                <Badge className="bg-[hsl(var(--neon-gold)/0.15)] text-[hsl(var(--neon-gold))] border-[hsl(var(--neon-gold)/0.3)]">
                  {leads.length}
                </Badge>
              )}
            </div>
            <Button
              onClick={() => setDialogOpen(true)}
              size="sm"
              data-testid="add-company-lead-btn"
              className="bg-[hsl(var(--neon-gold))] text-[hsl(220_45%_8%)] hover:bg-[hsl(43_90%_48%)] font-semibold gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Přidat firmu
            </Button>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--text-muted-gray))]" />
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <Building2 className="w-10 h-10 mx-auto opacity-20 text-[hsl(var(--text-muted-gray))]" />
              <p className="text-sm text-[hsl(var(--text-muted-gray))]">
                Zatím nemáte žádné žádosti o registraci firem.
              </p>
              <Button
                onClick={() => setDialogOpen(true)}
                variant="outline"
                size="sm"
                className="border-[hsl(var(--neon-gold)/0.4)] text-[hsl(var(--neon-gold))] hover:bg-[hsl(var(--neon-gold)/0.08)] gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Přidat firmu
              </Button>
            </div>
          ) : (
            <ul className="space-y-2" data-testid="company-lead-list">
              {leads.map((lead) => (
                <li
                  key={lead.id}
                  className="flex items-center gap-3 rounded-lg border border-[hsl(var(--border)/0.3)] bg-[hsl(var(--muted)/0.15)] px-3 py-2.5"
                >
                  <Building2 className="w-4 h-4 text-[hsl(var(--text-muted-gray))] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[hsl(var(--text-silver))] truncate">
                      {lead.company_name}
                    </p>
                    <p className="text-xs text-[hsl(var(--text-muted-gray))] truncate">
                      {lead.company_email}
                    </p>
                  </div>
                  {leadStatusBadge(lead.status)}
                  <span className="text-xs text-[hsl(var(--text-muted-gray))] shrink-0">
                    {format(new Date(lead.created_at), 'd. M. yyyy', { locale: cs })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <AddCompanyLeadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={loadLeads}
      />
    </>
  );
}
