import React, { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { useNavigate, useLocation } from 'react-router-dom';
import { NavigateToLogin } from '@/components/NavigateToLogin';
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
import { RefreshCw, GamepadIcon, Check, Volume2, VolumeX, Camera, Loader2, ChevronDown, CheckCircle, XCircle } from 'lucide-react';
import {
  OneMilBellIcon,
  OneMilCoinsIcon,
  OneMilProfileIcon,
  OneMilEmailIcon,
  OneMilCrownIcon,
  OneMilDiamondIcon,
  OneMilWalletIcon,
  OneMilShieldIcon,
  OneMilInfoIcon,
} from '@/components/icons/OneMilIcons';
import ReferralSection from '@/components/ReferralSection';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Link } from 'react-router-dom';
import { setPendingPaymentSuccessContext, isSafeInternalPath } from '@/lib/paymentSuccessContext';
import { logStripeCheckoutClientFailure } from '@/lib/monitoring';
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

// Animated count-up hook with smoother easing
const useCountUp = (target: number, duration: number = 1200) => {
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
      
      // Elastic ease-out for more dramatic effect
      const easeOut = 1 - Math.pow(1 - progress, 4);
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

// Premium section card — consistent with Games/Vouchers/Wins/Messages design
const PremiumCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div
    className={`relative overflow-hidden rounded-2xl ${className}`}
    style={{
      background: 'linear-gradient(135deg, hsl(220, 25%, 8%) 0%, hsl(220, 30%, 12%) 50%, hsl(220, 25%, 8%) 100%)',
      border: '1px solid rgba(255,138,0,0.2)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,138,0,0.06)',
    }}
  >
    {children}
  </div>
);

// Standard icon tile for section headers
const SectionTile: React.FC<{ icon: React.ReactNode }> = ({ icon }) => (
  <div
    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
    style={{
      background: 'linear-gradient(135deg, #FF8A00 0%, #c86000 100%)',
      boxShadow: '0 4px 20px rgba(255,138,0,0.25)',
    }}
  >
    {icon}
  </div>
);

const Profile: React.FC = () => {
  const { user, session } = useAuth();
  const { isAdmin } = useUserRole();
  const { soundEnabled, messageSoundEnabled, winSoundEnabled, toggleSound, toggleMessageSound, toggleWinSound } = useNotificationSettings();
  const navigate = useNavigate();
  const location = useLocation();
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
      const timer = setTimeout(() => setPageLoaded(true), 100);
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
      const { data, error } = await supabase.from('wallets').select('*').eq('user_id', user?.id ?? '').maybeSingle();
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
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, full_name, phone, street, city, zip, country, avatar_url, date_of_birth')
        .eq('id', user?.id ?? '')
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        return;
      }
      
      if (data) {
        setProfile({
          nickname: data.full_name || '',
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          address: [data.street, data.city, data.zip, data.country].filter(Boolean).join(', '),
          phone: data.phone || '',
          avatar_url: data.avatar_url || null,
          date_of_birth: data.date_of_birth || null
        });
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Chyba",
        description: "Vyberte prosím obrázek.",
        variant: "destructive"
      });
      return;
    }

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

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

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
      const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null;
      // Parse address into structured fields: "street, city, zip, country"
      const addressParts = profile.address ? profile.address.split(',').map(s => s.trim()) : [];
      const street = addressParts[0] || null;
      const city = addressParts[1] || null;
      const zip = addressParts[2] || null;
      const country = addressParts[3] || null;

      const { error } = await supabase.from('profiles').upsert({
        id: user?.id!,
        first_name: profile.first_name || null,
        last_name: profile.last_name || null,
        full_name: fullName,
        phone: profile.phone || null,
        street,
        city,
        zip,
        country,
        updated_at: new Date().toISOString(),
      });
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
    const bonusBefore = wallet?.bonus_balance_coins ?? 0;
    setTransferring(true);
    try {
      const { error } = await supabase.rpc('transfer_bonus_to_main');
      if (error) throw error;
      
      await fetchUserWallet();
      await fetchBonusTransfers();

      toast({
        title: "Úspěch",
        description: `Převedeno ${bonusBefore.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} MioCoinů do hlavní peněženky.`
      });
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
    if (purchaseLoading) return;
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
      totalCoins = amount;
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
        const stateReturn = (location.state as { paymentReturnTo?: string } | null)?.paymentReturnTo;
        setPendingPaymentSuccessContext({
          kind: 'miocoin',
          returnTo:
            stateReturn && isSafeInternalPath(stateReturn) ? stateReturn : null,
        });
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
      if (user) {
        const phase =
          error instanceof Error &&
          (error.message.includes('No checkout') || error.message.includes('checkout URL'))
            ? 'response'
            : 'invoke';
        logStripeCheckoutClientFailure({
          userId: user.id,
          priceInCzk,
          error,
          phase,
        });
      }
      if (preOpenedWindow && !preOpenedWindow.closed) {
        preOpenedWindow.close();
      }
      toast({
        title: "Chyba",
        description: "Nepodařilo se vytvořit platbu. Zkuste to znovu.",
        variant: "destructive"
      });
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
    return <NavigateToLogin />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background dark pb-20">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-[rgba(255,138,0,0.25)] border-t-[#FF8A00] animate-spin" />
              <OneMilDiamondIcon size={20} className="absolute inset-0 m-auto w-5 h-5 text-[#FF8A00] animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />

      <div className="container mx-auto px-4 py-8">

        {/* ── Premium Profile Header ──────────────────────────────────── */}
        <div
          className="relative overflow-hidden rounded-2xl p-6 mb-6"
          style={{
            background: 'linear-gradient(135deg, hsl(220, 25%, 8%) 0%, hsl(220, 30%, 12%) 50%, hsl(220, 25%, 8%) 100%)',
            border: '1px solid rgba(255,138,0,0.2)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,138,0,0.06)',
          }}
        >
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,181,71,1) 50%, transparent 100%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 4s ease-in-out infinite',
            }}
          />
          <div className="relative flex items-center gap-5">
            {/* Avatar with upload */}
            <div className="relative group flex-shrink-0">
              <Avatar className="h-20 w-20 border-2 border-[rgba(255,138,0,0.4)] shadow-lg">
                <AvatarImage src={profile.avatar_url || undefined} alt="Avatar" className="object-cover" />
                <AvatarFallback
                  className="text-2xl font-bold"
                  style={{ background: 'rgba(255,138,0,0.15)', color: '#FFB547', fontFamily: 'var(--om-font-heading)' }}
                >
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute inset-0 flex items-center justify-center bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
              >
                {avatarUploading
                  ? <Loader2 className="h-7 w-7 text-[#FF8A00] animate-spin" />
                  : <Camera className="h-7 w-7 text-[#FF8A00]" />}
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            </div>
            {/* Name + subtitle */}
            <div>
              <h1
                className="text-2xl md:text-3xl font-bold tracking-tight"
                style={{
                  fontFamily: 'var(--om-font-heading)',
                  background: 'linear-gradient(135deg, #FFB547 0%, #FF8A00 50%, #FFB547 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                }}
              >
                {profile.nickname || profile.first_name || 'Můj profil'}
              </h1>
              <p className="text-sm text-gray-400 mt-1">Kliknutím na avatar změníte obrázek</p>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

            {/* LEFT COLUMN */}
            <div className="space-y-5">

          {/* Penezenka */}
          <PremiumCard>
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <SectionTile icon={<OneMilWalletIcon size={24} className="w-6 h-6 text-black" />} />
                  <div>
                    <h2 className="text-xl font-bold text-[#E7EBF0]">Peněženka</h2>
                    <p className="text-sm text-gray-400">Váš MioCoin účet</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleRefreshBalance} disabled={refreshing}
                  className="text-[#8E98A6] hover:text-[#FF8A00] hover:bg-[rgba(255,138,0,0.08)] transition-all duration-200">
                  <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Aktualizuji...' : 'Aktualizovat'}
                </Button>
              </div>

              {/* Balance display */}
              <div className="rounded-xl border border-[rgba(255,138,0,0.15)] bg-[rgba(255,138,0,0.04)] p-6 mb-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                  {/* Main balance */}
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-full bg-gradient-to-br from-[#FFB547] via-[#FF8A00] to-[#e07800] shadow-lg shadow-[rgba(255,138,0,0.2)]">
                      <OneMilCoinsIcon size={32} className="h-8 w-8 text-black" />
                    </div>
                    <div>
                      <p className="text-xs text-[rgba(255,138,0,0.7)] uppercase tracking-wider mb-0.5">MioCoiny</p>
                      <p className="text-4xl lg:text-5xl font-black text-[#FFB547] tabular-nums tracking-tight">
                        {animatedBalance.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                      </p>
                    </div>
                  </div>

                  {/* Bonus balance */}
                  <div className="flex flex-col gap-3 lg:border-l lg:border-[rgba(255,138,0,0.15)] lg:pl-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-green-500/20 border border-green-500/30">
                        <OneMilCoinsIcon size={20} className="h-5 w-5 text-green-500" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-xs text-green-500/80 uppercase tracking-wider">Bonusové</p>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <OneMilInfoIcon size={14} className="h-3.5 w-3.5 text-muted-foreground hover:text-green-500 cursor-help transition-colors" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs bg-card/95 backdrop-blur-xl border-border/50">
                                <p className="text-sm">Bonusové MioCoiny získáváte jako odměnu při hraní soutěží. Můžete je převést do hlavní peněženky a použít na otevření tiketů.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <p className="text-2xl font-bold text-green-500 tabular-nums">
                          {animatedBonusBalance.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" onClick={handleTransferBonus}
                      disabled={transferring || (wallet?.bonus_balance_coins ?? 0) === 0}
                      className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold shadow-lg shadow-green-500/15 transition-all duration-200">
                      {transferring ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <OneMilDiamondIcon size={16} className="h-4 w-4 mr-2" />}
                      Převést bonusové MioCoiny
                    </Button>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <Button onClick={() => setShowTopUpModal(true)}
                  className="flex-1 bg-gradient-to-r from-[#FF8A00] to-[#FFB547] hover:from-[#FFB547] hover:to-[#FF8A00] text-black font-bold shadow-lg shadow-[rgba(255,138,0,0.2)] transition-all duration-200"
                  size="lg">
                  <OneMilCoinsIcon size={20} className="h-5 w-5 mr-2" />
                  Dobít MioCoiny
                </Button>
                <Button onClick={() => navigate('/my-contests')} variant="outline"
                  className="flex-1 border-[rgba(255,138,0,0.3)] hover:border-[rgba(255,138,0,0.5)] hover:bg-[rgba(255,138,0,0.06)] text-[#E7EBF0] font-semibold transition-all duration-200"
                  size="lg">
                  <GamepadIcon className="h-5 w-5 mr-2" />
                  Moje hry
                </Button>
              </div>

              {/* Transfer history */}
              <div className="pt-5 border-t border-[rgba(255,138,0,0.12)]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[#8E98A6] uppercase tracking-wider">Historie převodů</h3>
                  {bonusTransfers.length > 3 && (
                    <Button variant="ghost" size="sm"
                      onClick={() => setHistoryExpanded(!historyExpanded)}
                      className="text-xs text-[#8E98A6] hover:text-[#FF8A00] flex items-center gap-1">
                      {historyExpanded ? 'Skrýt historii' : 'Zobrazit celou historii'}
                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${historyExpanded ? 'rotate-180' : ''}`} />
                    </Button>
                  )}
                </div>
                {bonusTransfersLoading ? (
                  <div className="flex items-center gap-2 text-sm text-[#8E98A6]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Načítám...
                  </div>
                ) : bonusTransfers.length === 0 ? (
                  <p className="text-sm text-[#8E98A6] italic">Zatím žádné převody bonusových MioCoinů</p>
                ) : (
                  <div 
                    className={`space-y-2 transition-all duration-500 ease-out ${
                      historyExpanded ? 'max-h-64 overflow-y-auto' : 'max-h-none overflow-hidden'
                    }`}
                  >
                    {(historyExpanded ? bonusTransfers : bonusTransfers.slice(0, 3)).map((transfer, index) => (
                      <div 
                        key={transfer.id} 
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-green-500/5 via-transparent to-green-500/5 border border-green-500/10 hover:border-green-500/20 transition-all duration-300"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-lg bg-green-500/15">
                            <OneMilCoinsIcon size={16} className="h-4 w-4 text-green-500" />
                          </div>
                          <span className="text-sm text-foreground">Převod bonusových MioCoinů</span>
                        </div>
                        <div className="flex items-center gap-4 pl-8 sm:pl-0">
                          <span className="text-sm font-bold text-green-500">+{transfer.amount} MioCoinů</span>
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
          </PremiumCard>

          {/* Osobni udaje */}
          <PremiumCard>
            <div className="p-6">
              {/* Section Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <SectionTile icon={<OneMilProfileIcon size={24} className="w-6 h-6 text-black" />} />
                  <div>
                    <h2 className="text-xl font-bold text-[#E7EBF0]">Osobní údaje</h2>
                    <p className="text-sm text-gray-400">Profil a kontaktní informace</p>
                  </div>
                </div>
                {!editMode && (
                  <Button 
                    variant="outline" 
                    size="default" 
                    type="button"
                    onClick={() => setEditMode(true)}
                    className="relative z-20 border-[rgba(255,138,0,0.3)] bg-[rgba(255,138,0,0.04)] hover:bg-[rgba(255,138,0,0.08)] hover:border-[rgba(255,138,0,0.5)] text-[#FF8A00] hover:text-[#FFB547] transition-all duration-300 font-semibold px-6 rounded-xl hover:shadow-lg hover:shadow-[rgba(255,138,0,0.08)] hover:scale-[1.02]"
                  >
                    <OneMilDiamondIcon size={16} className="h-4 w-4 mr-2" />
                    Upravit
                  </Button>
                )}
              </div>
              
              {editMode ? (
                <>
                  {/* Edit Mode - Premium Input Fields */}
                  <div className="relative z-20 grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                    <div className="space-y-2.5">
                      <Label htmlFor="nickname" className="text-xs font-semibold text-[rgba(255,138,0,0.65)] uppercase tracking-widest flex items-center gap-2">
                        <OneMilDiamondIcon size={12} className="h-3 w-3" />
                        Přezdívka
                      </Label>
                      <Input 
                        id="nickname" 
                        type="text" 
                        readOnly={!editMode}
                        value={profile.nickname} 
                        onChange={e => setProfile(prev => ({
                          ...prev,
                          nickname: e.target.value
                        }))} 
                        placeholder="Zadejte přezdívku"
                        className="premium-input pointer-events-auto h-14 px-5 rounded-xl bg-[rgba(255,138,0,0.04)] border-[rgba(255,138,0,0.15)] focus:border-[rgba(255,138,0,0.35)] focus:bg-[rgba(255,138,0,0.08)] transition-all duration-300 placeholder:text-muted-foreground/30 text-lg"
                      />
                    </div>
                    
                    <div className="space-y-2.5">
                      <Label htmlFor="phone" className="text-xs font-semibold text-[rgba(255,138,0,0.65)] uppercase tracking-widest flex items-center gap-2">
                        <OneMilDiamondIcon size={12} className="h-3 w-3" />
                        Telefon
                      </Label>
                      <Input 
                        id="phone" 
                        type="text" 
                        readOnly={!editMode}
                        value={profile.phone} 
                        onChange={e => setProfile(prev => ({
                          ...prev,
                          phone: e.target.value
                        }))} 
                        placeholder="Zadejte telefon"
                        className="premium-input pointer-events-auto h-14 px-5 rounded-xl bg-[rgba(255,138,0,0.04)] border-[rgba(255,138,0,0.15)] focus:border-[rgba(255,138,0,0.35)] focus:bg-[rgba(255,138,0,0.08)] transition-all duration-300 placeholder:text-muted-foreground/30 text-lg"
                      />
                    </div>
                    
                    <div className="space-y-2.5">
                      <Label htmlFor="first_name" className="text-xs font-semibold text-[rgba(255,138,0,0.65)] uppercase tracking-widest flex items-center gap-2">
                        <OneMilDiamondIcon size={12} className="h-3 w-3" />
                        Křestní jméno
                      </Label>
                      <Input 
                        id="first_name" 
                        type="text" 
                        readOnly={!editMode}
                        value={profile.first_name} 
                        onChange={e => setProfile(prev => ({
                          ...prev,
                          first_name: e.target.value
                        }))} 
                        placeholder="Zadejte křestní jméno"
                        className="premium-input pointer-events-auto h-14 px-5 rounded-xl bg-[rgba(255,138,0,0.04)] border-[rgba(255,138,0,0.15)] focus:border-[rgba(255,138,0,0.35)] focus:bg-[rgba(255,138,0,0.08)] transition-all duration-300 placeholder:text-muted-foreground/30 text-lg"
                      />
                    </div>
                    
                    <div className="space-y-2.5">
                      <Label htmlFor="last_name" className="text-xs font-semibold text-[rgba(255,138,0,0.65)] uppercase tracking-widest flex items-center gap-2">
                        <OneMilDiamondIcon size={12} className="h-3 w-3" />
                        Příjmení
                      </Label>
                      <Input 
                        id="last_name" 
                        type="text" 
                        readOnly={!editMode}
                        value={profile.last_name} 
                        onChange={e => setProfile(prev => ({
                          ...prev,
                          last_name: e.target.value
                        }))} 
                        placeholder="Zadejte příjmení"
                        className="premium-input pointer-events-auto h-14 px-5 rounded-xl bg-[rgba(255,138,0,0.04)] border-[rgba(255,138,0,0.15)] focus:border-[rgba(255,138,0,0.35)] focus:bg-[rgba(255,138,0,0.08)] transition-all duration-300 placeholder:text-muted-foreground/30 text-lg"
                      />
                    </div>
                    
                    <div className="space-y-2.5 md:col-span-2">
                      <Label htmlFor="address" className="text-xs font-semibold text-[rgba(255,138,0,0.65)] uppercase tracking-widest flex items-center gap-2">
                        <OneMilDiamondIcon size={12} className="h-3 w-3" />
                        Doručovací adresa výhry
                      </Label>
                      <Textarea 
                        id="address" 
                        readOnly={!editMode}
                        value={profile.address} 
                        onChange={e => setProfile(prev => ({
                          ...prev,
                          address: e.target.value
                        }))} 
                        placeholder="Zadejte doručovací adresu pro výhry" 
                        rows={3}
                        className="premium-input pointer-events-auto px-5 py-4 rounded-xl bg-[rgba(255,138,0,0.04)] border-[rgba(255,138,0,0.15)] focus:border-[rgba(255,138,0,0.35)] focus:bg-[rgba(255,138,0,0.08)] transition-all duration-300 placeholder:text-muted-foreground/30 resize-none text-lg"
                      />
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex gap-4 pt-4">
                    <Button 
                      onClick={handleProfileSave} 
                      disabled={profileSaving}
                      className="bg-gradient-to-r from-[#FF8A00] via-[#FFB547] to-[#FF8A00] hover:from-[#FFB547] hover:via-[#FF8A00] hover:to-[#FFB547] text-black font-bold px-8 h-12 rounded-xl transition-all duration-300 shadow-lg shadow-[rgba(255,138,0,0.2)] hover:shadow-[rgba(255,138,0,0.35)] hover:scale-[1.02]"
                    >
                      {profileSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Ukládám...
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Uložit změny
                        </>
                      )}
                    </Button>
                    <Button 
                      variant="ghost" 
                      onClick={() => setEditMode(false)}
                      disabled={profileSaving}
                      className="text-muted-foreground hover:text-foreground hover:bg-[rgba(255,138,0,0.08)] transition-all duration-300 h-12 px-6 rounded-xl border border-transparent hover:border-[rgba(255,138,0,0.15)]"
                    >
                      Zrušit
                    </Button>
                  </div>
                </>
              ) : (
                /* View Mode - Premium Read-Only Profile Summary */
                <div className="space-y-1">
                  {(profile.nickname || profile.phone || profile.first_name || profile.last_name || profile.address || profile.date_of_birth) ? (
                    <div className="space-y-4">
                      {/* Nickname Row */}
                      <div className="group p-4 rounded-xl bg-gradient-to-r from-[rgba(255,138,0,0.06)] via-transparent to-[rgba(255,138,0,0.04)] border border-[rgba(255,138,0,0.12)] hover:border-[rgba(255,138,0,0.25)] transition-all duration-300 hover:shadow-lg hover:shadow-[rgba(255,138,0,0.04)]">
                        <p className="text-xs font-semibold text-[rgba(255,138,0,0.55)] uppercase tracking-wider mb-2 flex items-center gap-2">
                          <OneMilDiamondIcon size={12} className="h-3 w-3" />
                          Přezdívka
                        </p>
                        <p className="text-xl text-foreground font-semibold tracking-tight">
                          {profile.nickname || <span className="text-muted-foreground/40 font-normal italic">Nenastaveno</span>}
                        </p>
                      </div>
                      
                      {/* Full Name Row */}
                      <div className="group p-4 rounded-xl bg-gradient-to-r from-[rgba(255,138,0,0.06)] via-transparent to-[rgba(255,138,0,0.04)] border border-[rgba(255,138,0,0.12)] hover:border-[rgba(255,138,0,0.25)] transition-all duration-300 hover:shadow-lg hover:shadow-[rgba(255,138,0,0.04)]">
                        <p className="text-xs font-semibold text-[rgba(255,138,0,0.55)] uppercase tracking-wider mb-2 flex items-center gap-2">
                          <OneMilProfileIcon size={12} className="h-3 w-3" />
                          Celé jméno
                        </p>
                        <p className="text-xl text-foreground font-semibold tracking-tight">
                          {(profile.first_name || profile.last_name) 
                            ? [profile.first_name, profile.last_name].filter(Boolean).join(' ')
                            : <span className="text-muted-foreground/40 font-normal italic">Nenastaveno</span>}
                        </p>
                      </div>
                      
                      {/* Phone Row */}
                      <div className="group p-4 rounded-xl bg-gradient-to-r from-[rgba(255,138,0,0.06)] via-transparent to-[rgba(255,138,0,0.04)] border border-[rgba(255,138,0,0.12)] hover:border-[rgba(255,138,0,0.25)] transition-all duration-300 hover:shadow-lg hover:shadow-[rgba(255,138,0,0.04)]">
                        <p className="text-xs font-semibold text-[rgba(255,138,0,0.55)] uppercase tracking-wider mb-2">Telefon</p>
                        <p className="text-xl text-foreground font-semibold tracking-tight">
                          {profile.phone || <span className="text-muted-foreground/40 font-normal italic">Nenastaveno</span>}
                        </p>
                      </div>
                      
                      {/* Date of Birth Row */}
                      <div className="group p-4 rounded-xl bg-gradient-to-r from-[rgba(255,138,0,0.06)] via-transparent to-[rgba(255,138,0,0.04)] border border-[rgba(255,138,0,0.12)] hover:border-[rgba(255,138,0,0.25)] transition-all duration-300 hover:shadow-lg hover:shadow-[rgba(255,138,0,0.04)]">
                        <p className="text-xs font-semibold text-[rgba(255,138,0,0.55)] uppercase tracking-wider mb-2">Datum narození</p>
                        <p className="text-xl text-foreground font-semibold tracking-tight">
                          {profile.date_of_birth 
                            ? format(new Date(profile.date_of_birth), 'dd. MMMM yyyy', { locale: cs })
                            : <span className="text-muted-foreground/40 font-normal italic">Nenastaveno</span>}
                        </p>
                      </div>
                      
                      {/* Address Row */}
                      <div className="group p-4 rounded-xl bg-gradient-to-r from-[rgba(255,138,0,0.06)] via-transparent to-[rgba(255,138,0,0.04)] border border-[rgba(255,138,0,0.12)] hover:border-[rgba(255,138,0,0.25)] transition-all duration-300 hover:shadow-lg hover:shadow-[rgba(255,138,0,0.04)]">
                        <p className="text-xs font-semibold text-[rgba(255,138,0,0.55)] uppercase tracking-wider mb-2">Doručovací adresa</p>
                        <p className="text-xl text-foreground font-semibold tracking-tight whitespace-pre-wrap leading-relaxed">
                          {profile.address || <span className="text-muted-foreground/40 font-normal italic">Nenastaveno</span>}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-16 px-8">
                      <div className="relative w-fit mx-auto mb-6">
                        <div className="absolute inset-0 bg-[rgba(255,138,0,0.15)] rounded-3xl blur-xl" />
                        <div className="relative p-6 rounded-3xl bg-gradient-to-br from-[rgba(255,138,0,0.12)] to-[rgba(255,138,0,0.04)] border border-[rgba(255,138,0,0.15)]">
                          <OneMilProfileIcon size={48} className="w-12 h-12 text-[rgba(255,138,0,0.4)]" />
                        </div>
                      </div>
                      <p className="text-xl text-foreground font-semibold mb-2">Zatím nemáte vyplněny osobní údaje</p>
                      <p className="text-sm text-muted-foreground/60">Klikněte na „Upravit" pro jejich zadání</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </PremiumCard>

            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-5">

          {/* Pozvi pratele */}
          <ReferralSection isLoaded={pageLoaded} />

          {/* Ucet */}
          <PremiumCard>
            <div className="p-6">
              <div className="flex items-center gap-4 mb-5">
                <SectionTile icon={<OneMilShieldIcon size={24} className="w-6 h-6 text-black" />} />
                <div>
                  <h2 className="text-xl font-bold text-[#E7EBF0]">Účet</h2>
                  <p className="text-sm text-gray-400">Přihlašovací údaje</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-[rgba(255,138,0,0.04)] border border-[rgba(255,138,0,0.1)]">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 rounded-lg bg-[rgba(255,138,0,0.1)]">
                      <OneMilEmailIcon size={18} className="text-[#FF8A00]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#8E98A6] uppercase tracking-wider mb-1">E-mailová adresa</p>
                      <p className="text-base font-semibold text-[#E7EBF0] truncate">{wallet?.email || user?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20 shrink-0">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span className="text-xs font-medium text-green-500">Ověřeno</span>
                  </div>
                </div>
                {wallet?.name && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-[rgba(255,138,0,0.04)] border border-[rgba(255,138,0,0.1)]">
                    <div className="p-2 rounded-lg bg-[rgba(255,138,0,0.1)]">
                      <OneMilProfileIcon size={18} className="text-[#FF8A00]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-[#8E98A6] uppercase tracking-wider mb-1">Jméno účtu</p>
                      <p className="text-base font-semibold text-[#E7EBF0] truncate">{wallet.name}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </PremiumCard>

          {/* Notifikace */}
          <PremiumCard>
            <div className="p-6">
              <div className="flex items-center gap-4 mb-5">
                <SectionTile icon={<OneMilBellIcon size={24} className="w-6 h-6 text-black" />} />
                <div>
                  <h2 className="text-xl font-bold text-[#E7EBF0]">Notifikace</h2>
                  <p className="text-sm text-gray-400">Zvuky a upozornění</p>
                </div>
              </div>

              {/* Message sound toggle */}
              <div className="flex items-center justify-between mb-3 p-4 rounded-xl bg-[rgba(255,138,0,0.04)] border border-[rgba(255,138,0,0.1)] hover:border-[rgba(255,138,0,0.2)] transition-all duration-200">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl transition-all duration-300 ${messageSoundEnabled ? 'bg-primary/25 border border-primary/40 shadow-lg shadow-primary/15' : 'bg-muted/30 border border-border/30'}`}>
                    {messageSoundEnabled ? (
                      <Volume2 className="h-5 w-5 text-primary" />
                    ) : (
                      <VolumeX className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-lg">Zvuk pro zprávy</p>
                    <p className="text-sm text-muted-foreground/70">Přehrávat zvuk při nových zprávách</p>
                  </div>
                </div>
                <Switch
                  checked={messageSoundEnabled}
                  onCheckedChange={toggleMessageSound}
                  className="data-[state=checked]:bg-primary"
                />
              </div>

              {/* Win sound toggle */}
              <div className="flex items-center justify-between mb-4 p-4 rounded-xl bg-[rgba(255,138,0,0.04)] border border-[rgba(255,138,0,0.1)] hover:border-[rgba(255,138,0,0.2)] transition-all duration-200">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl transition-all duration-300 ${winSoundEnabled ? 'bg-[rgba(255,138,0,0.2)] border border-[rgba(255,138,0,0.35)] shadow-lg shadow-[rgba(255,138,0,0.12)]' : 'bg-muted/30 border border-border/30'}`}>
                    {winSoundEnabled ? (
                      <Volume2 className="h-5 w-5 text-[#FF8A00]" />
                    ) : (
                      <VolumeX className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-lg">Zvuk pro výhry</p>
                    <p className="text-sm text-muted-foreground/70">Přehrávat zvuk při nových výhrách</p>
                  </div>
                </div>
                <Switch
                  checked={winSoundEnabled}
                  onCheckedChange={toggleWinSound}
                  className="data-[state=checked]:bg-[#FF8A00]"
                />
              </div>

              {/* Test notification section */}
              <div className="pt-4 border-t border-[rgba(255,138,0,0.12)]">
                <p className="text-sm text-[#8E98A6] mb-3">Otestujte si funkčnost push notifikací na vašem zařízení.</p>
                <Button onClick={handleTestNotification} variant="outline" disabled={testingNotification}
                  className="w-full sm:w-auto border-[rgba(255,138,0,0.3)] hover:border-[rgba(255,138,0,0.5)] hover:bg-[rgba(255,138,0,0.06)] text-[#E7EBF0] font-semibold transition-all duration-200">
                  <OneMilBellIcon size={16} className={`h-4 w-4 mr-2 ${testingNotification ? 'animate-pulse' : ''}`} />
                  {testingNotification ? 'Odesílám...' : 'Otestovat notifikaci'}
                </Button>
              </div>
            </div>
          </PremiumCard>

            </div>
          </div>

          {/* Marketing full width */}
          <PremiumCard>
            <div className="p-6">
              <div className="flex items-center gap-4 mb-5">
                <SectionTile icon={<OneMilEmailIcon size={24} className="w-6 h-6 text-black" />} />
                <div>
                  <h2 className="text-xl font-bold text-[#E7EBF0]">Marketingová sdělení</h2>
                  <p className="text-sm text-gray-400">E-mailové novinky</p>
                </div>
              </div>
              
              <div className="space-y-5">
                {/* Status Display */}
                <div className={`flex items-center gap-4 p-5 rounded-xl transition-all duration-500 hover:shadow-lg ${
                  marketingStatus === 'active' 
                    ? 'bg-gradient-to-r from-green-500/15 via-green-500/5 to-transparent border border-green-500/30 hover:border-green-500/50 hover:shadow-green-500/10' 
                    : 'bg-gradient-to-r from-[rgba(255,138,0,0.08)] via-transparent to-[rgba(255,138,0,0.04)] border border-[rgba(255,138,0,0.15)] hover:border-[rgba(255,138,0,0.3)] hover:shadow-[rgba(255,138,0,0.04)]'
                }`}>
                  {marketingStatus === 'active' ? (
                    <>
                      <div className="p-3 rounded-xl bg-green-500/25 border border-green-500/35 shadow-lg shadow-green-500/15">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      </div>
                      <div>
                        <span className="font-bold text-foreground text-lg block">Marketing: Aktivní</span>
                        <span className="text-sm text-green-500/70">Dostáváte novinky e-mailem</span>
                      </div>
                    </>
                  ) : marketingStatus === 'revoked' ? (
                    <>
                      <div className="p-3 rounded-xl bg-destructive/25 border border-destructive/35 shadow-lg shadow-destructive/15">
                        <XCircle className="h-5 w-5 text-destructive" />
                      </div>
                      <div>
                        <span className="font-bold text-foreground text-lg block">Marketing: Odhlášeno</span>
                        <span className="text-sm text-muted-foreground/60">Nepřijímáte marketingové e-maily</span>
                      </div>
                    </>
                  ) : marketingStatus === 'none' ? (
                    <>
                      <div className="p-3 rounded-xl bg-muted/35 border border-border/35">
                        <XCircle className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <span className="font-bold text-foreground text-lg block">Marketing: Nepřihlášeno</span>
                        <span className="text-sm text-muted-foreground/60">Nejste přihlášeni k odběru</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-[#FF8A00]" />
                      <span className="text-muted-foreground">Načítám...</span>
                    </div>
                  )}
                </div>

                <p className="text-sm text-muted-foreground/70 leading-relaxed">
                  V rámci vašeho účtu můžete dostávat informace o nových soutěžích, speciálních akcích a dalších novinkách prostřednictvím e-mailu.
                </p>
                
                {marketingStatus === 'active' && (
                  <div className="pt-4 border-t border-[rgba(255,138,0,0.08)]">
                    <p className="text-sm text-muted-foreground/60 mb-4">Pokud si již nepřejete dostávat marketingová sdělení, můžete se odhlásit.</p>
                    <Button 
                      variant="outline" 
                      className="w-full sm:w-auto border-destructive/35 bg-destructive/5 hover:border-destructive/55 hover:bg-destructive/15 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-destructive/10 font-semibold"
                      onClick={() => {
                        setPendingMarketingAction('unsubscribe');
                        setMarketingDialogOpen(true);
                      }}
                    >
                      <OneMilEmailIcon size={16} className="h-4 w-4 mr-2" />
                      Odhlásit marketing
                    </Button>
                  </div>
                )}

                {(marketingStatus === 'revoked' || marketingStatus === 'none') && (
                  <div className="pt-4 border-t border-[rgba(255,138,0,0.08)]">
                    <p className="text-sm text-muted-foreground/60 mb-4">Chcete-li dostávat marketingová sdělení, můžete se přihlásit.</p>
                    <Button 
                      className="w-full sm:w-auto bg-gradient-to-r from-[#FF8A00] via-[#FFB547] to-[#FF8A00] hover:from-[#FFB547] hover:via-[#FF8A00] hover:to-[#FFB547] text-black font-bold transition-all duration-300 hover:scale-[1.02] shadow-lg shadow-[rgba(255,138,0,0.2)] hover:shadow-[rgba(255,138,0,0.35)]"
                      onClick={() => {
                        setPendingMarketingAction('subscribe');
                        setMarketingDialogOpen(true);
                      }}
                      disabled={marketingSubscribing}
                    >
                      {marketingSubscribing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Přihlašuji...
                        </>
                      ) : (
                        <>
                          <OneMilEmailIcon size={16} className="h-4 w-4 mr-2" />
                          Přihlásit marketing
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </PremiumCard>

        </div>
      </div>

      {/* Premium Top-up Modal */}
      <Dialog open={showTopUpModal} onOpenChange={setShowTopUpModal}>
        <DialogContent className="max-w-md border-[rgba(255,138,0,0.15)] bg-gradient-to-br from-card via-card to-[rgba(255,138,0,0.04)] backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-xl bg-[rgba(255,138,0,0.15)]">
                <OneMilCoinsIcon size={20} className="h-5 w-5 text-[#FF8A00]" />
              </div>
              Dobít MioCoiny
            </DialogTitle>
            <DialogDescription>Vyberte balíček nebo zadejte vlastní částku.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {COIN_PACKAGES.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => handlePackageSelect(pkg)}
                  className={`p-5 rounded-xl border-2 text-left transition-all duration-300 hover:scale-[1.01] ${
                    selectedPackage?.id === pkg.id
                      ? 'border-[rgba(255,138,0,0.5)] bg-gradient-to-r from-[rgba(255,138,0,0.12)] via-[rgba(255,138,0,0.08)] to-[rgba(255,138,0,0.04)] shadow-lg shadow-[rgba(255,138,0,0.08)]'
                      : 'border-border/40 hover:border-[rgba(255,138,0,0.25)] bg-muted/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-xl transition-all duration-300 ${selectedPackage?.id === pkg.id ? 'bg-[rgba(255,138,0,0.2)]' : 'bg-muted/30'}`}>
                        <OneMilCoinsIcon size={20} className={`h-5 w-5 transition-colors ${selectedPackage?.id === pkg.id ? 'text-[#FF8A00]' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className="font-bold text-lg">
                          {pkg.coins.toLocaleString('cs-CZ')} MioCoinů
                          {pkg.bonus > 0 && (
                            <span className="text-green-500 ml-2 font-semibold">+{pkg.bonus} Bonus</span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">{pkg.price} Kč</p>
                      </div>
                    </div>
                    {selectedPackage?.id === pkg.id && (
                      <Check className="h-6 w-6 text-[#FF8A00]" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="border-t border-border/30 pt-4">
              <Label htmlFor="customAmount" className="text-xs font-semibold uppercase tracking-wider">Vlastní částka (Kč)</Label>
              <Input
                id="customAmount"
                type="number"
                placeholder="Zadejte částku..."
                min="1"
                value={customAmount}
                onChange={(e) => handleCustomAmountChange(e.target.value)}
                className="mt-2 premium-input bg-muted/20 border-border/40 focus:border-[rgba(255,138,0,0.45)]"
              />
              {customAmount && parseInt(customAmount) > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Obdržíte <span className="text-[#FFB547] font-semibold">{parseInt(customAmount).toLocaleString('cs-CZ')} MioCoinů</span> (bez bonusu)
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="mt-6 gap-3">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowTopUpModal(false);
                setSelectedPackage(null);
                setCustomAmount('');
              }} 
              disabled={purchaseLoading}
              className="transition-all duration-300 hover:scale-[1.02]"
            >
              Zrušit
            </Button>
            <Button 
              onClick={handleTopUpPurchase} 
              disabled={purchaseLoading || (!selectedPackage && !customAmount)}
              className="bg-gradient-to-r from-[#FF8A00] to-[#FFB547] hover:from-[#FFB547] hover:to-[#FF8A00] text-black font-bold transition-all duration-300 hover:scale-[1.02]"
            >
              {purchaseLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Zpracovávám...
                </>
              ) : 'Pokračovat k platbě'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Marketing Dialog */}
      <AlertDialog open={marketingDialogOpen} onOpenChange={setMarketingDialogOpen}>
        <AlertDialogContent className="border-border/40 bg-gradient-to-br from-card to-card/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">Potvrzení změny</AlertDialogTitle>
            <AlertDialogDescription>
              Opravdu chcete změnit nastavení marketingových sdělení? Tuto volbu můžete kdykoliv změnit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingMarketingAction(null)} className="transition-all duration-300 hover:scale-[1.02]">
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
              className="bg-gradient-to-r from-primary to-primary/80 transition-all duration-300 hover:scale-[1.02]"
            >
              Potvrdit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Profile;
