import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2, Pause, Play, XCircle, Shuffle } from 'lucide-react';

interface ContestOption {
  id: string;
  title: string;
  status: string;
  tickets_sold: number;
  tickets_total: number;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Aktivní',
  paused: 'Pozastavená',
  closed: 'Uzavřená',
  pending: 'Čeká',
  draft: 'Koncept',
};

export const ContestControlPanel: React.FC = () => {
  const [contests, setContests] = useState<ContestOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'close' | 'draw' | null>(null);

  const selected = contests.find((c) => c.id === selectedId);

  const fetchContests = async () => {
    setLoading(true);
    try {
      const { data: contestRows, error: contestError } = await supabase
        .from('contests')
        .select('id, title, status, ticket_count')
        .order('created_at', { ascending: false });

      if (contestError) throw contestError;
      if (!contestRows || contestRows.length === 0) {
        setContests([]);
        return;
      }

      const ids = contestRows.map((c) => c.id);
      const { data: progressRows } = await supabase
        .from('contest_progress')
        .select('contest_id, tickets_sold, tickets_total')
        .in('contest_id', ids);

      const progressMap: Record<string, { tickets_sold: number; tickets_total: number }> = {};
      (progressRows || []).forEach((r) => {
        progressMap[r.contest_id] = {
          tickets_sold: r.tickets_sold ?? 0,
          tickets_total: r.tickets_total ?? 1_000_000,
        };
      });

      const mapped: ContestOption[] = contestRows.map((c) => {
        const p = progressMap[c.id];
        return {
          id: c.id,
          title: c.title,
          status: c.status,
          tickets_sold: p?.tickets_sold ?? 0,
          tickets_total: p?.tickets_total ?? c.ticket_count ?? 1_000_000,
        };
      });

      setContests(mapped);
      if (!selectedId && mapped.length > 0) {
        setSelectedId(mapped[0].id);
      }
    } catch (err) {
      console.error('Error fetching contests:', err);
      toast({ title: 'Chyba', description: 'Nepodařilo se načíst soutěže.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContests();
  }, []);

  const callRpc = async (
    rpcName: string,
    params: { contest_id?: string; p_contest_id?: string }
  ): Promise<{ error: Error | null }> => {
    const { error } = await supabase.rpc(rpcName as any, params);
    return { error: error ? new Error(error.message) : null };
  };

  const handlePause = async () => {
    if (!selectedId) return;
    setActionLoading('pause');
    try {
      const { error } = await callRpc('pause_contest', { contest_id: selectedId });
      if (error) throw error;
      toast({ title: 'Úspěch', description: 'Soutěž byla pozastavena.' });
      fetchContests();
    } catch (err) {
      toast({
        title: 'Chyba',
        description: (err as Error).message || 'Nepodařilo se pozastavit soutěž.',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async () => {
    if (!selectedId) return;
    setActionLoading('resume');
    try {
      const { error } = await callRpc('resume_contest', { contest_id: selectedId });
      if (error) throw error;
      toast({ title: 'Úspěch', description: 'Soutěž byla obnovena.' });
      fetchContests();
    } catch (err) {
      toast({
        title: 'Chyba',
        description: (err as Error).message || 'Nepodařilo se obnovit soutěž.',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleClose = async () => {
    if (!selectedId) return;
    setConfirmAction(null);
    setActionLoading('close');
    try {
      const { error } = await callRpc('close_contest', { p_contest_id: selectedId });
      if (error) throw error;
      toast({ title: 'Úspěch', description: 'Soutěž byla uzavřena.' });
      fetchContests();
    } catch (err) {
      toast({
        title: 'Chyba',
        description: (err as Error).message || 'Nepodařilo se uzavřít soutěž.',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleTriggerDraw = async () => {
    if (!selectedId) return;
    setConfirmAction(null);
    setActionLoading('draw');
    try {
      const { error } = await callRpc('trigger_contest_draw', { contest_id: selectedId });
      if (error) throw error;
      toast({ title: 'Úspěch', description: 'Soutěžní mechanismus byl spuštěn.' });
      fetchContests();
    } catch (err) {
      toast({
        title: 'Chyba',
        description: (err as Error).message || 'Nepodařilo se spustit soutěžní mechanismus.',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const isActionDisabled = (action: string) => {
    if (!selected) return true;
    if (selected.status === 'closed') {
      return action !== 'draw'; // Only Trigger Draw might be relevant for closed
    }
    return false;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Contest Control</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Správa životního cyklu soutěží – pozastavení, obnovení, uzavření a soutěžní mechanismus.
        </p>
      </div>

      <Card className="bg-card/40 border border-white/10">
        <CardHeader>
          <CardTitle>Vyberte soutěž</CardTitle>
          <CardDescription>Načteno z public.contests a contest_progress</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Soutěž</label>
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger className="w-full max-w-md">
                    <SelectValue placeholder="Vyberte soutěž..." />
                  </SelectTrigger>
                  <SelectContent>
                    {contests.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title} ({c.tickets_sold.toLocaleString('cs-CZ')} / {c.tickets_total.toLocaleString('cs-CZ')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selected && (
                <>
                  <div className="rounded-lg border border-white/10 bg-muted/30 p-4 space-y-2">
                    <h3 className="font-medium">Informace o soutěži</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Název:</span>
                        <p className="font-medium">{selected.title}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status:</span>
                        <p>
                          <Badge
                            variant={
                              selected.status === 'active'
                                ? 'default'
                                : selected.status === 'paused'
                                  ? 'secondary'
                                  : selected.status === 'closed'
                                    ? 'destructive'
                                    : 'outline'
                            }
                            className={
                              selected.status === 'paused' ? 'bg-orange-500 text-white hover:bg-orange-600' : ''
                            }
                          >
                            {STATUS_LABELS[selected.status] ?? selected.status}
                          </Badge>
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tikety prodány:</span>
                        <p className="font-medium tabular-nums">{selected.tickets_sold.toLocaleString('cs-CZ')}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tikety celkem:</span>
                        <p className="font-medium tabular-nums">{selected.tickets_total.toLocaleString('cs-CZ')}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={handlePause}
                      disabled={isActionDisabled('pause') || selected.status !== 'active' || !!actionLoading}
                    >
                      {actionLoading === 'pause' ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Pause className="h-4 w-4 mr-2" />
                      )}
                      Pause Contest
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleResume}
                      disabled={isActionDisabled('resume') || selected.status !== 'paused' || !!actionLoading}
                    >
                      {actionLoading === 'resume' ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Resume Contest
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setConfirmAction('close')}
                      disabled={selected.status === 'closed' || !!actionLoading}
                    >
                      {actionLoading === 'close' ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <XCircle className="h-4 w-4 mr-2" />
                      )}
                      Uzavřít soutěž
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setConfirmAction('draw')}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === 'draw' ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Shuffle className="h-4 w-4 mr-2" />
                      )}
                      Trigger Draw
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmAction} onOpenChange={() => !actionLoading && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'close' ? 'Uzavřít soutěž?' : 'Spustit soutěžní mechanismus?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'close'
                ? 'Při uzavření soutěže bude vybrán hlavní výherce a soutěž nebude možné obnovit. Pokračovat?'
                : 'Spustí se soutěžní mechanismus hlavní výhry pro vybranou soutěž. Pokračovat?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!actionLoading}>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAction === 'close' ? handleClose : handleTriggerDraw}
              disabled={!!actionLoading}
              className={confirmAction === 'close' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {confirmAction === 'close' ? 'Uzavřít soutěž' : 'Spustit soutěžní mechanismus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
