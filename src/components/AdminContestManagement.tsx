import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import CreateContestModal from "@/components/admin/CreateContestModal";

interface ContestData {
  contest_id: string;
  title: string;
  description: string;
  main_prize: string;
  main_image: string;
  status: string;
  ticket_count: number;
  ticket_price: number;
  tickets_sold: number;
  progress_percentage: number;
  total_miocoin_bonus: number;
  created_at: string;
  updated_at: string;
}

export default function AdminContestManagement() {
  const [contests, setContests] = useState<ContestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const loadContests = async () => {
    setLoading(true);

    const { data, error } = await supabase.rpc("get_contest_management_data", { p_contest_id_filter: null });

    if (!error && data) {
      setContests(data);
    }

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
                  <TableHead className="text-center">Bonusy MioCoin</TableHead>
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
}
