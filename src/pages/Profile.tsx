import React, { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { toast } from '@/hooks/use-toast';
import { RefreshCw, GamepadIcon, Bell, Coins, Check, Volume2, VolumeX, User, Camera, Loader2, ChevronDown, Mail, CheckCircle, XCircle, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Link } from 'react-router-dom';
import { BottomNavigation } from '@/components/BottomNavigation';
import { AdminMenu } from '@/components/AdminMenu';
import { useUserRole } from '@/hooks/useUserRole';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface UserWallet {
  user_id: string;
  email: string;
  name: string;
  balance_coins: number;
  bonus_balance_coins: number;
  created_at: string;
}

interface BonusTransfer {
  id: string;
  amount: number;
  created_at: string;
}

interface UserProfile {
  nickname: string;
  first_name: string;
  last_name: string;
  address: string;
  phone: string;
  avatar_url: string | null;
  date_of_birth: string | null;
}

interface CoinPackage {
  id: string;
  coins: number;
  bonus: number;
  price: number;
}

const COIN_PACKAGES: CoinPackage[] = [
  { id: 'pack_50', coins: 50, bonus: 0, price: 50 },
  { id: 'pack_300', coins: 300, bonus: 10, price: 300 },
  { id: 'pack_500', coins: 500, bonus: 25, price: 500 },
  { id: 'pack_1200', coins: 1200, bonus: 80, price: 1200 },
];

// Animated count-up hook
const useCountUp = (target: number, duration: number = 800) => {
  const [count, setCount] = useState(0);
  const prevTarget = useRef(target);

  useEffect(() => {
    if (target === prevTarget.current) {
      setCount(target);
      return;
    }
    
    const startValue = prevTarget.current;
    prevTarget.current = target;
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease-out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (target - startValue) * easeOut;
      
      setCount(Math.round(currentValue * 10) / 10);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setCount(target);
      }
    };
    
    requestAnimationFrame(animate);
  }, [target, duration]);

  return count;
};

const Profile: React.FC = () => {
  const { user, session } = useAuth();
  const { isAdmin } = useUserRole();
  const { soundEnabled, messageSoundEnabled, winSoundEnabled, toggleSound, toggleMessageSound, toggleWinSound } = useNotificationSettings();
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [profile, setProfile] = useState<UserProfile>({
    nickname: '',
    first_name: '',
    last_name: '',
    address: '',
    phone: '',
    avatar_url: null,
    date_of_birth: null
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<CoinPackage | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [bonusTransfers, setBonusTransfers] = useState<BonusTransfer[]>([]);
  const [bonusTransfersLoading, setBonusTransfersLoading] = useState(true);
  const [marketingStatus, setMarketingStatus] = useState<'active' | 'revoked' | 'none' | null>(null);
  const [marketingSubscribing, setMarketingSubscribing] = useState(false);
  const [marketingDialogOpen, setMarketingDialogOpen] = useState(false);
  const [pendingMarketingAction, setPendingMarketingAction] = useState<'subscribe' | 'unsubscribe' | null>(null);
  const [pageLoaded, setPageLoaded] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Animated balance values
  const animatedBalance = useCountUp(wallet?.balance_coins || 0);
  const animatedBonusBalance = useCountUp(wallet?.bonus_balance_coins || 0);

  useEffect(() => {
    if (user) {
      fetchUserWallet();
      fetchUserProfile();
      fetchBonusTransfers();
      fetchMarketingStatus();
    }
  }, [user]);

  useEffect(() => {
    if (!loading) {
      // Trigger entrance animations after content loads
      const timer = setTimeout(() => setPageLoaded(true), 50);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  const fetchBonusTransfers = async () => {
    if (!user?.id) return;
    setBonusTransfersLoading(true);
    try {
      const { data, error } = await supabase
        .from('bonus_transfer_history')
        .select('id, amount, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching bonus transfers:', error);
        setBonusTransfers([]);
      } else {
        setBonusTransfers(data || []);
      }
    } catch (error) {
      console.error('Error:', error);
      setBonusTransfers([]);
    } finally {
      setBonusTransfersLoading(false);
    }
  };

  const fetchMarketingStatus = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('user_legal_acceptances')
        .select('document_version')
        .eq('user_id', user.id)
        .eq('document_slug', 'marketing')
        .order('accepted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching marketing status:', error);
        setMarketingStatus(null);
      } else if (!data) {
        setMarketingStatus('none');
      } else {
        setMarketingStatus(data.document_version === 'revoked' ? 'revoked' : 'active');
      }
    } catch (error) {
      console.error('Error:', error);
      setMarketingStatus(null);
    }
  };

  const handleSubscribeMarketing = async () => {
    if (!user?.id) return;
    setMarketingSubscribing(true);
    try {
      const { error } = await supabase.from('user_legal_acceptances').insert({
        user_id: user.id,
        document_slug: 'marketing',
        document_version: '1.0'
      });

      if (error) throw error;

      setMarketingStatus('active');
      toast({
        title: "Úspěch",
        description: "Byli jste přihlášeni k odběru marketingových sdělení."
      });

      // Send notification (non-blocking)
      supabase.functions.invoke('send-marketing-consent-notification', {
        body: { action: 'subscribe' }
      }).catch(err => console.error('Notification error:', err));
    } catch (error: any) {
      console.error('Error subscribing to marketing:', error);
      toast({
        title: "Chyba",
        description: error.message || "Nepodařilo se přihlásit k marketingu.",
        variant: "destructive"
      });
    } finally {
      setMarketingSubscribing(false);
    }
  };

  const fetchUserWallet = async () => {
    try {
      const { data, error } = await (supabase as any).from('wallets').select('*').eq('user_id', user?.id).maybeSingle();
      if (error) {
        console.error('Error fetching wallet:', error);
        setWallet({
          user_id: user?.id || '',
          email: user?.email || '',
          name: user?.user_metadata?.name || user?.user_metadata?.full_name || '',
          balance_coins: 0,
          bonus_balance_coins: 0,
          created_at: new Date().toISOString()
        });
      } else if (data) {
        setWallet({
          user_id: data.user_id || '',
          email: user?.email || '',
          name: user?.user_metadata?.name || user?.user_metadata?.full_name || '',
          balance_coins: Number(data.balance_coins) || 0,
          bonus_balance_coins: Number(data.bonus_balance_coins) || 0,
          created_at: data.created_at || new Date().toISOString()
        });
      } else {
        setWallet({
          user_id: user?.id || '',
          email: user?.email || '',
          name: user?.user_metadata?.name || user?.user_metadata?.full_name || '',
          balance_coins: 0,
          bonus_balance_coins: 0,
          created_at: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error:', error);
      setWallet({
        user_id: user?.id || '',
        email: user?.email || '',
        name: user?.user_metadata?.name || user?.user_metadata?.full_name || '',
        balance_coins: 0,
        bonus_balance_coins: 0,
        created_at: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserProfile = async () => {
    try {
      const result = await (supabase as any).from('users').select('nickname, first_name, last_name, address, phone').eq('id', user?.id).maybeSingle();
      const data = (result as any)?.data as any;
      const error = (result as any)?.error as any;
      if (error) {
        console.error('Error fetching profile:', error);
        return;
      }
      
      // Also fetch avatar and date_of_birth from profiles table
      const profileResult = await supabase.from('profiles').select('avatar_url, date_of_birth').eq('id', user?.id ?? '').maybeSingle();
      const avatarUrl = profileResult.data?.avatar_url || null;
      const dateOfBirth = (profileResult.data as any)?.date_of_birth || null;
      
      if (data) {
        setProfile({
          nickname: data.nickname || '',
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          address: data.address || '',
          phone: data.phone || '',
          avatar_url: avatarUrl,
          date_of_birth: dateOfBirth
        });
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Chyba",
        description: "Vyberte prosím obrázek.",
        variant: "destructive"
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Chyba",
        description: "Obrázek je příliš velký. Maximální velikost je 5 MB.",
        variant: "destructive"
      });
      return;
    }

    setAvatarUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Update profiles table
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({ id: user.id, avatar_url: avatarUrl, updated_at: new Date().toISOString() });

      if (updateError) throw updateError;

      setProfile(prev => ({ ...prev, avatar_url: avatarUrl }));
      toast({
        title: "Úspěch",
        description: "Profilový obrázek byl nahrán."
      });
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se nahrát obrázek. Zkuste to znovu.",
        variant: "destructive"
      });
    } finally {
      setAvatarUploading(false);
      // Reset input
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
    }
  };

  const getInitials = () => {
    const first = profile.first_name?.[0] || '';
    const last = profile.last_name?.[0] || '';
    if (first || last) return (first + last).toUpperCase();
    return wallet?.email?.[0]?.toUpperCase() || 'U';
  };

  const handleProfileSave = async () => {
    setProfileSaving(true);
    try {
      const { error } = await (supabase as any).from('users').update({
        nickname: profile.nickname || null,
        first_name: profile.first_name || null,
        last_name: profile.last_name || null,
        address: profile.address || null,
        phone: profile.phone || null
      }).eq('id', user?.id);
      if (error) {
        throw error;
      }
      toast({
        title: "Úspěch",
        description: "Profil byl úspěšně uložen."
      });
      setEditMode(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se uložit profil. Zkuste to znovu.",
        variant: "destructive"
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleTransferBonus = async () => {
    setTransferring(true);
    try {
      const { error } = await supabase.rpc('transfer_bonus_to_main');
      if (error) throw error;
      
      toast({
        title: "Úspěch",
        description: "Bonusové MioCoiny byly převedeny do hlavní peněženky."
      });
      
      await fetchUserWallet();
      await fetchBonusTransfers();
    } catch (error) {
      console.error('Error transferring bonus:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se převést bonusové MioCoiny.",
        variant: "destructive"
      });
    } finally {
      setTransferring(false);
    }
  };

  const handleRefreshBalance = async () => {
    setRefreshing(true);
    try {
      await fetchUserWallet();
      toast({
        title: "Úspěch",
        description: "Zůstatek byl aktualizován."
      });
    } catch (error) {
      console.error('Error refreshing balance:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se aktualizovat zůstatek. Zkuste to znovu.",
        variant: "destructive"
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleTestNotification = async () => {
    setTestingNotification(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-test-notification');
      if (error) {
        throw error;
      }
      toast({
        title: "Notifikace odeslána",
        description: "Testovací notifikace byla úspěšně odeslána. Zkontrolujte svá zařízení.",
      });
    } catch (error: any) {
      console.error('Error sending test notification:', error);
      toast({
        title: "Chyba při odeslání",
        description: error.message || "Nepodařilo se odeslat testovací notifikaci.",
        variant: "destructive"
      });
    } finally {
      setTestingNotification(false);
    }
  };

  const handleTopUpPurchase = async () => {
    let priceInCzk: number;
    let totalCoins: number;

    if (selectedPackage) {
      priceInCzk = selectedPackage.price;
      totalCoins = selectedPackage.coins + selectedPackage.bonus;
    } else if (customAmount) {
      const amount = parseInt(customAmount);
      if (!amount || amount < 1) {
        toast({
          title: "Chyba",
          description: "Zadejte platnou částku.",
          variant: "destructive"
        });
        return;
      }
      priceInCzk = amount;
      totalCoins = amount; // No bonus for custom amount
    } else {
      toast({
        title: "Chyba",
        description: "Vyberte balíček nebo zadejte vlastní částku.",
        variant: "destructive"
      });
      return;
    }

    setPurchaseLoading(true);
    const preOpenedWindow = window.open('', '_blank');

    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-checkout', {
        body: {
          priceInCzk,
          totalCoins
        }
      });

      if (error) {
        throw error;
      }

      if (data.checkout_url) {
        if (preOpenedWindow && !preOpenedWindow.closed) {
          preOpenedWindow.location.href = data.checkout_url;
        } else {
          if (window.top && window.top !== window) {
            window.top.location.assign(data.checkout_url);
          } else {
            window.location.assign(data.checkout_url);
          }
        }
      } else {
        throw new Error('No checkout URL received');
      }

      setShowTopUpModal(false);
      setSelectedPackage(null);
      setCustomAmount('');
    } catch (error) {
      console.error('Error creating checkout session:', error);
      if (preOpenedWindow && !preOpenedWindow.closed) {
        preOpenedWindow.close();
      }
      toast({
        title: "Chyba",
        description: "Nepodařilo se vytvořit platbu. Zkuste to znovu.",
        variant: "destructive"
      });
    } finally {
      setPurchaseLoading(false);
    }
  };

  const handlePackageSelect = (pkg: CoinPackage) => {
    setSelectedPackage(pkg);
    setCustomAmount('');
  };

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value);
    setSelectedPackage(null);
  };

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background dark pb-20">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-pulse text-muted-foreground">Načítám profil...</div>
          </div>
        </div>
        {isAdmin ? <AdminMenu /> : <BottomNavigation />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        {/* Page Header with Avatar - Premium VIP Style */}
        <div 
          className={`flex items-center gap-5 mb-10 transition-all duration-700 ease-out ${
            pageLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          {/* Avatar with Animated Ring */}
          <div className="relative group">
            {/* Outer glow ring */}
            <div className="absolute -inset-1.5 rounded-full bg-gradient-to-r from-yellow-500/40 via-yellow-400/20 to-yellow-500/40 blur-sm animate-pulse" />
            {/* Animated ring */}
            <div 
              className="absolute -inset-1 rounded-full"
              style={{
                background: 'conic-gradient(from 0deg, hsl(43 90% 55% / 0.6), hsl(220 80% 45% / 0.3), hsl(43 90% 55% / 0.6))',
                animation: 'spin 4s linear infinite'
              }}
            />
            <Avatar className="relative h-24 w-24 border-2 border-yellow-500/30 ring-2 ring-background">
              <AvatarImage src={profile.avatar_url || undefined} alt="Avatar" />
              <AvatarFallback className="bg-gradient-to-br from-muted to-muted/50 text-foreground text-2xl font-semibold">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute inset-0 flex items-center justify-center bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer backdrop-blur-sm"
            >
              {avatarUploading ? (
                <Loader2 className="h-7 w-7 text-white animate-spin" />
              ) : (
                <Camera className="h-7 w-7 text-white" />
              )}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-heading-gold mb-1">Můj profil</h1>
            <p className="text-sm text-muted-foreground">Kliknutím na avatar změníte obrázek</p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto space-y-6">
          
          {/* Wallet Section - Premium VIP Card with Gold Glow */}
          <div 
            className={`relative overflow-hidden rounded-2xl transition-all duration-700 ease-out delay-100 ${
              pageLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            {/* Background glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-transparent to-yellow-600/5" />
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-yellow-500/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-yellow-600/8 rounded-full blur-2xl" />
            
            {/* Card content */}
            <div className="relative rounded-2xl border border-yellow-500/20 bg-gradient-to-br from-card/95 via-card/90 to-card/95 backdrop-blur-xl p-6 shadow-[0_0_40px_-12px_hsl(43_90%_55%/0.3)]">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border border-yellow-500/20">
                    <Coins className="h-5 w-5 text-yellow-500" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">Peněženka</h2>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleRefreshBalance} 
                  disabled={refreshing}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all duration-200 hover:scale-105"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Aktualizuji...' : 'Aktualizovat'}
                </Button>
              </div>
              
              {/* Balance Display - Premium Style with Animated Count */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-center gap-6 mb-8 py-6 px-4 rounded-xl bg-gradient-to-r from-yellow-500/5 via-transparent to-yellow-500/5 border border-yellow-500/10">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-yellow-500/30 rounded-full blur-lg animate-pulse" />
                    <div className="relative p-3 rounded-full bg-gradient-to-br from-yellow-500/30 to-yellow-600/20 border border-yellow-500/30">
                      <Coins className="h-8 w-8 text-yellow-500" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">MioCoiny</p>
                    <p className="text-4xl font-bold bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 bg-clip-text text-transparent tabular-nums">
                      {animatedBalance.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 md:pl-6 pt-4 md:pt-0 border-t md:border-t-0 md:border-l border-border/30">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-green-500/20 border border-green-500/30">
                      <Coins className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm text-muted-foreground font-medium">Bonusové</p>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground cursor-help transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-sm">Bonusové MioCoiny získáváte jako odměnu při hraní soutěží. Můžete je převést do hlavní peněženky a použít na nákup losů.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <p className="text-2xl font-bold text-green-500 tabular-nums">
                        {animatedBonusBalance.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTransferBonus}
                    disabled={transferring || (wallet?.bonus_balance_coins ?? 0) === 0}
                    className="w-full sm:w-auto sm:ml-2 border-green-500/30 hover:border-green-500/50 hover:bg-green-500/10 transition-all duration-200 hover:scale-[1.02]"
                  >
                    {transferring ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : null}
                    Převést bonusové MioCoiny
                  </Button>
                </div>
              </div>
              
              {/* Action Buttons with Premium Hover Effects */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button 
                  onClick={() => setShowTopUpModal(true)} 
                  className="flex-1 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-semibold shadow-lg shadow-yellow-500/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-yellow-500/30" 
                  size="lg"
                >
                  <Coins className="h-5 w-5 mr-2" />
                  Dobít MioCoiny
                </Button>
                
                <Button 
                  onClick={() => navigate('/my-contests')} 
                  variant="outline" 
                  className="flex-1 border-primary/30 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 hover:scale-[1.02]" 
                  size="lg"
                >
                  <GamepadIcon className="h-5 w-5 mr-2" />
                  Moje hry
                </Button>
              </div>

              {/* Bonus Transfer History */}
              <div className="mt-6 pt-6 border-t border-border/20">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Historie převodů bonusových MioCoinů</h3>
                  {bonusTransfers.length > 3 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setHistoryExpanded(!historyExpanded)}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-all duration-200"
                    >
                      {historyExpanded ? 'Skrýt historii' : 'Zobrazit celou historii'}
                      <ChevronDown 
                        className={`h-4 w-4 transition-transform duration-300 ${historyExpanded ? 'rotate-180' : ''}`} 
                      />
                    </Button>
                  )}
                </div>
                {bonusTransfersLoading ? (
                  <div className="text-sm text-muted-foreground">Načítám...</div>
                ) : bonusTransfers.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Zatím žádné převody bonusových MioCoinů</p>
                ) : (
                  <div 
                    className={`space-y-2 transition-all duration-300 ease-out ${
                      historyExpanded ? 'max-h-64 overflow-y-auto' : 'max-h-none overflow-hidden'
                    }`}
                  >
                    {(historyExpanded ? bonusTransfers : bonusTransfers.slice(0, 3)).map((transfer, index) => (
                      <div 
                        key={transfer.id} 
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2.5 px-3 rounded-lg bg-muted/20 border border-border/20 hover:bg-muted/30 transition-colors"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div className="flex items-center gap-2">
                          <Coins className="h-4 w-4 text-green-500 flex-shrink-0" />
                          <span className="text-sm text-foreground">Převod bonusových MioCoinů</span>
                        </div>
                        <div className="flex items-center gap-3 pl-6 sm:pl-0">
                          <span className="text-sm font-medium text-green-500">+{transfer.amount} MioCoinů</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(transfer.created_at).toLocaleString('cs-CZ', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Account Info Section */}
          <div 
            className={`rounded-2xl border border-border/30 bg-gradient-to-br from-card/90 to-card/70 backdrop-blur-sm p-6 shadow-lg transition-all duration-700 ease-out delay-200 ${
              pageLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <User className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Účet</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1 p-3 rounded-lg bg-muted/10 border border-border/20">
                <label className="text-sm text-muted-foreground font-medium">E-mail</label>
                <p className="text-foreground">{wallet?.email || user?.email}</p>
              </div>
              {wallet?.name && (
                <div className="space-y-1 p-3 rounded-lg bg-muted/10 border border-border/20">
                  <label className="text-sm text-muted-foreground font-medium">Jméno</label>
                  <p className="text-foreground">{wallet.name}</p>
                </div>
              )}
            </div>
          </div>

          {/* Personal Details Section */}
          <div 
            className={`rounded-2xl border border-border/30 bg-gradient-to-br from-card/90 to-card/70 backdrop-blur-sm p-6 shadow-lg transition-all duration-700 ease-out delay-300 ${
              pageLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Osobní údaje</h2>
              </div>
              {!editMode && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setEditMode(true)}
                  className="border-primary/30 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 hover:scale-[1.02]"
                >
                  Upravit profil
                </Button>
              )}
            </div>
            
            {editMode ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                  <div className="space-y-2">
                    <Label htmlFor="nickname">Přezdívka</Label>
                    <Input 
                      id="nickname" 
                      type="text" 
                      value={profile.nickname} 
                      onChange={e => setProfile(prev => ({
                        ...prev,
                        nickname: e.target.value
                      }))} 
                      placeholder="Zadejte přezdívku"
                      className="bg-muted/20 border-border/40 focus:border-primary/50 transition-colors"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefon</Label>
                    <Input 
                      id="phone" 
                      type="text" 
                      value={profile.phone} 
                      onChange={e => setProfile(prev => ({
                        ...prev,
                        phone: e.target.value
                      }))} 
                      placeholder="Zadejte telefon"
                      className="bg-muted/20 border-border/40 focus:border-primary/50 transition-colors"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="first_name">Křestní jméno</Label>
                    <Input 
                      id="first_name" 
                      type="text" 
                      value={profile.first_name} 
                      onChange={e => setProfile(prev => ({
                        ...prev,
                        first_name: e.target.value
                      }))} 
                      placeholder="Zadejte křestní jméno"
                      className="bg-muted/20 border-border/40 focus:border-primary/50 transition-colors"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="last_name">Příjmení</Label>
                    <Input 
                      id="last_name" 
                      type="text" 
                      value={profile.last_name} 
                      onChange={e => setProfile(prev => ({
                        ...prev,
                        last_name: e.target.value
                      }))} 
                      placeholder="Zadejte příjmení"
                      className="bg-muted/20 border-border/40 focus:border-primary/50 transition-colors"
                    />
                  </div>
                  
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address">Doručovací adresa výhry</Label>
                    <Textarea 
                      id="address" 
                      value={profile.address} 
                      onChange={e => setProfile(prev => ({
                        ...prev,
                        address: e.target.value
                      }))} 
                      placeholder="Zadejte doručovací adresu pro výhry" 
                      rows={3}
                      className="bg-muted/20 border-border/40 focus:border-primary/50 transition-colors"
                    />
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <Button 
                    onClick={handleProfileSave} 
                    disabled={profileSaving}
                    className="transition-all duration-200 hover:scale-[1.02]"
                  >
                    {profileSaving ? 'Ukládám...' : 'Uložit profil'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setEditMode(false)}
                    disabled={profileSaving}
                    className="transition-all duration-200 hover:scale-[1.02]"
                  >
                    Zrušit
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                {(profile.nickname || profile.phone || profile.first_name || profile.last_name || profile.address) ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {profile.nickname && (
                      <div className="space-y-1 p-3 rounded-lg bg-muted/10 border border-border/20">
                        <label className="text-sm text-muted-foreground font-medium">Přezdívka</label>
                        <p className="text-foreground">{profile.nickname}</p>
                      </div>
                    )}
                    
                    {profile.phone && (
                      <div className="space-y-1 p-3 rounded-lg bg-muted/10 border border-border/20">
                        <label className="text-sm text-muted-foreground font-medium">Telefon</label>
                        <p className="text-foreground">{profile.phone}</p>
                      </div>
                    )}
                    
                    {(profile.first_name || profile.last_name) && (
                      <div className="space-y-1 p-3 rounded-lg bg-muted/10 border border-border/20">
                        <label className="text-sm text-muted-foreground font-medium">Jméno</label>
                        <p className="text-foreground">
                          {[profile.first_name, profile.last_name].filter(Boolean).join(' ')}
                        </p>
                      </div>
                    )}
                    
                    {profile.address && (
                      <div className="space-y-1 md:col-span-2 p-3 rounded-lg bg-muted/10 border border-border/20">
                        <label className="text-sm text-muted-foreground font-medium">Doručovací adresa</label>
                        <p className="text-foreground whitespace-pre-wrap">{profile.address}</p>
                      </div>
                    )}
                    
                    <div className="space-y-1 p-3 rounded-lg bg-muted/10 border border-border/20">
                      <label className="text-sm text-muted-foreground font-medium">Datum narození</label>
                      <p className="text-foreground">
                        {profile.date_of_birth 
                          ? format(new Date(profile.date_of_birth), 'dd.MM.yyyy', { locale: cs })
                          : 'Neuvedeno'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 px-4 rounded-xl bg-muted/10 border border-dashed border-border/30">
                    <p className="text-muted-foreground">Zatím nemáte vyplněny osobní údaje.</p>
                    <p className="text-sm mt-1 text-muted-foreground/70">Klikněte na "Upravit profil" pro jejich zadání.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notifications Section */}
          <div 
            className={`rounded-2xl border border-border/30 bg-gradient-to-br from-card/90 to-card/70 backdrop-blur-sm p-6 shadow-lg transition-all duration-700 ease-out delay-[400ms] ${
              pageLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <Bell className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Notifikace</h2>
            </div>
            
            {/* Message sound toggle */}
            <div className="flex items-center justify-between mb-3 p-4 rounded-xl bg-muted/10 border border-border/20 hover:bg-muted/15 transition-colors">
              <div className="flex items-center gap-3">
                {messageSoundEnabled ? (
                  <div className="p-2 rounded-lg bg-primary/15 border border-primary/25">
                    <Volume2 className="h-5 w-5 text-primary" />
                  </div>
                ) : (
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/30">
                    <VolumeX className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <p className="font-medium text-foreground">Zvuk pro zprávy</p>
                  <p className="text-sm text-muted-foreground">
                    Přehrávat zvuk při nových zprávách
                  </p>
                </div>
              </div>
              <Switch
                checked={messageSoundEnabled}
                onCheckedChange={toggleMessageSound}
              />
            </div>

            {/* Win sound toggle */}
            <div className="flex items-center justify-between mb-5 p-4 rounded-xl bg-muted/10 border border-border/20 hover:bg-muted/15 transition-colors">
              <div className="flex items-center gap-3">
                {winSoundEnabled ? (
                  <div className="p-2 rounded-lg bg-yellow-500/15 border border-yellow-500/25">
                    <Volume2 className="h-5 w-5 text-yellow-500" />
                  </div>
                ) : (
                  <div className="p-2 rounded-lg bg-muted/30 border border-border/30">
                    <VolumeX className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <p className="font-medium text-foreground">Zvuk pro výhry</p>
                  <p className="text-sm text-muted-foreground">
                    Přehrávat zvuk při nových výhrách
                  </p>
                </div>
              </div>
              <Switch
                checked={winSoundEnabled}
                onCheckedChange={toggleWinSound}
              />
            </div>

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Otestujte si funkčnost push notifikací na vašem zařízení.
              </p>
              <Button 
                onClick={handleTestNotification} 
                variant="outline" 
                disabled={testingNotification}
                className="w-full sm:w-auto border-primary/30 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 hover:scale-[1.02]"
              >
                <Bell className={`h-4 w-4 mr-2 ${testingNotification ? 'animate-pulse' : ''}`} />
                {testingNotification ? 'Odesílám...' : 'Otestovat notifikaci'}
              </Button>
            </div>
          </div>

          {/* Marketing Section */}
          <div 
            className={`rounded-2xl border border-border/30 bg-gradient-to-br from-card/90 to-card/70 backdrop-blur-sm p-6 shadow-lg transition-all duration-700 ease-out delay-500 ${
              pageLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Marketingová sdělení</h2>
            </div>
            <div className="space-y-4">
              {/* Status Display */}
              <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/10 border border-border/20">
                {marketingStatus === 'active' ? (
                  <>
                    <div className="p-2 rounded-lg bg-green-500/15 border border-green-500/25">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    </div>
                    <span className="font-medium text-foreground">Marketing: Aktivní</span>
                  </>
                ) : marketingStatus === 'revoked' ? (
                  <>
                    <div className="p-2 rounded-lg bg-destructive/15 border border-destructive/25">
                      <XCircle className="h-5 w-5 text-destructive" />
                    </div>
                    <span className="font-medium text-foreground">Marketing: Odhlášeno</span>
                  </>
                ) : marketingStatus === 'none' ? (
                  <>
                    <div className="p-2 rounded-lg bg-muted/30 border border-border/30">
                      <XCircle className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <span className="font-medium text-muted-foreground">Marketing: Nepřihlášeno</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Načítám...</span>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                V rámci vašeho účtu můžete dostávat informace o nových soutěžích, 
                speciálních akcích a dalších novinkách prostřednictvím e-mailu.
              </p>
              
              {marketingStatus === 'active' && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Pokud si již nepřejete dostávat marketingová sdělení, můžete se odhlásit.
                  </p>
                  <Button 
                    variant="outline" 
                    className="w-full sm:w-auto border-destructive/30 hover:border-destructive/50 hover:bg-destructive/5 transition-all duration-200 hover:scale-[1.02]"
                    onClick={() => {
                      setPendingMarketingAction('unsubscribe');
                      setMarketingDialogOpen(true);
                    }}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Odhlásit marketing
                  </Button>
                </>
              )}

              {(marketingStatus === 'revoked' || marketingStatus === 'none') && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Chcete-li dostávat marketingová sdělení, můžete se přihlásit.
                  </p>
                  <Button 
                    variant="default" 
                    className="w-full sm:w-auto transition-all duration-200 hover:scale-[1.02]"
                    onClick={() => {
                      setPendingMarketingAction('subscribe');
                      setMarketingDialogOpen(true);
                    }}
                    disabled={marketingSubscribing}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {marketingSubscribing ? 'Přihlašuji...' : 'Přihlásit marketing'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MioCoin Top-up Modal */}
      <Dialog open={showTopUpModal} onOpenChange={setShowTopUpModal}>
        <DialogContent className="max-w-md border-border/40 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Dobít MioCoiny</DialogTitle>
            <DialogDescription>
              Vyberte balíček nebo zadejte vlastní částku.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Package Selection */}
            <div className="grid grid-cols-1 gap-3">
              {COIN_PACKAGES.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => handlePackageSelect(pkg)}
                  className={`p-4 rounded-xl border-2 text-left transition-all duration-200 hover:scale-[1.01] ${
                    selectedPackage?.id === pkg.id
                      ? 'border-yellow-500/60 bg-yellow-500/10 shadow-lg shadow-yellow-500/10'
                      : 'border-border/40 hover:border-yellow-500/30 bg-muted/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${selectedPackage?.id === pkg.id ? 'bg-yellow-500/20' : 'bg-muted/30'}`}>
                        <Coins className={`h-5 w-5 ${selectedPackage?.id === pkg.id ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className="font-semibold">
                          {pkg.coins.toLocaleString('cs-CZ')} MioCoinů
                          {pkg.bonus > 0 && (
                            <span className="text-green-500 ml-1">+{pkg.bonus} Bonus</span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">{pkg.price} Kč</p>
                      </div>
                    </div>
                    {selectedPackage?.id === pkg.id && (
                      <Check className="h-5 w-5 text-yellow-500" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Custom Amount */}
            <div className="border-t border-border/30 pt-4">
              <Label htmlFor="customAmount" className="text-sm font-medium">
                Vlastní částka (Kč)
              </Label>
              <Input
                id="customAmount"
                type="number"
                placeholder="Zadejte částku..."
                min="1"
                value={customAmount}
                onChange={(e) => handleCustomAmountChange(e.target.value)}
                className="mt-2 bg-muted/20 border-border/40"
              />
              {customAmount && parseInt(customAmount) > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  Obdržíte {parseInt(customAmount).toLocaleString('cs-CZ')} MioCoinů (bez bonusu)
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowTopUpModal(false);
                setSelectedPackage(null);
                setCustomAmount('');
              }} 
              disabled={purchaseLoading}
              className="transition-all duration-200 hover:scale-[1.02]"
            >
              Zrušit
            </Button>
            <Button 
              onClick={handleTopUpPurchase} 
              disabled={purchaseLoading || (!selectedPackage && !customAmount)}
              className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-semibold transition-all duration-200 hover:scale-[1.02]"
            >
              {purchaseLoading ? 'Zpracovávám...' : 'Pokračovat k platbě'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Marketing Consent Confirmation Dialog */}
      <AlertDialog open={marketingDialogOpen} onOpenChange={setMarketingDialogOpen}>
        <AlertDialogContent className="border-border/40 bg-card/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Potvrzení změny</AlertDialogTitle>
            <AlertDialogDescription>
              Opravdu chcete změnit nastavení marketingových sdělení? Tuto volbu můžete kdykoliv změnit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingMarketingAction(null)}>
              Zrušit
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingMarketingAction === 'subscribe') {
                  handleSubscribeMarketing();
                } else if (pendingMarketingAction === 'unsubscribe') {
                  navigate('/unsubscribe/marketing');
                }
                setPendingMarketingAction(null);
                setMarketingDialogOpen(false);
              }}
            >
              Potvrdit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default Profile;
