import React, { useEffect, useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Header } from '@/components/Header';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import {
  Coins,
  Users,
  UserCheck,
  TrendingUp,
  ShieldBan,
  Loader2,
  Search,
  BarChart3,
} from 'lucide-react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';

/* ──────────── Types ──────────── */

interface ReferralRewardRow {
  id: string;
  referrer_user_id: string;
  referred_user_id: string;
  paid_amount_mc: number;
  reward_mc: number;
  status: string;
  created_at: string;
  payment_id: string;
  commission_rate: number;
}

interface BlockedUser {
  user_id: string;
  reason: string | null;
  blocked_at: string;
  blocked: boolean;
}

/* ──────────── Chart configs ──────────── */

const dailyChartConfig: ChartConfig = {
  reward_mc: {
    label: 'Odměněno MC',
    color: 'hsl(var(--neon-gold))',
  },
};

const topReferrersConfig: ChartConfig = {
  total_mc: {
    label: 'Celkem MC',
    color: 'hsl(var(--primary))',
  },
};

const conversionConfig: ChartConfig = {
  referred: {
    label: 'Doporučení',
    color: 'hsl(var(--muted-foreground))',
  },
  paying: {
    label: 'Platící',
    color: 'hsl(var(--neon-gold))',
  },
};

const DONUT_COLORS = [
  'hsl(var(--muted-foreground))',
  'hsl(var(--neon-gold))',
];

/* ──────────── Page ──────────── */

const AdminReferralDashboard: React.FC = () => {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();

  const [rewards, setRewards] = useState<ReferralRewardRow[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [referralsCount, setReferralsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  /* ──────────── Data fetching ──────────── */

  useEffect(() => {
    if (!isAdmin) return;

    const fetchAll = async () => {
      setLoading(true);
      try {
        const [rewardsRes, blockedRes, referralsRes] = await Promise.all([
          supabase
            .from('referral_rewards')
            .select('id, referrer_user_id, referred_user_id, paid_amount_mc, reward_mc, status, created_at, payment_id, commission_rate')
            .order('created_at', { ascending: false }),
          supabase
            .from('referral_blocked_users')
            .select('user_id, reason, blocked_at, blocked')
            .eq('blocked', true),
          supabase
            .from('referrals')
            .select('referred_user_id', { count: 'exact', head: false }),
        ]);

        if (rewardsRes.error) throw rewardsRes.error;
        if (blockedRes.error) throw blockedRes.error;

        setRewards(rewardsRes.data || []);
        setBlockedUsers(blockedRes.data || []);
        setReferralsCount(referralsRes.count || (referralsRes.data?.length ?? 0));
      } catch (err) {
        console.error('Error loading referral dashboard:', err);
        toast({
          title: 'Chyba',
          description: 'Nepodařilo se načíst data referral dashboardu.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [isAdmin]);

  /* ──────────── KPI computations ──────────── */

  const kpis = useMemo(() => {
    const earned = rewards.filter((r) => r.status === 'earned');
    const totalMC = earned.reduce((s, r) => s + Number(r.reward_mc || 0), 0);
    const referrerSet = new Set(earned.map((r) => r.referrer_user_id));
    const payingReferred = new Set(earned.map((r) => r.referred_user_id)).size;
    const avgMC = referrerSet.size > 0 ? totalMC / referrerSet.size : 0;

    return {
      totalMC,
      referrerCount: referrerSet.size,
      payingReferred,
      avgMC,
    };
  }, [rewards]);

  /* ──────────── Chart data: daily MC ──────────── */

  const dailyData = useMemo(() => {
    const earned = rewards.filter((r) => r.status === 'earned');
    const map = new Map<string, number>();
    for (const r of earned) {
      const day = format(new Date(r.created_at), 'yyyy-MM-dd');
      map.set(day, (map.get(day) || 0) + Number(r.reward_mc || 0));
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, reward_mc]) => ({
        date: format(new Date(date), 'dd.MM.', { locale: cs }),
        reward_mc: Math.round(reward_mc * 100) / 100,
      }));
  }, [rewards]);

  /* ──────────── Chart data: top referrers ──────────── */

  const topReferrersData = useMemo(() => {
    const earned = rewards.filter((r) => r.status === 'earned');
    const map = new Map<string, number>();
    for (const r of earned) {
      map.set(r.referrer_user_id, (map.get(r.referrer_user_id) || 0) + Number(r.reward_mc || 0));
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([user_id, total_mc]) => ({
        user_id,
        label: user_id.slice(0, 8) + '…',
        total_mc: Math.round(total_mc * 100) / 100,
      }));
  }, [rewards]);

  /* ──────────── Chart data: conversion donut ──────────── */

  const conversionData = useMemo(() => {
    const payingReferred = kpis.payingReferred;
    const totalReferred = referralsCount;
    const nonPaying = Math.max(0, totalReferred - payingReferred);

    return [
      { name: 'Neplatící', value: nonPaying },
      { name: 'Platící', value: payingReferred },
    ];
  }, [kpis.payingReferred, referralsCount]);

  /* ──────────── Table: filtered rewards ──────────── */

  const filteredRewards = useMemo(() => {
    if (!searchTerm) return rewards;
    const q = searchTerm.toLowerCase();
    return rewards.filter(
      (r) =>
        r.referrer_user_id.toLowerCase().includes(q) ||
        r.referred_user_id.toLowerCase().includes(q) ||
        r.payment_id.toLowerCase().includes(q)
    );
  }, [rewards, searchTerm]);

  /* ──────────── Helpers ──────────── */

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'earned':
        return <Badge className="text-[10px] bg-neon-green/15 text-neon-green border-neon-green/25">Připsáno</Badge>;
      case 'reversed':
        return <Badge variant="destructive" className="text-[10px]">Stornováno</Badge>;
      case 'blocked':
        return <Badge variant="secondary" className="text-[10px]">Zablokováno</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  const isBonus = (r: ReferralRewardRow) => {
    // Bonus rewards typically have commission_rate = 0 or are fixed-amount bonuses
    return Number(r.commission_rate) === 0 && Number(r.reward_mc) > 0;
  };

  /* ──────────── Guards ──────────── */

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/login" replace />;
  }

  /* ──────────── Render ──────────── */

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-6 pb-20 space-y-6">
        {/* Page title */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-neon-gold" />
            Referral Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Analytický přehled referral programu
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* ──────── KPI Cards ──────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard
                icon={<Coins className="h-5 w-5 text-neon-gold" />}
                label="Celkem odměněno MC"
                value={kpis.totalMC.toLocaleString('cs-CZ', { maximumFractionDigits: 2 })}
                gradient="from-neon-gold/10 to-neon-gold/5"
                borderColor="border-neon-gold/20"
                valueColor="text-neon-gold"
              />
              <KPICard
                icon={<Users className="h-5 w-5 text-primary" />}
                label="Počet doporučitelů"
                value={kpis.referrerCount.toLocaleString('cs-CZ')}
                gradient="from-primary/10 to-primary/5"
                borderColor="border-primary/20"
                valueColor="text-primary"
              />
              <KPICard
                icon={<UserCheck className="h-5 w-5 text-neon-green" />}
                label="Platící doporučení"
                value={kpis.payingReferred.toLocaleString('cs-CZ')}
                gradient="from-neon-green/10 to-neon-green/5"
                borderColor="border-neon-green/20"
                valueColor="text-neon-green"
              />
              <KPICard
                icon={<TrendingUp className="h-5 w-5 text-neon-cyan" />}
                label="Průměr MC / doporučitel"
                value={kpis.avgMC.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}
                gradient="from-neon-cyan/10 to-neon-cyan/5"
                borderColor="border-neon-cyan/20"
                valueColor="text-neon-cyan"
              />
            </div>

            {/* ──────── Charts ──────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Daily MC line chart */}
              <Card className="luxury-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Denní odměněné MC</CardTitle>
                  <CardDescription>Trend vyplacených MioCoinů</CardDescription>
                </CardHeader>
                <CardContent>
                  {dailyData.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">Žádná data</p>
                  ) : (
                    <ChartContainer config={dailyChartConfig} className="h-[260px] w-full">
                      <LineChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line
                          type="monotone"
                          dataKey="reward_mc"
                          stroke="hsl(var(--neon-gold))"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, fill: 'hsl(var(--neon-gold))' }}
                        />
                      </LineChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>

              {/* Top referrers bar chart */}
              <Card className="luxury-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Top doporučitelé</CardTitle>
                  <CardDescription>Podle celkových vyplacených MC</CardDescription>
                </CardHeader>
                <CardContent>
                  {topReferrersData.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">Žádná data</p>
                  ) : (
                    <ChartContainer config={topReferrersConfig} className="h-[260px] w-full">
                      <BarChart data={topReferrersData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <ChartTooltip
                          content={<ChartTooltipContent />}
                          labelFormatter={(_, payload) => {
                            if (payload?.[0]?.payload?.user_id) {
                              return payload[0].payload.user_id;
                            }
                            return '';
                          }}
                        />
                        <Bar
                          dataKey="total_mc"
                          fill="hsl(var(--primary))"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Donut + Anti-abuse side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Conversion donut */}
              <Card className="luxury-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Konverze doporučených</CardTitle>
                  <CardDescription>Poměr platících vs. neplatících</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-center">
                  {referralsCount === 0 ? (
                    <p className="text-sm text-muted-foreground py-8">Žádná data</p>
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                      <div className="h-[200px] w-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={conversionData}
                              cx="50%"
                              cy="50%"
                              innerRadius={55}
                              outerRadius={85}
                              dataKey="value"
                              strokeWidth={2}
                              stroke="hsl(var(--background))"
                            >
                              {conversionData.map((_, idx) => (
                                <Cell key={idx} fill={DONUT_COLORS[idx]} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex gap-6 text-sm">
                        {conversionData.map((d, idx) => (
                          <div key={d.name} className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-sm"
                              style={{ backgroundColor: DONUT_COLORS[idx] }}
                            />
                            <span className="text-muted-foreground">
                              {d.name}: <strong className="text-foreground">{d.value}</strong>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Anti-abuse section */}
              <Card className="luxury-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldBan className="h-4 w-4 text-destructive" />
                    Anti-abuse
                  </CardTitle>
                  <CardDescription>
                    Blokovaní uživatelé: <strong className="text-foreground">{blockedUsers.length}</strong>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {blockedUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      Žádní blokovaní uživatelé
                    </p>
                  ) : (
                    <div className="rounded-md border border-destructive/20 max-h-[240px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b border-destructive/20">
                            <TableHead className="text-destructive text-xs">User ID</TableHead>
                            <TableHead className="text-destructive text-xs">Důvod</TableHead>
                            <TableHead className="text-destructive text-xs">Datum</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {blockedUsers.map((b) => (
                            <TableRow key={b.user_id} className="border-b border-border/30">
                              <TableCell className="font-mono text-xs break-all">
                                {b.user_id}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {b.reason || '—'}
                              </TableCell>
                              <TableCell className="text-xs tabular-nums text-muted-foreground">
                                {format(new Date(b.blocked_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
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

            {/* ──────── Rewards detail table ──────── */}
            <Card className="luxury-card">
              <CardHeader>
                <CardTitle className="text-base">Detail odměn</CardTitle>
                <CardDescription>
                  Kompletní přehled všech referral odměn ({rewards.length} záznamů)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Hledat podle user ID nebo payment ID…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {filteredRewards.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {searchTerm ? 'Nenalezeny žádné záznamy.' : 'Žádné odměny.'}
                  </p>
                ) : (
                  <div className="rounded-md border border-neon-blue/20 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-neon-blue/20 bg-gradient-to-r from-background to-background/80">
                          <TableHead className="text-primary text-xs">Doporučitel</TableHead>
                          <TableHead className="text-primary text-xs">Doporučený</TableHead>
                          <TableHead className="text-primary text-xs">Placeno MC</TableHead>
                          <TableHead className="text-primary text-xs">Odměna MC</TableHead>
                          <TableHead className="text-primary text-xs">Bonus</TableHead>
                          <TableHead className="text-primary text-xs">Payment ID</TableHead>
                          <TableHead className="text-primary text-xs">Status</TableHead>
                          <TableHead className="text-primary text-xs">Datum</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRewards.slice(0, 200).map((r) => (
                          <TableRow key={r.id} className="border-b border-border/30">
                            <TableCell className="font-mono text-[11px] max-w-[140px] truncate" title={r.referrer_user_id}>
                              {r.referrer_user_id}
                            </TableCell>
                            <TableCell className="font-mono text-[11px] max-w-[140px] truncate" title={r.referred_user_id}>
                              {r.referred_user_id}
                            </TableCell>
                            <TableCell className="tabular-nums text-xs">
                              {Number(r.paid_amount_mc).toLocaleString('cs-CZ')}
                            </TableCell>
                            <TableCell className="font-bold tabular-nums text-xs">
                              +{Number(r.reward_mc).toLocaleString('cs-CZ')}
                            </TableCell>
                            <TableCell>
                              {isBonus(r) ? (
                                <Badge className="text-[9px] bg-neon-gold/15 text-neon-gold border-neon-gold/25">
                                  Ano
                                </Badge>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">Ne</span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-[10px] max-w-[100px] truncate text-muted-foreground" title={r.payment_id}>
                              {r.payment_id.slice(0, 8)}…
                            </TableCell>
                            <TableCell>{getStatusBadge(r.status)}</TableCell>
                            <TableCell className="tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(r.created_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {filteredRewards.length > 200 && (
                      <p className="text-xs text-muted-foreground text-center py-2 border-t border-border/30">
                        Zobrazeno 200 z {filteredRewards.length} záznamů
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

/* ──────────── KPI Card component ──────────── */

function KPICard({
  icon,
  label,
  value,
  gradient,
  borderColor,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  gradient: string;
  borderColor: string;
  valueColor: string;
}) {
  return (
    <div
      className={`p-4 rounded-xl bg-gradient-to-br ${gradient} border ${borderColor} text-center space-y-1`}
    >
      <div className="flex justify-center">{icon}</div>
      <p className={`text-xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}

export default AdminReferralDashboard;
