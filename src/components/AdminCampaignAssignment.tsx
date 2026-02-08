import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { UserPlus, UserMinus, Loader2 } from 'lucide-react';

interface Partner {
  id: string;
  name: string;
  company_name: string | null;
  status: string;
}

interface AdminCampaignAssignmentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string | null;
  campaignName: string;
}

export const AdminCampaignAssignment: React.FC<AdminCampaignAssignmentProps> = ({
  open, onOpenChange, campaignId, campaignName
}) => {
  const [influencers, setInfluencers] = useState<Partner[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);

    const [influencersRes, assignmentsRes] = await Promise.all([
      supabase
        .from('partners')
        .select('id, name, company_name, status')
        .ilike('notes', '%influencer%')
        .eq('status', 'approved')
        .order('name'),
      supabase
        .from('influencer_campaign_partners')
        .select('influencer_partner_id')
        .eq('campaign_id', campaignId),
    ]);

    if (influencersRes.data) setInfluencers(influencersRes.data);
    if (assignmentsRes.data) {
      setAssignedIds(new Set(assignmentsRes.data.map(a => a.influencer_partner_id)));
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    if (open && campaignId) fetchData();
  }, [open, campaignId, fetchData]);

  const handleAssign = async (partnerId: string) => {
    if (!campaignId) return;
    setActionLoading(partnerId);
    const { error } = await supabase
      .from('influencer_campaign_partners')
      .insert({ campaign_id: campaignId, influencer_partner_id: partnerId });

    if (error) {
      toast.error('Chyba při přiřazení: ' + error.message);
    } else {
      setAssignedIds(prev => new Set(prev).add(partnerId));
      toast.success('Influencer přiřazen');
    }
    setActionLoading(null);
  };

  const handleUnassign = async (partnerId: string) => {
    if (!campaignId) return;
    setActionLoading(partnerId);
    const { error } = await supabase
      .from('influencer_campaign_partners')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('influencer_partner_id', partnerId);

    if (error) {
      toast.error('Chyba při odebrání: ' + error.message);
    } else {
      setAssignedIds(prev => {
        const next = new Set(prev);
        next.delete(partnerId);
        return next;
      });
      toast.success('Influencer odebrán');
    }
    setActionLoading(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Přiřazení influencerů – {campaignName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : influencers.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            Žádní schválení influenceři k dispozici.
          </p>
        ) : (
          <div className="space-y-2">
            {influencers.map(inf => {
              const isAssigned = assignedIds.has(inf.id);
              const isLoading = actionLoading === inf.id;
              return (
                <div key={inf.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-sm truncate">
                      {inf.company_name || inf.name}
                    </span>
                    {isAssigned && (
                      <Badge variant="secondary" className="text-xs shrink-0">Přiřazen</Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={isAssigned ? 'destructive' : 'default'}
                    disabled={isLoading}
                    onClick={() => isAssigned ? handleUnassign(inf.id) : handleAssign(inf.id)}
                    className="shrink-0 ml-2"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isAssigned ? (
                      <><UserMinus className="w-4 h-4 mr-1" /> Odebrat</>
                    ) : (
                      <><UserPlus className="w-4 h-4 mr-1" /> Přiřadit</>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
