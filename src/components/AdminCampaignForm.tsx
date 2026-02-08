import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

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

interface AdminCampaignFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: Campaign | null;
  onSaved: () => void;
}

export const AdminCampaignForm: React.FC<AdminCampaignFormProps> = ({
  open, onOpenChange, campaign, onSaved
}) => {
  const [name, setName] = useState('');
  const [bonusCzk, setBonusCzk] = useState(0);
  const [bonusMc, setBonusMc] = useState(0);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [active, setActive] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (campaign) {
      setName(campaign.name);
      setBonusCzk(campaign.bonus_czk_per_new_user);
      setBonusMc(campaign.bonus_mc_for_user);
      setStartsAt(campaign.starts_at.slice(0, 16));
      setEndsAt(campaign.ends_at.slice(0, 16));
      setActive(campaign.active);
    } else {
      setName('');
      setBonusCzk(0);
      setBonusMc(0);
      setStartsAt('');
      setEndsAt('');
      setActive(false);
    }
  }, [campaign, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startsAt || !endsAt) {
      toast.error('Vyplňte všechna povinná pole');
      return;
    }

    setSaving(true);
    const payload = {
      name,
      bonus_czk_per_new_user: bonusCzk,
      bonus_mc_for_user: bonusMc,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      active,
    };

    let error;
    if (campaign) {
      ({ error } = await supabase
        .from('influencer_campaigns')
        .update(payload)
        .eq('id', campaign.id));
    } else {
      ({ error } = await supabase
        .from('influencer_campaigns')
        .insert(payload));
    }

    setSaving(false);
    if (error) {
      toast.error('Chyba při ukládání: ' + error.message);
    } else {
      toast.success(campaign ? 'Kampaň aktualizována' : 'Kampaň vytvořena');
      onOpenChange(false);
      onSaved();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{campaign ? 'Upravit kampaň' : 'Nová kampaň'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Název kampaně *</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Název" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bonusCzk">Bonus CZK / nový uživatel</Label>
              <Input id="bonusCzk" type="number" min={0} step={0.01} value={bonusCzk} onChange={e => setBonusCzk(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bonusMc">Bonus MC pro uživatele</Label>
              <Input id="bonusMc" type="number" min={0} step={1} value={bonusMc} onChange={e => setBonusMc(Number(e.target.value))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startsAt">Začátek *</Label>
              <Input id="startsAt" type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endsAt">Konec *</Label>
              <Input id="endsAt" type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch id="active" checked={active} onCheckedChange={setActive} />
            <Label htmlFor="active">Aktivní</Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Zrušit</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {campaign ? 'Uložit' : 'Vytvořit'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
