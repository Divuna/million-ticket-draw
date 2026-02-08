import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { AdminCampaignForm } from '@/components/AdminCampaignForm';
import { AdminCampaignAssignment } from '@/components/AdminCampaignAssignment';
import { Plus, Pencil, Users, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';

interface Campaign {
  id: string;
  name: string;
  bonus_czk_per_new_user: number;
  bonus_mc_for_user: number;
  starts_at: string;
  ends_at: string;
  active: boolean;
  created_at: string;
}

const AdminInfluencerCampaigns: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  // Form dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);

  // Assignment dialog state
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignCampaignId, setAssignCampaignId] = useState<string | null>(null);
  const [assignCampaignName, setAssignCampaignName] = useState('');

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('influencer_campaigns')
      .select('id, name, bonus_czk_per_new_user, bonus_mc_for_user, starts_at, ends_at, active, created_at')
      .order('created_at', { ascending: false });

    if (!error && data) setCampaigns(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user && isAdmin) fetchCampaigns();
  }, [user, isAdmin, fetchCampaigns]);

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Přístup odepřen</p>
      </div>
    );
  }

  const handleCreate = () => {
    setEditCampaign(null);
    setFormOpen(true);
  };

  const handleEdit = (c: Campaign) => {
    setEditCampaign(c);
    setFormOpen(true);
  };

  const handleAssign = (c: Campaign) => {
    setAssignCampaignId(c.id);
    setAssignCampaignName(c.name);
    setAssignOpen(true);
  };

  const formatDate = (iso: string) => {
    try {
      return format(new Date(iso), 'd. M. yyyy HH:mm', { locale: cs });
    } catch {
      return iso;
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/influencers')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Influencer Kampaně</h1>
              <p className="text-sm text-muted-foreground">Správa kampaní a přiřazení influencerů</p>
            </div>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Nová kampaň
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Název</TableHead>
                <TableHead className="text-right">Bonus CZK</TableHead>
                <TableHead className="text-right">Bonus MC</TableHead>
                <TableHead>Začátek</TableHead>
                <TableHead>Konec</TableHead>
                <TableHead>Stav</TableHead>
                <TableHead className="text-right">Akce</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    Žádné kampaně. Vytvořte první kampaň.
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right">{c.bonus_czk_per_new_user} Kč</TableCell>
                    <TableCell className="text-right">{c.bonus_mc_for_user} MC</TableCell>
                    <TableCell className="text-sm">{formatDate(c.starts_at)}</TableCell>
                    <TableCell className="text-sm">{formatDate(c.ends_at)}</TableCell>
                    <TableCell>
                      <Badge variant={c.active ? 'default' : 'secondary'}>
                        {c.active ? 'Aktivní' : 'Neaktivní'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(c)} title="Upravit">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleAssign(c)} title="Přiřadit influencery">
                          <Users className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Dialogs */}
      <AdminCampaignForm
        open={formOpen}
        onOpenChange={setFormOpen}
        campaign={editCampaign}
        onSaved={fetchCampaigns}
      />
      <AdminCampaignAssignment
        open={assignOpen}
        onOpenChange={setAssignOpen}
        campaignId={assignCampaignId}
        campaignName={assignCampaignName}
      />
    </div>
  );
};

export default AdminInfluencerCampaigns;
