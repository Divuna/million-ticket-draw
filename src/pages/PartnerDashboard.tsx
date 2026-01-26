import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Building2, Coins, Key, FileText, TrendingUp, Calendar, Upload, Image, Clock, CheckCircle, XCircle, Mail, BookOpen, Rocket, ListChecks, ExternalLink, AlertCircle, Info, Gift, RefreshCw, Copy, Eye, EyeOff, Activity } from 'lucide-react';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { cs } from 'date-fns/locale';
import { useUserRole } from '@/hooks/useUserRole';

interface Partner {
  id: string;
  name: string;
  company_name: string | null;
  logo_url: string;
  website_url: string;
  status: string;
  logo_status: string;
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

interface ApiActivity {
  endpoint: string | null;
  created_at: string | null;
}

const PartnerDashboard = () => {
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReport[]>([]);
  const [apiActivity, setApiActivity] = useState<ApiActivity[]>([]);
  const [stats, setStats] = useState({
    totalIssued: 0,
    totalActivated: 0,
    totalIssuedCoins: 0,
    totalActivatedCoins: 0,
  });
  
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [activatingReward, setActivatingReward] = useState(false);
  
  // Activate reward modal state
  const [activateModalOpen, setActivateModalOpen] = useState(false);
  const [rewardCodeInput, setRewardCodeInput] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');

  // API Key rotation modal state
  const [rotatePasswordModalOpen, setRotatePasswordModalOpen] = useState(false);
  const [rotateSuccessModalOpen, setRotateSuccessModalOpen] = useState(false);
  const [rotatePassword, setRotatePassword] = useState('');
  const [rotatePasswordVisible, setRotatePasswordVisible] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');
  const [rotatingKey, setRotatingKey] = useState(false);

  const handleActivateRewardSubmit = async () => {
    const success = await activatePartnerReward(rewardCodeInput, apiKeyInput);
    if (success) {
      setActivateModalOpen(false);
      setRewardCodeInput('');
      setApiKeyInput('');
    }
  };

  const openActivateModal = () => {
    setRewardCodeInput('');
    setApiKeyInput('');
    setActivateModalOpen(true);
  };

  // Function to handle API key rotation by partner
  // IMPORTANT: This function must ONLY be called after explicit user action (button click + password submit)
  // It should NEVER be called automatically on mount, in useEffect, or during data loading
  const handleRotateApiKey = async () => {
    // Guard: Only proceed if the password modal is actually open (explicit user action)
    if (!rotatePasswordModalOpen) {
      console.warn('[handleRotateApiKey] Called without password modal open - aborting');
      return;
    }

    if (!rotatePassword.trim()) {
      toast.error('Heslo je povinné');
      return;
    }

    // Prevent double-submission
    if (rotatingKey) {
      return;
    }

    setRotatingKey(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session?.access_token) {
        toast.error('Chybí platná session. Přihlaste se znovu.');
        return;
      }

      const res = await supabase.functions.invoke("partner-rotate-api-key", {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: {
          password: rotatePassword,
        },
      });

      if (res.error || !res.data?.success) {
        const errorMsg = res.data?.error || res.error?.message || 'Nepodařilo se rotovat API klíč';
        toast.error(errorMsg);
        return;
      }

      // Success - show the new key
      setNewApiKey(res.data.api_key);
      setRotatePasswordModalOpen(false);
      setRotatePassword('');
      setRotatePasswordVisible(false);
      setRotateSuccessModalOpen(true);

      // Reload API keys list
      await loadPartnerData();
    } catch (err) {
      console.error('Chyba při rotaci API klíče:', err);
      toast.error('Nastala neočekávaná chyba');
    } finally {
      setRotatingKey(false);
    }
  };

  const openRotatePasswordModal = () => {
    setRotatePassword('');
    setRotatePasswordVisible(false);
    setRotatePasswordModalOpen(true);
  };

  const closeRotateSuccessModal = () => {
    setNewApiKey(''); // Clear the key from memory
    setRotateSuccessModalOpen(false);
  };

  const copyApiKeyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(newApiKey);
      toast.success('API klíč byl zkopírován do schránky');
    } catch {
      toast.error('Nepodařilo se zkopírovat do schránky');
    }
  };

  // Function to activate a partner reward code via RPC
  const activatePartnerReward = async (rewardCode: string, apiKey: string): Promise<boolean> => {
    if (!partner) {
      toast.error('Partner nenalezen');
      return false;
    }

    if (!rewardCode.trim()) {
      toast.error('Kód odměny je povinný');
      return false;
    }

    if (!apiKey.trim()) {
      toast.error('API klíč je povinný');
      return false;
    }

    setActivatingReward(true);

    try {
      const { data, error } = await supabase.rpc('activate_partner_reward_sql', {
        p_api_key: apiKey,
        p_partner_id: partner.id,
        p_reward_code: rewardCode,
      });

      if (error) {
        console.error('Chyba při aktivaci odměny:', error);
        
        // Handle specific error messages
        if (error.message.includes('not found') || error.message.includes('nenalezen')) {
          toast.error('Kód odměny nebyl nalezen');
        } else if (error.message.includes('already activated') || error.message.includes('již aktivován')) {
          toast.error('Tento kód byl již aktivován');
        } else if (error.message.includes('expired') || error.message.includes('vypršel')) {
          toast.error('Platnost kódu vypršela');
        } else if (error.message.includes('invalid') || error.message.includes('neplatný')) {
          toast.error('Neplatný API klíč nebo kód odměny');
        } else {
          toast.error(`Chyba při aktivaci: ${error.message}`);
        }
        return false;
      }

      // Check RPC response for success/error
      const result = data as { success?: boolean; error?: string; message?: string } | null;
      
      if (result?.error) {
        toast.error(result.error);
        return false;
      }

      toast.success('Odměna byla úspěšně aktivována');
      
      // Reload data to reflect changes
      await loadPartnerData();
      
      return true;
    } catch (err) {
      console.error('Neočekávaná chyba při aktivaci odměny:', err);
      toast.error('Nastala neočekávaná chyba při aktivaci odměny');
      return false;
    } finally {
      setActivatingReward(false);
    }
  };

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
        .select('id, key_prefix, created_at, revoked_at')
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

      // Load API activity (read-only, last 50 entries)
      const { data: activityData } = await supabase
        .from('partner_api_activity')
        .select('endpoint, created_at')
        .eq('partner_id', partnerData.id)
        .order('created_at', { ascending: false })
        .limit(50);

      setApiActivity(activityData || []);
    } catch (error) {
      console.error('Error loading partner data:', error);
      toast.error('Nepodařilo se načíst data');
    } finally {
      setLoading(false);
    }
  };



  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Povolené formáty: PNG, JPG, SVG');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Maximální velikost souboru je 5MB');
        return;
      }
      setSelectedLogoFile(file);
    }
  };

  const handleLogoUpload = async () => {
    if (!selectedLogoFile || !partner) return;

    setUploadingLogo(true);
    try {
      const fileExt = selectedLogoFile.name.split('.').pop();
      const fileName = `${partner.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('partner-logos')
        .upload(fileName, selectedLogoFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('partner-logos')
        .getPublicUrl(fileName);

      // Update partner with new logo and set logo_status to pending
      const { error: updateError } = await supabase
        .from('partners')
        .update({ 
          logo_url: urlData.publicUrl,
          logo_status: 'pending'
        })
        .eq('id', partner.id);

      if (updateError) throw updateError;

      setPartner({
        ...partner,
        logo_url: urlData.publicUrl,
        logo_status: 'pending'
      });
      setSelectedLogoFile(null);
      toast.success('Logo nahráno a čeká na schválení');
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Nepodařilo se nahrát logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const getLogoStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle className="w-3 h-3 mr-1" />Schváleno</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20"><Clock className="w-3 h-3 mr-1" />Čeká na schválení</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20"><XCircle className="w-3 h-3 mr-1" />Zamítnuto</Badge>;
      default:
        return <Badge variant="outline"><Image className="w-3 h-3 mr-1" />Není nahráno</Badge>;
    }
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

  // Derived states for blocking actions
  const isAccountApproved = partner.status === 'approved';
  const isLogoApproved = partner.logo_status === 'approved';
  const hasActiveApiKeys = apiKeys.filter(k => !k.revoked_at).length > 0;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Global Account Status Banner - shown when account is NOT approved */}
        {!isAccountApproved && (
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-700 dark:text-amber-300">
                Váš účet čeká na schválení administrátorem.
              </p>
              <p className="text-sm text-amber-600/80 dark:text-amber-400/80 mt-1">
                Po schválení účtu budete moci plně využívat partnerský portál včetně API klíčů pro integraci MioCoinů.
              </p>
            </div>
          </div>
        )}
        {/* Welcome & Account Status Section */}
        <Card className="border-border/50 bg-gradient-to-br from-card to-muted/20">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Rocket className="w-5 h-5 text-primary" />
                  Vítejte v partnerském portálu
                </CardTitle>
                <CardDescription className="mt-1">
                  {partner.company_name || partner.name}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status účtu:</span>
                {partner.status === 'approved' ? (
                  <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Aktivní
                  </Badge>
                ) : partner.status === 'pending' ? (
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                    <Clock className="w-3 h-3 mr-1" />
                    Čeká na schválení
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20">
                    <XCircle className="w-3 h-3 mr-1" />
                    Pozastaveno
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Status Messages */}
            {partner.status === 'pending' && (
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  <Clock className="w-4 h-4 inline mr-2" />
                  Váš účet čeká na schválení administrátorem. Po schválení budete moci generovat API klíče a začít integrovat MioCoiny.
                </p>
              </div>
            )}
            {partner.status === 'suspended' && (
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-700 dark:text-red-400">
                  <XCircle className="w-4 h-4 inline mr-2" />
                  Váš účet byl pozastaven. Pro více informací kontaktujte podporu.
                </p>
              </div>
            )}

            {/* Primary Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <a href="#api-keys" className="block">
                <div className="p-4 rounded-lg border border-border/50 bg-card hover:bg-muted/50 transition-colors cursor-pointer h-full">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Key className="w-5 h-5 text-primary" />
                    </div>
                    <span className="font-medium text-foreground">API klíče</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Zobrazit a spravovat přístupové klíče
                  </p>
                </div>
              </a>

              <a href="https://docs.onemil.cz/partner-api" target="_blank" rel="noopener noreferrer" className="block">
                <div className="p-4 rounded-lg border border-border/50 bg-card hover:bg-muted/50 transition-colors cursor-pointer h-full">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-primary" />
                    </div>
                    <span className="font-medium text-foreground flex items-center gap-1">
                      Dokumentace API
                      <ExternalLink className="w-3 h-3" />
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Návody a reference pro integraci
                  </p>
                </div>
              </a>

              <a href="mailto:podpora@onemil.cz" className="block">
                <div className="p-4 rounded-lg border border-border/50 bg-card hover:bg-muted/50 transition-colors cursor-pointer h-full">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Mail className="w-5 h-5 text-primary" />
                    </div>
                    <span className="font-medium text-foreground">Kontaktovat podporu</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Potřebujete pomoc? Napište nám
                  </p>
                </div>
              </a>
            </div>

            {/* Jak začít Checklist */}
            {(() => {
              const step1Done = partner.status === 'approved';
              const step2Done = !!(partner.logo_url && partner.logo_status !== 'none');
              const step3Done = apiKeys.filter(k => !k.revoked_at).length > 0;
              const step4Done = false; // Always pending (informational)
              const completedCount = [step1Done, step2Done, step3Done].filter(Boolean).length;

              return (
                <div className="border-t border-border/50 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <ListChecks className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold text-foreground">Jak začít</h3>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {completedCount}/3 dokončeno
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Step 1 */}
                    <div className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${step1Done ? 'bg-green-500/10 border border-green-500/20' : 'bg-muted/30'}`}>
                      <div className={`w-6 h-6 rounded-full text-sm font-medium flex items-center justify-center flex-shrink-0 mt-0.5 ${step1Done ? 'bg-green-500 text-white' : 'bg-primary/20 text-primary'}`}>
                        {step1Done ? <CheckCircle className="w-4 h-4" /> : '1'}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${step1Done ? 'text-green-700 dark:text-green-400' : 'text-foreground'}`}>Počkejte na schválení účtu</p>
                        <p className="text-xs text-muted-foreground">Administrátor zkontroluje vaši registraci</p>
                      </div>
                    </div>
                    {/* Step 2 */}
                    <div className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${step2Done ? 'bg-green-500/10 border border-green-500/20' : 'bg-muted/30'}`}>
                      <div className={`w-6 h-6 rounded-full text-sm font-medium flex items-center justify-center flex-shrink-0 mt-0.5 ${step2Done ? 'bg-green-500 text-white' : 'bg-primary/20 text-primary'}`}>
                        {step2Done ? <CheckCircle className="w-4 h-4" /> : '2'}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${step2Done ? 'text-green-700 dark:text-green-400' : 'text-foreground'}`}>Nahrajte logo partnera</p>
                        <p className="text-xs text-muted-foreground">Logo se zobrazí zákazníkům při aktivaci</p>
                      </div>
                    </div>
                    {/* Step 3 */}
                    <div className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${step3Done ? 'bg-green-500/10 border border-green-500/20' : 'bg-muted/30'}`}>
                      <div className={`w-6 h-6 rounded-full text-sm font-medium flex items-center justify-center flex-shrink-0 mt-0.5 ${step3Done ? 'bg-green-500 text-white' : 'bg-primary/20 text-primary'}`}>
                        {step3Done ? <CheckCircle className="w-4 h-4" /> : '3'}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${step3Done ? 'text-green-700 dark:text-green-400' : 'text-foreground'}`}>Získejte API klíč</p>
                        <p className="text-xs text-muted-foreground">Kontaktujte administrátora pro vygenerování</p>
                      </div>
                    </div>
                    {/* Step 4 - Always pending */}
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                      <div className="w-6 h-6 rounded-full bg-primary/20 text-primary text-sm font-medium flex items-center justify-center flex-shrink-0 mt-0.5">
                        4
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Integrujte do e-shopu</p>
                        <p className="text-xs text-muted-foreground">Použijte API pro vydávání MioCoinů</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>

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

        {/* Logo Management Section */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="w-5 h-5" />
              Logo partnera
            </CardTitle>
            <CardDescription>
              Nahrajte logo pro zobrazení na webu. Logo musí být schváleno administrátorem.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-6">
              {/* Current logo preview */}
              <div className="flex-shrink-0">
                <div className="w-32 h-20 bg-muted rounded-lg flex items-center justify-center overflow-hidden border border-border">
                  {partner.logo_url && partner.logo_status !== 'none' ? (
                    <img
                      src={partner.logo_url}
                      alt={partner.name}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <Image className="w-8 h-8 text-muted-foreground/50" />
                  )}
                </div>
              </div>
              
              {/* Status and upload */}
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  {getLogoStatusBadge(partner.logo_status)}
                </div>
                
                {partner.logo_status === 'rejected' && (
                  <p className="text-sm text-red-600">
                    Vaše logo bylo zamítnuto. Nahrajte prosím nové logo.
                  </p>
                )}
                
                {partner.logo_status === 'pending' && (
                  <p className="text-sm text-amber-600">
                    Vaše logo čeká na schválení administrátorem.
                  </p>
                )}
                
                {partner.logo_status === 'approved' && (
                  <p className="text-sm text-green-600">
                    Vaše logo je schváleno a zobrazuje se na webu.
                  </p>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="logo-upload" className="text-sm font-medium">
                    {partner.logo_status === 'none' || partner.logo_status === 'rejected' 
                      ? 'Nahrát logo' 
                      : 'Nahrát nové logo'}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="logo-upload"
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                      onChange={handleLogoFileSelect}
                      className="max-w-xs"
                    />
                    {selectedLogoFile && (
                      <Button 
                        onClick={handleLogoUpload} 
                        disabled={uploadingLogo}
                        size="sm"
                      >
                        {uploadingLogo ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : (
                          <Upload className="w-4 h-4 mr-1" />
                        )}
                        Nahrát
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG, SVG (max 5MB). Doporučené rozměry: 320×180px (16:9)
                  </p>
                  {selectedLogoFile && (
                    <p className="text-sm text-primary">
                      Vybrán soubor: {selectedLogoFile.name}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Keys Section */}
        <Card id="api-keys" className="border-border/50 scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              API klíče
            </CardTitle>
            <CardDescription>
              Přehled vašich API klíčů pro integraci
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isAccountApproved ? (
              <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">API klíče nejsou dostupné</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Váš účet čeká na schválení administrátorem. Po schválení budete moci využívat API klíče.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* API key exists - show secure message */}
                <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">API klíč je aktivní, ale z bezpečnostních důvodů se nezobrazuje.</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Pro získání nového klíče použijte „Regenerovat API klíč".
                      </p>
                    </div>
                  </div>
                </div>

                {/* Show key prefixes for reference */}
                {hasActiveApiKeys && (
                  <div className="space-y-3">
                    {apiKeys.filter(k => !k.revoked_at).map((key) => (
                      <div
                        key={key.id}
                        className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-2"
                      >
                        <div className="flex items-center gap-3">
                          <Key className="w-4 h-4 text-muted-foreground" />
                          <code className="text-sm font-mono bg-background px-2 py-1 rounded">
                            {key.key_prefix}••••••••••••••••
                          </code>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground pl-7">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Vytvořeno: {format(new Date(key.created_at), 'dd.MM.yyyy HH:mm', { locale: cs })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Always show regenerate button */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-4 border-t border-border/30">
                  <Button
                    onClick={openRotatePasswordModal}
                    disabled={rotatingKey}
                    className="gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Regenerovat API klíč
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openActivateModal}
                      className="gap-2"
                    >
                      <Gift className="w-4 h-4" />
                      Aktivovat odměnu
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* API Activity Section */}
        {isAccountApproved && (
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                API aktivita
              </CardTitle>
              <CardDescription>
                Posledních 50 volání API (pouze pro čtení)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {apiActivity.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endpoint</TableHead>
                      <TableHead className="text-right">Datum a čas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiActivity.map((activity, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono text-sm">
                          {activity.endpoint || '—'}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {activity.created_at
                            ? format(new Date(activity.created_at), 'dd.MM.yyyy HH:mm:ss', { locale: cs })
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Zatím nemáte žádnou API aktivitu</p>
                </div>
              )}
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

      {/* Activate Reward Modal - Admin only */}
      {isAdmin && (
        <Dialog open={activateModalOpen} onOpenChange={setActivateModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Gift className="w-5 h-5" />
                Aktivovat odměnu
              </DialogTitle>
              <DialogDescription>
                Zadejte kód odměny a váš API klíč pro aktivaci.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="reward-code">Kód odměny</Label>
                <Input
                  id="reward-code"
                  placeholder="např. ABC123XYZ"
                  value={rewardCodeInput}
                  onChange={(e) => setRewardCodeInput(e.target.value)}
                  disabled={activatingReward}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="api-key">API klíč</Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder="Váš API klíč"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  disabled={activatingReward}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setActivateModalOpen(false)}
                disabled={activatingReward}
              >
                Zrušit
              </Button>
              <Button
                onClick={handleActivateRewardSubmit}
                disabled={activatingReward || !rewardCodeInput.trim() || !apiKeyInput.trim()}
              >
                {activatingReward ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Aktivuji...
                  </>
                ) : (
                  'Aktivovat'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Password Confirmation Modal for API Key Rotation */}
      <Dialog open={rotatePasswordModalOpen} onOpenChange={setRotatePasswordModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Potvrzení rotace API klíče
            </DialogTitle>
            <DialogDescription>
              Pro regenerování API klíče zadejte své heslo. Stávající klíč bude zneplatněn.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rotate-password">Heslo</Label>
              <div className="relative">
                <Input
                  id="rotate-password"
                  type={rotatePasswordVisible ? 'text' : 'password'}
                  value={rotatePassword}
                  onChange={(e) => setRotatePassword(e.target.value)}
                  placeholder="Zadejte své heslo"
                  className="pr-10"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && rotatePassword.trim()) {
                      handleRotateApiKey();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setRotatePasswordVisible(!rotatePasswordVisible)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {rotatePasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRotatePasswordModalOpen(false)}
              disabled={rotatingKey}
            >
              Zrušit
            </Button>
            <Button
              onClick={handleRotateApiKey}
              disabled={rotatingKey || !rotatePassword.trim()}
            >
              {rotatingKey ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Regeneruji...
                </>
              ) : (
                'Regenerovat'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Modal with New API Key */}
      <Dialog open={rotateSuccessModalOpen} onOpenChange={(open) => !open && closeRotateSuccessModal()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              API klíč byl úspěšně vygenerován
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg">
              <Label className="text-xs text-muted-foreground mb-2 block">Váš nový API klíč</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono bg-background px-3 py-2 rounded border break-all">
                  {newApiKey}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyApiKeyToClipboard}
                  title="Kopírovat do schránky"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <p className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Tento API klíč se zobrazí pouze jednou.</strong> Uložte si ho na bezpečné místo.
                </span>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={closeRotateSuccessModal}>
              Rozumím, zavřít
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PartnerDashboard;
