/**
 * PLAYER REFERRAL SYSTEM (Admin) — Non-monetary, in-game MioCoin rewards.
 * Uses: referrals, referral_rewards, referral_blocked_users.
 * Admin actions: block/unblock referrers, reverse/block individual rewards.
 * ⚠️  Intentionally separate from the Influencer system (AdminInfluencers.tsx).
 * These two systems MUST NEVER be merged or unified.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Header } from '@/components/Header';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users,
  Search,
  ArrowLeft,
  ShieldBan,
  ShieldCheck,
  Coins,
  UserPlus,
  UserX,
  Loader2,
  Ban,
  RotateCcw,
  ClipboardCheck,
} from 'lucide-react';
import AdminReferralAudit from '@/components/AdminReferralAudit';

/* ──────────────────────── Types ──────────────────────── */

interface TopReferrer {
  referrer_user_id: string;
  total_earned: number;
  referral_count: number;
  active_count: number;
  inactive_count: number;
  last_reward_date: string | null;
  is_blocked: boolean;
}

interface ReferralReward {
  id: string;
  reward_mc: number;
  status: string;
  created_at: string;
}

/* ──────────────────────── Page ──────────────────────── */

const AdminReferrals: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();

  const [referrers, setReferrers] = useState<TopReferrer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Detail view
  const [selectedReferrer, setSelectedReferrer] = useState<string | null>(null);
  const [detailRewards, setDetailRewards] = useState<ReferralReward[]>([]);
  const [detailReferredCount, setDetailReferredCount] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailBlocked, setDetailBlocked] = useState(false);

  // Confirm dialog
  const [confirmAction, setConfirmAction] = useState<{
    type: 'block' | 'unblock' | 'reverse' | 'block_reward';
    targetId?: string;
    referrerId?: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  /* ──────────── Fetch top referrers ──────────── */

  const fetchReferrers = useCallback(async () => {
    setLoading(true);
    try {
      // Get all referrals grouped by referrer
      const { data: referrals, error: refErr } = await supabase
        .from('referrals')
        .select('referrer_user_id, status');

      if (refErr) throw refErr;

      // Get rewards aggregated
      const { data: rewards, error: rwErr } = await supabase
        .from('referral_rewards')
        .select('referrer_user_id, reward_mc, status, created_at');

      if (rwErr) throw rwErr;

      // Get blocked users
      const { data: blocked, error: blkErr } = await supabase
        .from('referral_blocked_users')
        .select('user_id, blocked');

      if (blkErr) throw blkErr;

      const blockedSet = new Set(
        (blocked || []).filter((b) => b.blocked).map((b) => b.user_id)
      );

      // Build map per referrer
      const map = new Map<string, TopReferrer>();

      for (const r of referrals || []) {
        if (!map.has(r.referrer_user_id)) {
          map.set(r.referrer_user_id, {
            referrer_user_id: r.referrer_user_id,
            total_earned: 0,
            referral_count: 0,
            active_count: 0,
            inactive_count: 0,
            last_reward_date: null,
            is_blocked: blockedSet.has(r.referrer_user_id),
          });
        }
        const entry = map.get(r.referrer_user_id)!;
        entry.referral_count += 1;
        if (r.status === 'active') entry.active_count += 1;
        else entry.inactive_count += 1;
      }

      for (const rw of rewards || []) {
        if (!map.has(rw.referrer_user_id)) {
          map.set(rw.referrer_user_id, {
            referrer_user_id: rw.referrer_user_id,
            total_earned: 0,
            referral_count: 0,
            active_count: 0,
            inactive_count: 0,
            last_reward_date: null,
            is_blocked: blockedSet.has(rw.referrer_user_id),
          });
        }
        const entry = map.get(rw.referrer_user_id)!;
        if (rw.status === 'earned') {
          entry.total_earned += Number(rw.reward_mc || 0);
        }
        if (
          !entry.last_reward_date ||
          new Date(rw.created_at) > new Date(entry.last_reward_date)
        ) {
          entry.last_reward_date = rw.created_at;
        }
      }

      const sorted = Array.from(map.values()).sort(
        (a, b) => b.total_earned - a.total_earned
      );

      setReferrers(sorted);
    } catch (err) {
      console.error('Error fetching referrers:', err);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se načíst data doporučitelů.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchReferrers();
  }, [isAdmin, fetchReferrers]);

  /* ──────────── Fetch detail ──────────── */

  const openDetail = async (referrerId: string) => {
    setSelectedReferrer(referrerId);
    setDetailLoading(true);
    try {
      const [rewardsRes, referralsRes, blockedRes] = await Promise.all([
        supabase
          .from('referral_rewards')
          .select('id, reward_mc, status, created_at')
          .eq('referrer_user_id', referrerId)
          .order('created_at', { ascending: false }),
        supabase
          .from('referrals')
          .select('referred_user_id')
          .eq('referrer_user_id', referrerId),
        supabase
          .from('referral_blocked_users')
          .select('blocked')
          .eq('user_id', referrerId)
          .maybeSingle(),
      ]);

      if (rewardsRes.error) throw rewardsRes.error;
      if (referralsRes.error) throw referralsRes.error;

      setDetailRewards(rewardsRes.data || []);
      setDetailReferredCount((referralsRes.data || []).length);
      setDetailBlocked(blockedRes.data?.blocked === true);
    } catch (err) {
      console.error('Error fetching detail:', err);
      toast({ title: 'Chyba', description: 'Nepodařilo se načíst detail.', variant: 'destructive' });
    } finally {
      setDetailLoading(false);
    }
  };

  /* ──────────── Admin Actions ──────────── */

  const executeAction = async () => {
    if (!confirmAction) return;
    setActionLoading(true);

    try {
      if (confirmAction.type === 'block' && confirmAction.referrerId) {
        const { error } = await (supabase.rpc as any)('admin_block_referrer', {
          p_user_id: confirmAction.referrerId,
          p_blocked: true,
          p_reason: 'admin_manual',
        });
        if (error) throw error;

        // Optimistic update
        setReferrers((prev) =>
          prev.map((r) =>
            r.referrer_user_id === confirmAction.referrerId
              ? { ...r, is_blocked: true }
              : r
          )
        );
        if (selectedReferrer === confirmAction.referrerId) setDetailBlocked(true);

        toast({ title: 'Zablokováno', description: 'Doporučitel byl zablokován.' });
      }

      if (confirmAction.type === 'unblock' && confirmAction.referrerId) {
        const { error } = await (supabase.rpc as any)('admin_block_referrer', {
          p_user_id: confirmAction.referrerId,
          p_blocked: false,
          p_reason: 'admin_manual',
        });
        if (error) throw error;

        setReferrers((prev) =>
          prev.map((r) =>
            r.referrer_user_id === confirmAction.referrerId
              ? { ...r, is_blocked: false }
              : r
          )
        );
        if (selectedReferrer === confirmAction.referrerId) setDetailBlocked(false);

        toast({ title: 'Odblokováno', description: 'Doporučitel byl odblokován.' });
      }

      if (
        (confirmAction.type === 'reverse' || confirmAction.type === 'block_reward') &&
        confirmAction.targetId
      ) {
        const newStatus = confirmAction.type === 'reverse' ? 'reversed' : 'blocked';
        const { error } = await (supabase.rpc as any)('admin_update_referral_reward', {
          p_reward_id: confirmAction.targetId,
          p_new_status: newStatus,
        });
        if (error) throw error;

        // Optimistic update in detail
        setDetailRewards((prev) =>
          prev.map((r) =>
            r.id === confirmAction.targetId ? { ...r, status: newStatus } : r
          )
        );

        toast({
          title: newStatus === 'reversed' ? 'Stornováno' : 'Zablokováno',
          description: `Odměna byla označena jako ${newStatus === 'reversed' ? 'stornovaná' : 'zablokovaná'}.`,
        });
      }
    } catch (err: any) {
      console.error('Action error:', err);
      toast({ title: 'Chyba', description: err.message || 'Akce selhala.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  /* ──────────── Status helpers ──────────── */

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'earned':
        return { text: 'Připsáno', cls: 'text-green-500 bg-green-500/15 border-green-500/25' };
      case 'reversed':
        return { text: 'Stornováno', cls: 'text-destructive bg-destructive/15 border-destructive/25' };
      case 'blocked':
        return { text: 'Zablokováno', cls: 'text-muted-foreground bg-muted/15 border-border/25' };
      default:
        return { text: status, cls: 'text-muted-foreground bg-muted/15 border-border/25' };
    }
  };

  /* ──────────── Filtering ──────────── */

  const filteredReferrers = referrers.filter((r) =>
    r.referrer_user_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  /* ──────────── Guards ──────────── */

  if (roleLoading) {
    return <div className="flex items-center justify-center min-h-screen">Načítání...</div>;
  }

  if (!user || !isAdmin) {
    return <Navigate to="/login" replace />;
  }

  /* ──────────── Detail View ──────────── */

  if (selectedReferrer) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-6 pb-20">
          <Button
            variant="ghost"
            onClick={() => setSelectedReferrer(null)}
            className="mb-4 text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zpět na přehled
          </Button>

          <Card className="luxury-card mb-6">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-primary">
                    <Users className="h-5 w-5 text-neon-gold" />
                    Detail doporučitele
                  </CardTitle>
                  <CardDescription className="font-mono text-xs mt-1 break-all">
                    {selectedReferrer}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {detailBlocked ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setConfirmAction({ type: 'unblock', referrerId: selectedReferrer })
                      }
                      className="border-green-500/30 text-green-500 hover:bg-green-500/10"
                    >
                      <ShieldCheck className="h-4 w-4 mr-1" />
                      Odblokovat
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setConfirmAction({ type: 'block', referrerId: selectedReferrer })
                      }
                      className="border-destructive/30 text-destructive hover:bg-destructive/10"
                    >
                      <ShieldBan className="h-4 w-4 mr-1" />
                      Zablokovat
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {detailLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                    <div className="p-4 rounded-xl bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border border-yellow-500/20 text-center">
                      <Coins className="h-4 w-4 text-yellow-500 mx-auto mb-1" />
                      <p className="text-lg font-bold text-yellow-500 tabular-nums">
                        {detailRewards
                          .filter((r) => r.status === 'earned')
                          .reduce((s, r) => s + Number(r.reward_mc), 0)
                          .toLocaleString('cs-CZ')}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Celkem MC
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 text-center">
                      <UserPlus className="h-4 w-4 text-primary mx-auto mb-1" />
                      <p className="text-lg font-bold text-primary tabular-nums">
                        {detailReferredCount}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Doporučených
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-gradient-to-br from-muted/30 to-muted/10 border border-border/30 text-center">
                      <p className="text-lg font-bold text-foreground tabular-nums">
                        {detailRewards.length}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Celkem odměn
                      </p>
                    </div>
                  </div>

                  {/* Blocked badge */}
                  {detailBlocked && (
                    <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-2">
                      <ShieldBan className="h-4 w-4 text-destructive" />
                      <span className="text-sm text-destructive font-medium">
                        Doporučitel je zablokován
                      </span>
                    </div>
                  )}

                  {/* Reward history */}
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Historie odměn
                  </h3>

                  {detailRewards.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic py-4">
                      Žádné odměny
                    </p>
                  ) : (
                    <div className="rounded-md border border-neon-blue/20">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b border-neon-blue/20 bg-gradient-to-r from-background to-background/80">
                            <TableHead className="text-primary">Datum</TableHead>
                            <TableHead className="text-primary">MC</TableHead>
                            <TableHead className="text-primary">Status</TableHead>
                            <TableHead className="text-primary text-right">Akce</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailRewards.map((reward) => {
                            const si = getStatusLabel(reward.status);
                            return (
                              <TableRow
                                key={reward.id}
                                className="border-b border-border/50"
                              >
                                <TableCell className="text-sm tabular-nums">
                                  {format(new Date(reward.created_at), 'dd.MM.yyyy HH:mm', {
                                    locale: cs,
                                  })}
                                </TableCell>
                                <TableCell className="font-bold tabular-nums">
                                  +{Number(reward.reward_mc).toLocaleString('cs-CZ')}
                                </TableCell>
                                <TableCell>
                                  <span
                                    className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${si.cls}`}
                                  >
                                    {si.text}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  {reward.status === 'earned' && (
                                    <div className="flex items-center justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          setConfirmAction({
                                            type: 'reverse',
                                            targetId: reward.id,
                                          })
                                        }
                                        className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2"
                                      >
                                        <RotateCcw className="h-3 w-3 mr-1" />
                                        Storno
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          setConfirmAction({
                                            type: 'block_reward',
                                            targetId: reward.id,
                                          })
                                        }
                                        className="text-xs text-muted-foreground hover:text-muted-foreground hover:bg-muted/20 h-7 px-2"
                                      >
                                        <Ban className="h-3 w-3 mr-1" />
                                        Blokovat
                                      </Button>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Confirm dialog */}
        <ConfirmDialog
          action={confirmAction}
          loading={actionLoading}
          onConfirm={executeAction}
          onCancel={() => setConfirmAction(null)}
        />
      </div>
    );
  }

  /* ──────────── Main Table View ──────────── */

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-6 pb-20">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">
              <Users className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
              Přehled doporučitelů
            </TabsTrigger>
            <TabsTrigger value="audit" className="text-xs sm:text-sm">
              <ClipboardCheck className="h-3.5 w-3.5 mr-1.5 hidden sm:inline" />
              Audit referralů
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Card className="luxury-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Users className="h-5 w-5 text-neon-gold" />
                  Přehled doporučitelů
                </CardTitle>
                <CardDescription>
                  Správa referral programu – přehled, blokování, stornování odměn
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Search */}
                <div className="relative mb-6">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Hledat podle user ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : filteredReferrers.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    {searchTerm ? 'Nenalezeni žádní doporučitelé.' : 'Zatím žádná data.'}
                  </p>
                ) : (
                  <div className="rounded-md border border-neon-blue/20">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-neon-blue/20 bg-gradient-to-r from-background to-background/80">
                          <TableHead className="text-primary">User ID</TableHead>
                          <TableHead className="text-primary">Celkem MC</TableHead>
                          <TableHead className="text-primary">Doporučení</TableHead>
                          <TableHead className="text-primary hidden sm:table-cell">
                            Aktivní / Neaktivní
                          </TableHead>
                          <TableHead className="text-primary hidden sm:table-cell">
                            Poslední odměna
                          </TableHead>
                          <TableHead className="text-primary">Status</TableHead>
                          <TableHead className="text-primary text-right">Akce</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredReferrers.map((r) => (
                          <TableRow
                            key={r.referrer_user_id}
                            className="border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => openDetail(r.referrer_user_id)}
                          >
                            <TableCell className="font-mono text-xs max-w-[120px] truncate">
                              {r.referrer_user_id.slice(0, 8)}…
                            </TableCell>
                            <TableCell className="font-bold tabular-nums">
                              {r.total_earned.toLocaleString('cs-CZ')}
                            </TableCell>
                            <TableCell className="tabular-nums">{r.referral_count}</TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <span className="text-green-500 font-medium">{r.active_count}</span>
                              {' / '}
                              <span className="text-muted-foreground">{r.inactive_count}</span>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-sm tabular-nums text-muted-foreground">
                              {r.last_reward_date
                                ? format(new Date(r.last_reward_date), 'dd.MM.yyyy', { locale: cs })
                                : '—'}
                            </TableCell>
                            <TableCell>
                              {r.is_blocked ? (
                                <Badge variant="destructive" className="text-[10px]">
                                  Blokován
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-500">
                                  Aktivní
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (r.is_blocked) {
                                    setConfirmAction({
                                      type: 'unblock',
                                      referrerId: r.referrer_user_id,
                                    });
                                  } else {
                                    setConfirmAction({
                                      type: 'block',
                                      referrerId: r.referrer_user_id,
                                    });
                                  }
                                }}
                                className={`h-7 px-2 text-xs ${
                                  r.is_blocked
                                    ? 'text-green-500 hover:bg-green-500/10'
                                    : 'text-destructive hover:bg-destructive/10'
                                }`}
                              >
                                {r.is_blocked ? (
                                  <>
                                    <ShieldCheck className="h-3 w-3 mr-1" /> Odblokovat
                                  </>
                                ) : (
                                  <>
                                    <ShieldBan className="h-3 w-3 mr-1" /> Blokovat
                                  </>
                                )}
                              </Button>
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

          <TabsContent value="audit">
            <AdminReferralAudit />
          </TabsContent>
        </Tabs>
      </div>

      {/* Confirm dialog */}
      <ConfirmDialog
        action={confirmAction}
        loading={actionLoading}
        onConfirm={executeAction}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
};

/* ──────────── Confirm Dialog ──────────── */

function ConfirmDialog({
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
      desc: 'Odměna bude označena jako stornovaná. Tuto akci nelze vrátit.',
      btn: 'Stornovat',
    },
    block_reward: {
      title: 'Zablokovat odměnu',
      desc: 'Odměna bude označena jako zablokovaná. Tuto akci nelze vrátit.',
      btn: 'Zablokovat',
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

export default AdminReferrals;
