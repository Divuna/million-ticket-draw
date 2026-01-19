import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Building2, Coins, Key, FileText, LogOut, Copy, Check, TrendingUp, Calendar } from 'lucide-react';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { cs } from 'date-fns/locale';

interface Partner {
  id: string;
  name: string;
  company_name: string | null;
  logo_url: string;
  website_url: string;
  status: string;
}

interface ApiKey {
  id: string;
  key_prefix: string;
  created_at: string;
  revoked_at: string | null;
}

interface WeeklyReport {
  week_start: string;
  week_end: string;
  issued_count: number;
  issued_coins: number;
  activated_count: number;
  activated_coins: number;
}

const PartnerDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReport[]>([]);
  const [stats, setStats] = useState({
    totalIssued: 0,
    totalActivated: 0,
    totalIssuedCoins: 0,
    totalActivatedCoins: 0,
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    loadPartnerData();
  }, []);

  const loadPartnerData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate('/partner/login');
        return;
      }

      // Load partner info
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('*')
        .eq('auth_user_id', user.id)
        .single();

      if (partnerError || !partnerData) {
        toast.error('Partnerský účet nenalezen');
        navigate('/partner/login');
        return;
      }

      setPartner(partnerData);

      // Load API keys
      const { data: keysData } = await supabase
        .from('partner_api_keys')
        .select('*')
        .eq('partner_id', partnerData.id)
        .order('created_at', { ascending: false });

      setApiKeys(keysData || []);

      // Load reward codes stats
      const { data: codesData } = await supabase
        .from('partner_reward_codes')
        .select('coins, status, issued_at')
        .eq('partner_id', partnerData.id);

      if (codesData) {
        const totalIssued = codesData.length;
        const totalActivated = codesData.filter(c => c.status === 'activated').length;
        const totalIssuedCoins = codesData.reduce((sum, c) => sum + c.coins, 0);
        const totalActivatedCoins = codesData
          .filter(c => c.status === 'activated')
          .reduce((sum, c) => sum + c.coins, 0);

        setStats({ totalIssued, totalActivated, totalIssuedCoins, totalActivatedCoins });

        // Generate weekly reports for last 4 weeks
        const reports: WeeklyReport[] = [];
        for (let i = 0; i < 4; i++) {
          const weekStart = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
          const weekEnd = endOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
          
          const weekCodes = codesData.filter(c => {
            const issuedDate = new Date(c.issued_at);
            return issuedDate >= weekStart && issuedDate <= weekEnd;
          });

          reports.push({
            week_start: format(weekStart, 'dd.MM.yyyy', { locale: cs }),
            week_end: format(weekEnd, 'dd.MM.yyyy', { locale: cs }),
            issued_count: weekCodes.length,
            issued_coins: weekCodes.reduce((sum, c) => sum + c.coins, 0),
            activated_count: weekCodes.filter(c => c.status === 'activated').length,
            activated_coins: weekCodes
              .filter(c => c.status === 'activated')
              .reduce((sum, c) => sum + c.coins, 0),
          });
        }
        setWeeklyReports(reports);
      }
    } catch (error) {
      console.error('Error loading partner data:', error);
      toast.error('Nepodařilo se načíst data');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success('Odhlášeno');
    navigate('/partner/login');
  };

  const copyApiKey = (keyPrefix: string) => {
    navigator.clipboard.writeText(`${keyPrefix}••••••••`);
    setCopiedKey(keyPrefix);
    toast.success('API klíč zkopírován');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!partner) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={partner.logo_url} alt={partner.name} className="w-10 h-10 rounded-lg object-cover" />
            <div>
              <h1 className="font-semibold text-foreground">{partner.name}</h1>
              <p className="text-sm text-muted-foreground">Partnerský portál</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Odhlásit
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Vydané kódy</CardTitle>
              <FileText className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalIssued}</div>
              <p className="text-xs text-muted-foreground">{stats.totalIssuedCoins.toLocaleString()} MioCoinů</p>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Aktivované kódy</CardTitle>
              <Coins className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{stats.totalActivated}</div>
              <p className="text-xs text-muted-foreground">{stats.totalActivatedCoins.toLocaleString()} MioCoinů</p>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Konverzní poměr</CardTitle>
              <TrendingUp className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">
                {stats.totalIssued > 0 ? Math.round((stats.totalActivated / stats.totalIssued) * 100) : 0}%
              </div>
              <p className="text-xs text-muted-foreground">aktivovaných kódů</p>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
              <Building2 className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <Badge variant={partner.status === 'approved' ? 'default' : 'secondary'} className="text-sm">
                {partner.status === 'approved' ? 'Aktivní' : partner.status === 'pending' ? 'Čeká na schválení' : 'Pozastaveno'}
              </Badge>
            </CardContent>
          </Card>
        </div>

        {/* API Keys Section - Only visible for approved partners */}
        {partner.status === 'approved' ? (
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                API klíče
              </CardTitle>
              <CardDescription>Vaše API klíče pro integraci</CardDescription>
            </CardHeader>
            <CardContent>
              {apiKeys.length === 0 ? (
                <div className="text-center py-6">
                  <Key className="w-10 h-10 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-muted-foreground">Zatím nemáte žádné API klíče</p>
                  <p className="text-xs text-muted-foreground mt-1">Kontaktujte administrátora pro vygenerování klíče</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {apiKeys.filter(k => !k.revoked_at).map((key) => (
                    <div
                      key={key.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50"
                    >
                      <div className="flex items-center gap-3">
                        <code className="text-sm font-mono bg-background px-2 py-1 rounded">
                          {key.key_prefix}••••••••••••••••
                        </code>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(key.created_at), 'dd.MM.yyyy', { locale: cs })}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyApiKey(key.key_prefix)}
                        >
                          {copiedKey === key.key_prefix ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/50 opacity-60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                API klíče
              </CardTitle>
              <CardDescription>Vaše API klíče pro integraci</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-6">
                <Key className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-muted-foreground">API klíče budou dostupné po schválení účtu</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Weekly Reports */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Týdenní přehled
            </CardTitle>
            <CardDescription>Aktivita za posledních 4 týdny</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Období</TableHead>
                  <TableHead className="text-right">Vydané kódy</TableHead>
                  <TableHead className="text-right">Vydané MioCoiny</TableHead>
                  <TableHead className="text-right">Aktivované kódy</TableHead>
                  <TableHead className="text-right">Aktivované MioCoiny</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weeklyReports.map((report, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">
                      {report.week_start} – {report.week_end}
                    </TableCell>
                    <TableCell className="text-right">{report.issued_count}</TableCell>
                    <TableCell className="text-right">{report.issued_coins.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-primary">{report.activated_count}</TableCell>
                    <TableCell className="text-right text-primary">{report.activated_coins.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {weeklyReports.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Zatím nemáte žádná data
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default PartnerDashboard;
