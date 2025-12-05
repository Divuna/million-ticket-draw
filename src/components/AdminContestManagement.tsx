import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

interface ContestData {
  contest_id: string;
  title: string;
  description: string | null;
  main_prize: string;
  main_image: string | null;
  status: string;
  ticket_count: number;
  ticket_price: number;
  tickets_sold: number;
  progress_percentage: number;
  total_miocoin_bonus: number | null;
  created_at: string;
  updated_at: string;
}

interface CreateContestForm {
  title: string;
  description: string;
  main_prize: string;
  ticket_count: number;
  ticket_price: number;
  status: string;
  main_image_file: File | null;
}

interface CreateContestModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const CreateContestModal: React.FC<CreateContestModalProps> = ({ open, onClose, onCreated }) => {
  const [form, setForm] = useState<CreateContestForm>({
    title: "",
    description: "",
    main_prize: "",
    ticket_count: 1000000,
    ticket_price: 1,
    status: "pending",
    main_image_file: null,
  });
  const [saving, setSaving] = useState(false);

  const handleChange =
    (field: keyof CreateContestForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = field === "ticket_count" || field === "ticket_price" ? Number(e.target.value || 0) : e.target.value;
      setForm((prev) => ({ ...prev, [field]: value as any }));
    };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setForm((prev) => ({ ...prev, main_image_file: file }));
  };

  const handleImageUpload = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop();
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const filePath = fileName;

    const { error } = await supabase.storage.from("contest-images").upload(filePath, file);

    if (error) {
      throw error;
    }

    return filePath;
  };

  const handleSave = async () => {
    if (!form.title || !form.main_prize || !form.ticket_count || !form.ticket_price) {
      toast({
        title: "Chyba",
        description: "Vyplň název, hlavní výhru, počet tiketů a cenu tiketu.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      let imagePath: string | null = null;

      if (form.main_image_file) {
        imagePath = await handleImageUpload(form.main_image_file);
      }

      const { error } = await supabase.rpc("admin_manage_contest", {
        p_contest_id: null,
        p_title: form.title,
        p_description: form.description || null,
        p_main_prize: form.main_prize,
        p_main_image: imagePath,
        p_status: form.status,
        p_ticket_count: form.ticket_count,
        p_ticket_price: form.ticket_price,
        p_operation: "create",
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Soutěž vytvořena",
        description: "Nová soutěž byla úspěšně uložena.",
      });

      setForm({
        title: "",
        description: "",
        main_prize: "",
        ticket_count: 1000000,
        ticket_price: 1,
        status: "pending",
        main_image_file: null,
      });

      onCreated();
      onClose();
    } catch (err: any) {
      console.error("Error creating contest:", err);
      toast({
        title: "Chyba",
        description: err?.message || "Nepodařilo se vytvořit soutěž. Zkus to prosím znovu.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vytvořit novou soutěž</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Název soutěže</Label>
            <Input value={form.title} onChange={handleChange("title")} placeholder="Např. Corvette C8" />
          </div>

          <div>
            <Label>Popis</Label>
            <Textarea
              value={form.description}
              onChange={handleChange("description")}
              placeholder="Stručný popis soutěže…"
            />
          </div>

          <div>
            <Label>Hlavní výhra</Label>
            <Input value={form.main_prize} onChange={handleChange("main_prize")} placeholder="Např. Corvette C8" />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <Label>Počet tiketů</Label>
              <Input type="number" min={1} value={form.ticket_count} onChange={handleChange("ticket_count")} />
            </div>
            <div className="flex-1">
              <Label>Cena tiketu (MioCoins)</Label>
              <Input type="number" min={1} value={form.ticket_price} onChange={handleChange("ticket_price")} />
            </div>
          </div>

          <div>
            <Label>Obrázek hlavní výhry (upload)</Label>
            <Input type="file" accept="image/*" onChange={handleFileChange} />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Zavřít
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Vytvořit soutěž
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const AdminContestManagement: React.FC = () => {
  const [contests, setContests] = useState<ContestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const loadContests = async () => {
    setLoading(true);

    const { data, error } = await supabase.rpc("get_contest_management_data", { p_contest_id_filter: null });

    if (error) {
      console.error("Error fetching contests:", error);
      toast({
        title: "Chyba při načítání soutěží",
        description: error.message || "Nepodařilo se načíst seznam soutěží. Zkus to znovu.",
        variant: "destructive",
      });
      setContests([]);
      setLoading(false);
      return;
    }

    setContests((data || []) as ContestData[]);
    setLoading(false);
  };

  useEffect(() => {
    loadContests();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Správa soutěží</h2>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nová soutěž
        </Button>
      </div>

      <Card className="bg-card/40 border border-white/10">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : contests.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">Žádné soutěže nebyly nalezeny.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Název</TableHead>
                  <TableHead className="text-center">Hlavní výhra</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Tikety</TableHead>
                  <TableHead className="text-center">% hotovo</TableHead>
                  <TableHead className="text-center">Bonusové MioCoiny</TableHead>
                  <TableHead className="text-right">Akce</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {contests.map((contest) => (
                  <TableRow key={contest.contest_id}>
                    <TableCell>
                      <div className="font-medium">{contest.title}</div>
                      <div className="text-xs text-muted-foreground">ID: {contest.contest_id}</div>
                    </TableCell>

                    <TableCell className="text-center">{contest.main_prize}</TableCell>

                    <TableCell className="text-center">
                      <Badge variant={contest.status === "active" ? "default" : "secondary"}>{contest.status}</Badge>
                    </TableCell>

                    <TableCell className="text-center">
                      {contest.tickets_sold} / {contest.ticket_count}
                    </TableCell>

                    <TableCell className="text-center">{contest.progress_percentage}%</TableCell>

                    <TableCell className="text-center">
                      {contest.total_miocoin_bonus?.toLocaleString("cs-CZ") || 0}
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => (window.location.href = `/admin/contest/${contest.contest_id}`)}
                      >
                        Otevřít
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateContestModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={loadContests} />
    </div>
  );
};

export default AdminContestManagement;
