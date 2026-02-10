/**
 * Admin Referral Audit & Control — read-only lists of referral_attempts,
 * referrals, referral_rewards with block/unblock and reward-status actions.
 * Uses existing RPC functions: admin_block_referrer, admin_update_referral_reward.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import {
  Search, Loader2, ShieldBan, ShieldCheck, RotateCcw, Ban,
  FileSearch, Link2, Coins,
} from 'lucide-react';

/* ──────────── Types ──────────── */

interface ReferralAttemptRow {
  id: string;
  referred_user_id: string;
  attempted_code: string | null;
  source: string | null;
  result: string;
  reason: string | null;
  created_at: string;
}

interface ReferralRow {
  referrer_user_id: string;
  referred_user_id: string;
  status: string;
  blocked_at: string | null;
  blocked_reason: string | null;
  created_at: string;
}

interface ReferralRewardRow {
  id: string;
  referrer_user_id: string;
  referred_user_id: string;
  reward_mc: number;
  status: string;
  created_at: string;
  reversed_at: string | null;
}

/* ──────────── Component ──────────── */

const AdminReferralAudit: React.FC = () => {
  const [attempts, setAttempts] = useState<ReferralAttemptRow[]>([]);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [rewards, setRewards] = useState<ReferralRewardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Confirm dialog
  const [confirmAction, setConfirmAction] = useState<{
    type: 'block' | 'unblock' | 'reverse' | 'block_reward' | 'update_reward';
    targetId?: string;
    referrerId?: string;
    newStatus?: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  /* ──────────── Fetch all data ──────────── */

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [attemptsRes, referralsRes, rewardsRes] = await Promise.all([
        supabase
          .from('referral_attempts')
          .select('id, referred_user_id, attempted_code, source, result, reason, created_at')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('referrals')
          .select('referrer_user_id, referred_user_id, status, blocked_at, blocked_reason, created_at')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('referral_rewards')
          .select('id, referrer_user_id, referred_user_id, reward_mc, status, created_at, reversed_at')
          .order('created_at', { ascending: false })
          .limit(500),
      ]);

      if (attemptsRes.error) throw attemptsRes.error;
      if (referralsRes.error) throw referralsRes.error;
      if (rewardsRes.error) throw rewardsRes.error;

      setAttempts(attemptsRes.data || []);
      setReferrals(referralsRes.data || []);
      setRewards(rewardsRes.data || []);
    } catch (err) {
      console.error('Error fetching audit data:', err);
      toast({ title: 'Chyba', description: 'Nepodařilo se načíst data auditu.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ──────────── Admin Actions ──────────── */

  const executeAction = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      if ((confirmAction.type === 'block' || confirmAction.type === 'unblock') && confirmAction.referrerId) {
        const { error } = await (supabase.rpc as any)('admin_block_referrer', {
          p_user_id: confirmAction.referrerId,
          p_blocked: confirmAction.type === 'block',
          p_reason: 'admin_audit_manual',
        });
        if (error) throw error;
        toast({
          title: confirmAction.type === 'block' ? 'Zablokováno' : 'Odblokováno',
          description: confirmAction.type === 'block' ? 'Doporučitel byl zablokován.' : 'Doporučitel byl odblokován.',
        });
      }

      if ((confirmAction.type === 'reverse' || confirmAction.type === 'block_reward') && confirmAction.targetId) {
        const newStatus = confirmAction.type === 'reverse' ? 'reversed' : 'blocked';
        const { error } = await (supabase.rpc as any)('admin_update_referral_reward', {
          p_reward_id: confirmAction.targetId,
          p_new_status: newStatus,
        });
        if (error) throw error;
        toast({
          title: newStatus === 'reversed' ? 'Stornováno' : 'Zablokováno',
          description: `Odměna byla označena jako ${newStatus === 'reversed' ? 'stornovaná' : 'zablokovaná'}.`,
        });
      }

      await fetchData();
    } catch (err: any) {
      console.error('Action error:', err);
      toast({ title: 'Chyba', description: err.message || 'Akce selhala.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  /* ──────────── Filtering ──────────── */

  const q = searchTerm.toLowerCase();

  const filteredAttempts = attempts.filter(a =>
    !q || a.referred_user_id.toLowerCase().includes(q) ||
    (a.attempted_code || '').toLowerCase().includes(q) ||
    (a.result || '').toLowerCase().includes(q)
  );

  const filteredReferrals = referrals.filter(r =>
    !q || r.referrer_user_id.toLowerCase().includes(q) ||
    r.referred_user_id.toLowerCase().includes(q) ||
    r.status.toLowerCase().includes(q)
  );

  const filteredRewards = rewards.filter(r =>
    !q || r.referrer_user_id.toLowerCase().includes(q) ||
    r.referred_user_id.toLowerCase().includes(q) ||
    r.status.toLowerCase().includes(q)
  );

  /* ──────────── Helpers ──────────── */

  const fmtDate = (d: string) => format(new Date(d), 'dd.MM.yyyy HH:mm', { locale: cs });
  const shortId = (id: string) => id.slice(0, 8) + '…';

  const resultBadge = (result: string) => {
    switch (result) {
      case 'success': return <Badge className="text-[10px] bg-green-500/15 text-green-500 border-green-500/25">Úspěch</Badge>;
      case 'blocked': return <Badge variant="destructive" className="text-[10px]">Zablokován</Badge>;
      case 'duplicate': return <Badge variant="secondary" className="text-[10px]">Duplikát</Badge>;
      default: return <Badge variant="outline" className="text-[10px]">{result}</Badge>;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge className="text-[10px] bg-green-500/15 text-green-500 border-green-500/25">Aktivní</Badge>;
      case 'inactive': return <Badge variant="secondary" className="text-[10px]">Neaktivní</Badge>;
      case 'blocked': return <Badge variant="destructive" className="text-[10px]">Zablokován</Badge>;
      default: return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  const rewardStatusBadge = (status: string) => {
    switch (status) {
      case 'earned': return <Badge className="text-[10px] bg-green-500/15 text-green-500 border-green-500/25">Připsáno</Badge>;
      case 'reversed': return <Badge variant="destructive" className="text-[10px]">Stornováno</Badge>;
      case 'blocked': return <Badge variant="secondary" className="text-[10px]">Zablokováno</Badge>;
      default: return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  /* ──────────── Render ──────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Hledat podle user ID, kódu, statusu..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <Tabs defaultValue="attempts" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="attempts" className="text-xs sm:text-sm">
            <FileSearch className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Pokusy ({filteredAttempts.length})
          </TabsTrigger>
          <TabsTrigger value="referrals" className="text-xs sm:text-sm">
            <Link2 className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Referraly ({filteredReferrals.length})
          </TabsTrigger>
          <TabsTrigger value="rewards" className="text-xs sm:text-sm">
            <Coins className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
            Odměny ({filteredRewards.length})
          </TabsTrigger>
        </TabsList>

        {/* ──────── Attempts ──────── */}
        <TabsContent value="attempts">
          <Card className="luxury-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pokusy o referral</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredAttempts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Žádné záznamy</p>
              ) : (
                <div className="rounded-md border border-border/50 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum</TableHead>
                        <TableHead>Doporučený</TableHead>
                        <TableHead>Kód</TableHead>
                        <TableHead className="hidden sm:table-cell">Zdroj</TableHead>
                        <TableHead>Výsledek</TableHead>
                        <TableHead className="hidden md:table-cell">Důvod</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAttempts.map((a) => (
                        <TableRow key={a.id} className="border-b border-border/30">
                          <TableCell className="text-xs tabular-nums whitespace-nowrap">{fmtDate(a.created_at)}</TableCell>
                          <TableCell className="font-mono text-xs">{shortId(a.referred_user_id)}</TableCell>
                          <TableCell className="font-mono text-xs">{a.attempted_code || '—'}</TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{a.source || '—'}</TableCell>
                          <TableCell>{resultBadge(a.result)}</TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">{a.reason || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ──────── Referrals ──────── */}
        <TabsContent value="referrals">
          <Card className="luxury-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Referral vazby</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredReferrals.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Žádné záznamy</p>
              ) : (
                <div className="rounded-md border border-border/50 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum</TableHead>
                        <TableHead>Doporučitel</TableHead>
                        <TableHead>Doporučený</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden sm:table-cell">Zablokován</TableHead>
                        <TableHead className="hidden md:table-cell">Důvod blokace</TableHead>
                        <TableHead className="text-right">Akce</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReferrals.map((r, idx) => (
                        <TableRow key={`${r.referrer_user_id}-${r.referred_user_id}-${idx}`} className="border-b border-border/30">
                          <TableCell className="text-xs tabular-nums whitespace-nowrap">{fmtDate(r.created_at)}</TableCell>
                          <TableCell className="font-mono text-xs">{shortId(r.referrer_user_id)}</TableCell>
                          <TableCell className="font-mono text-xs">{shortId(r.referred_user_id)}</TableCell>
                          <TableCell>{statusBadge(r.status)}</TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                            {r.blocked_at ? fmtDate(r.blocked_at) : '—'}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[150px] truncate">
                            {r.blocked_reason || '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.status === 'blocked' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-green-500 hover:bg-green-500/10"
                                onClick={() => setConfirmAction({ type: 'unblock', referrerId: r.referrer_user_id })}
                              >
                                <ShieldCheck className="h-3 w-3 mr-1" /> Odblokovat
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                                onClick={() => setConfirmAction({ type: 'block', referrerId: r.referrer_user_id })}
                              >
                                <ShieldBan className="h-3 w-3 mr-1" /> Blokovat
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ──────── Rewards ──────── */}
        <TabsContent value="rewards">
          <Card className="luxury-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Odměny</CardTitle>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <Ban className="h-3 w-3 shrink-0" />
                Blokace odměny neblokuje doporučitele. Pro blokaci doporučitele použijte záložku „Referraly".
              </p>
            </CardHeader>
            <CardContent>
              {filteredRewards.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Žádné záznamy</p>
              ) : (
                <div className="rounded-md border border-border/50 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum</TableHead>
                        <TableHead>Doporučitel</TableHead>
                        <TableHead>Doporučený</TableHead>
                        <TableHead>MC</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden sm:table-cell">Stornováno</TableHead>
                        <TableHead className="text-right">Akce</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRewards.map((r) => (
                        <TableRow key={r.id} className="border-b border-border/30">
                          <TableCell className="text-xs tabular-nums whitespace-nowrap">{fmtDate(r.created_at)}</TableCell>
                          <TableCell className="font-mono text-xs">{shortId(r.referrer_user_id)}</TableCell>
                          <TableCell className="font-mono text-xs">{shortId(r.referred_user_id)}</TableCell>
                          <TableCell className="font-bold tabular-nums">+{Number(r.reward_mc).toLocaleString('cs-CZ')}</TableCell>
                          <TableCell>{rewardStatusBadge(r.status)}</TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                            {r.reversed_at ? fmtDate(r.reversed_at) : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.status === 'earned' && (
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                                  onClick={() => setConfirmAction({ type: 'reverse', targetId: r.id })}
                                >
                                  <RotateCcw className="h-3 w-3 mr-1" /> Storno
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                                  onClick={() => setConfirmAction({ type: 'block_reward', targetId: r.id })}
                                >
                                  <Ban className="h-3 w-3 mr-1" /> Trvale zablokovat odměnu
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ──────── Confirm Dialog ──────── */}
      <AuditConfirmDialog
        action={confirmAction}
        loading={actionLoading}
        onConfirm={executeAction}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
};

/* ──────────── Confirm Dialog ──────────── */

function AuditConfirmDialog({
  action,
  loading,
  onConfirm,
  onCancel,
}: {
  action: { type: string } | null;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!action) return null;

  const labels: Record<string, { title: string; desc: string; btn: string }> = {
    block: {
      title: 'Zablokovat doporučitele',
      desc: 'Doporučitel nebude moci získávat nové odměny. Opravdu chcete pokračovat?',
      btn: 'Zablokovat',
    },
    unblock: {
      title: 'Odblokovat doporučitele',
      desc: 'Doporučitel bude opět moci získávat odměny. Opravdu chcete pokračovat?',
      btn: 'Odblokovat',
    },
    reverse: {
      title: 'Stornovat odměnu',
      desc: 'Odměna bude označena jako stornovaná. ⚠️ Tato akce je NEVRATNÁ. Storno odměny neblokuje doporučitele.',
      btn: 'Stornovat',
    },
    block_reward: {
      title: 'Trvale zablokovat odměnu',
      desc: 'Odměna bude trvale zablokovaná. ⚠️ Tato akce je NEVRATNÁ. Blokace odměny neblokuje doporučitele.',
      btn: 'Trvale zablokovat',
    },
  };

  const l = labels[action.type] || { title: 'Potvrdit', desc: '', btn: 'Potvrdit' };

  return (
    <Dialog open={!!action} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{l.title}</DialogTitle>
          <DialogDescription>{l.desc}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Zrušit
          </Button>
          <Button
            variant={action.type === 'unblock' ? 'default' : 'destructive'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {l.btn}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AdminReferralAudit;
