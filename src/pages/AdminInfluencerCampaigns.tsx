import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import {
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  Users,
  CalendarDays,
  Loader2,
  ChevronLeft,
  X,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

// ---------- Types ----------

interface Campaign {
  id: string;
  name: string;
  active: boolean;
  bonus_czk_per_new_user: number;
  bonus_mc_for_user: number;
  starts_at: string;
  ends_at: string;
  created_at: string;
}

interface CampaignForm {
  name: string;
  active: boolean;
  bonus_czk_per_new_user: number;
  bonus_mc_for_user: number;
  starts_at: string;
  ends_at: string;
}

interface InfluencerPartner {
  id: string;
  name: string;
  company_name: string | null;
  status: string;
}

const EMPTY_FORM: CampaignForm = {
  name: "",
  active: true,
  bonus_czk_per_new_user: 0,
  bonus_mc_for_user: 0,
  starts_at: "",
  ends_at: "",
};

// ---------- Component ----------

const AdminInfluencerCampaigns: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();

  // Campaign list
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  // Form dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CampaignForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Assignment dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignCampaign, setAssignCampaign] = useState<Campaign | null>(null);
  const [influencers, setInfluencers] = useState<InfluencerPartner[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);

  // ---------- Fetch campaigns ----------

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("influencer_campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Nepodařilo se načíst kampaně");
    } else {
      setCampaigns((data as Campaign[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchCampaigns();
  }, [isAdmin, fetchCampaigns]);

  // ---------- Create / Edit ----------

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (c: Campaign) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      active: c.active,
      bonus_czk_per_new_user: c.bonus_czk_per_new_user,
      bonus_mc_for_user: c.bonus_mc_for_user,
      starts_at: c.starts_at ? c.starts_at.slice(0, 16) : "",
      ends_at: c.ends_at ? c.ends_at.slice(0, 16) : "",
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Název kampaně je povinný");
      return;
    }
    if (!form.starts_at || !form.ends_at) {
      toast.error("Začátek i konec kampaně jsou povinné");
      return;
    }

    setSaving(true);

    const payload = {
      name: form.name.trim(),
      active: form.active,
      bonus_czk_per_new_user: Number(form.bonus_czk_per_new_user),
      bonus_mc_for_user: Number(form.bonus_mc_for_user),
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
    };

    if (editingId) {
      const { error } = await supabase
        .from("influencer_campaigns")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        toast.error("Nepodařilo se uložit kampaň");
      } else {
        toast.success("Kampaň aktualizována");
      }
    } else {
      const { error } = await supabase
        .from("influencer_campaigns")
        .insert(payload);
      if (error) {
        toast.error("Nepodařilo se vytvořit kampaň");
      } else {
        toast.success("Kampaň vytvořena");
      }
    }

    setSaving(false);
    setFormOpen(false);
    fetchCampaigns();
  };

  // ---------- Delete ----------

  const handleDelete = async (id: string) => {
    if (!window.confirm("Opravdu chcete smazat tuto kampaň?")) return;

    // Remove assignments first
    await supabase
      .from("influencer_campaign_partners")
      .delete()
      .eq("campaign_id", id);

    const { error } = await supabase
      .from("influencer_campaigns")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Nepodařilo se smazat kampaň");
    } else {
      toast.success("Kampaň smazána");
      fetchCampaigns();
    }
  };

  // ---------- Assignment ----------

  const openAssignment = async (campaign: Campaign) => {
    setAssignCampaign(campaign);
    setAssignOpen(true);
    setAssignLoading(true);

    // Fetch influencers (partners with influencer in notes)
    const { data: partners } = await supabase
      .from("partners")
      .select("id, name, company_name, status")
      .ilike("notes", "%influencer%")
      .eq("status", "approved")
      .order("name");

    setInfluencers((partners as InfluencerPartner[]) || []);

    // Fetch current assignments
    const { data: assignments } = await supabase
      .from("influencer_campaign_partners")
      .select("influencer_partner_id")
      .eq("campaign_id", campaign.id);

    const ids = new Set((assignments || []).map((a) => a.influencer_partner_id));
    setAssignedIds(ids);
    setAssignLoading(false);
  };

  const toggleAssignment = (partnerId: string) => {
    setAssignedIds((prev) => {
      const next = new Set(prev);
      if (next.has(partnerId)) {
        next.delete(partnerId);
      } else {
        next.add(partnerId);
      }
      return next;
    });
  };

  const saveAssignments = async () => {
    if (!assignCampaign) return;
    setAssignSaving(true);

    // Delete all current assignments for this campaign
    await supabase
      .from("influencer_campaign_partners")
      .delete()
      .eq("campaign_id", assignCampaign.id);

    // Insert new assignments
    if (assignedIds.size > 0) {
      const rows = Array.from(assignedIds).map((pid) => ({
        campaign_id: assignCampaign.id,
        influencer_partner_id: pid,
      }));

      const { error } = await supabase
        .from("influencer_campaign_partners")
        .insert(rows);

      if (error) {
        toast.error("Nepodařilo se uložit přiřazení");
        setAssignSaving(false);
        return;
      }
    }

    toast.success("Přiřazení uloženo");
    setAssignSaving(false);
    setAssignOpen(false);
  };

  // ---------- Guards ----------

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">
              Nemáte oprávnění pro přístup k této stránce.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------- Render ----------

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Megaphone className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">
            Influencer kampaně
          </h1>
        </div>

        {/* Actions */}
        <div className="flex justify-end mb-4">
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nová kampaň
          </Button>
        </div>

        {/* Campaign list */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Žádné kampaně. Vytvořte první kampaň.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Název</TableHead>
                      <TableHead>Stav</TableHead>
                      <TableHead>Bonus CZK/uživatel</TableHead>
                      <TableHead>Bonus MC/uživatel</TableHead>
                      <TableHead>Začátek</TableHead>
                      <TableHead>Konec</TableHead>
                      <TableHead className="text-right">Akce</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>
                          {c.active ? (
                            <Badge variant="default">
                              <Check className="h-3 w-3 mr-1" />
                              Aktivní
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="bg-muted text-muted-foreground"
                            >
                              <X className="h-3 w-3 mr-1" />
                              Neaktivní
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{c.bonus_czk_per_new_user} Kč</TableCell>
                        <TableCell>{c.bonus_mc_for_user} MC</TableCell>
                        <TableCell>
                          {format(new Date(c.starts_at), "d. M. yyyy", {
                            locale: cs,
                          })}
                        </TableCell>
                        <TableCell>
                          {format(new Date(c.ends_at), "d. M. yyyy", {
                            locale: cs,
                          })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openAssignment(c)}
                              title="Přiřadit influencery"
                            >
                              <Users className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(c)}
                              title="Upravit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(c.id)}
                              title="Smazat"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* -------- Create / Edit Dialog -------- */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Upravit kampaň" : "Nová kampaň"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Název kampaně</Label>
              <Input
                id="campaign-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Letní kampaň 2026"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bonus-czk">Bonus CZK / nový uživatel</Label>
                <Input
                  id="bonus-czk"
                  type="number"
                  min={0}
                  value={form.bonus_czk_per_new_user}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      bonus_czk_per_new_user: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bonus-mc">Bonus MC / uživatel</Label>
                <Input
                  id="bonus-mc"
                  type="number"
                  min={0}
                  value={form.bonus_mc_for_user}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      bonus_mc_for_user: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="starts-at">Začátek</Label>
                <Input
                  id="starts-at"
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) =>
                    setForm({ ...form, starts_at: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ends-at">Konec</Label>
                <Input
                  id="ends-at"
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) =>
                    setForm({ ...form, ends_at: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="active-switch"
                checked={form.active}
                onCheckedChange={(checked) =>
                  setForm({ ...form, active: checked })
                }
              />
              <Label htmlFor="active-switch">Aktivní</Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={saving}
            >
              Zrušit
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Uložit" : "Vytvořit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------- Assignment Dialog -------- */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Přiřadit influencery — {assignCampaign?.name}
            </DialogTitle>
          </DialogHeader>

          {assignLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : influencers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Žádní schválení influenceři k přiřazení.
            </div>
          ) : (
            <ScrollArea className="max-h-[50vh]">
              <div className="space-y-2 pr-4">
                {influencers.map((inf) => (
                  <label
                    key={inf.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={assignedIds.has(inf.id)}
                      onCheckedChange={() => toggleAssignment(inf.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {inf.company_name || inf.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{inf.name}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      Schválen
                    </Badge>
                  </label>
                ))}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAssignOpen(false)}
              disabled={assignSaving}
            >
              Zrušit
            </Button>
            <Button
              onClick={saveAssignments}
              disabled={assignSaving || influencers.length === 0}
            >
              {assignSaving && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Uložit přiřazení ({assignedIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminInfluencerCampaigns;
