import React, { useEffect, useState, useRef } from 'react';
import { MioBadge } from "@/components/brand/MioBadge";
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { useNavigate, useLocation } from 'react-router-dom';
import { NavigateToLogin } from '@/components/NavigateToLogin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { toast } from '@/hooks/use-toast';
import { RefreshCw, Check, Camera, Loader2, CheckCircle, XCircle, Wallet, MessageSquare, UserRound, Lock, Bell, Mail } from 'lucide-react';
import avatarThrone from '@/assets/redesign/avatar/avatar-trun.webp';
import { OneMilCoinsIcon, OneMilDiamondIcon } from '@/components/icons/OneMilIcons';
import ReferralSection from '@/components/ReferralSection';
import { RedeemMioCoinCard } from '@/components/RedeemMioCoinCard';
import { MioCoinHistory } from '@/components/MioCoinHistory';
import RecommendShopMailtoCard from '@/components/RecommendShopMailtoCard';
import { Link } from 'react-router-dom';
import { setPendingPaymentSuccessContext, isSafeInternalPath } from '@/lib/paymentSuccessContext';
import { isNativeApp } from '@/lib/nativeApp';
import { logStripeCheckoutClientFailure } from '@/lib/monitoring';
import { useUserRole } from '@/hooks/useUserRole';
import { useUnreadMessagesCount } from '@/hooks/useUnreadMessagesCount';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { Switch } from '@/components/ui/switch';

interface UserWallet {
  user_id: string;
  email: string;
  name: string;
  balance_coins: number;
  bonus_balance_coins: number;
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

const Profile: React.FC = () => {
  const { user, session } = useAuth();
  const { isAdmin } = useUserRole();
  // Vstup do Zpráv je nově v profilu — stejný zdroj počtu jako spodní menu.
  const { unreadCount } = useUnreadMessagesCount();
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
  const [transferring, setTransferring] = useState(false);
  const [walletHistoryRefreshKey, setWalletHistoryRefreshKey] = useState(0);
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
      fetchMarketingStatus();
    }
  }, [user]);

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setPageLoaded(true), 100);
      return () => clearTimeout(timer);
    }
  }, [loading]);

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
        description: "Odběr novinek e-mailem je zapnutý."
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
      setWalletHistoryRefreshKey((version) => version + 1);

      toast({
        title: "Úspěch",
        description: `Převedeno ${bonusBefore.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} MIO do hlavní peněženky.`
      });
    } catch (error) {
      console.error('Error transferring bonus:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se převést bonusová MIO.",
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
      setWalletHistoryRefreshKey((version) => version + 1);
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
        description: "Testovací notifikace byla úspěšně odeslána. Zkontroluj svá zařízení.",
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
    // Nativní aplikace nesmí spustit Stripe checkout (Apple/Google pravidla).
    if (isNativeApp()) return;
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
          description: "Zadej platnou částku.",
          variant: "destructive"
        });
        return;
      }
      priceInCzk = amount;
      totalCoins = amount;
    } else {
      toast({
        title: "Chyba",
        description: "Vyber balíček nebo zadej vlastní částku.",
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
      <div className="homepage-light-page min-h-screen bg-background pb-20">
        <Header />
        <div className="homepage-light-content container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-[rgba(194,144,47,0.25)] border-t-[#C2902F] animate-spin" />
              <OneMilDiamondIcon size={20} className="absolute inset-0 m-auto w-5 h-5 text-[#C2902F] animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="homepage-light-page min-h-screen bg-background pb-20">
      <Header />

      <div className="homepage-light-content om-pf container mx-auto px-4 py-6 sm:py-8">

        {/* ── Hlavička: avatar, jméno, avatar na trůnu ── */}
        <section className="om-pf-dc om-pf-hero mb-5" aria-label="Můj profil">
          <button
            type="button"
            className="om-pf-avatar"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            aria-label="Změnit profilový obrázek"
          >
            <span className="om-pf-avatar-ring" aria-hidden="true" />
            <span className="om-pf-avatar-face">
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="" />
                : getInitials()}
            </span>
            <span className="om-pf-avatar-cam" aria-hidden="true">
              {avatarUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </span>
          </button>
          <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          <div className="om-pf-hero-copy">
            <h1 className="om-pf-name">{profile.nickname || profile.first_name || 'Můj profil'}</h1>
            <p className="om-pf-st">Klepnutím na avatar změníš obrázek</p>
          </div>
          <img src={avatarThrone} alt="" aria-hidden="true" className="om-pf-throne" />
        </section>

        <div className="w-full space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

            {/* LEVÝ SLOUPEC */}
            <div className="space-y-5">

              {/* Peněženka */}
              <section className="om-pf-dc">
                <div className="om-pf-head om-pf-head-split">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="om-pf-ic"><Wallet aria-hidden="true" /></span>
                    <div className="min-w-0">
                      <h2 className="om-pf-tt">Peněženka</h2>
                      <p className="om-pf-st">Tvůj MIO účet</p>
                    </div>
                  </div>
                  <button type="button" className="om-pf-refresh" onClick={handleRefreshBalance} disabled={refreshing}>
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                    {refreshing ? 'Aktualizuji…' : 'Aktualizovat'}
                  </button>
                </div>

                <div className="om-pf-balance">
                  <MioBadge width={74} className="shrink-0" />
                  <div className="min-w-0">
                    <div className="om-pf-balance-label">Hlavní zůstatek</div>
                    <div className="om-pf-balance-value">
                      {animatedBalance.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                      <span className="om-pf-unit">MIO</span>
                    </div>
                  </div>
                </div>

                <div className="om-pf-bonus">
                  <div className="min-w-0">
                    <div className="om-pf-bonus-label">Bonusové MIO</div>
                    <div className="om-pf-bonus-value">
                      {animatedBonusBalance.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} MIO
                    </div>
                  </div>
                  <button
                    type="button"
                    className="om-pf-btn om-pf-glass"
                    onClick={handleTransferBonus}
                    disabled={transferring || (wallet?.bonus_balance_coins ?? 0) === 0}
                  >
                    {transferring && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    Převést do peněženky
                  </button>
                </div>
                <p className="om-pf-note mt-2">
                  Bonusová MIO získáváš při hraní soutěží. Převedeš je do hlavní peněženky a použiješ na tikety.
                </p>

                <div className={`om-pf-actions ${isNativeApp() ? 'om-pf-actions-one' : ''}`}>
                  {!isNativeApp() && (
                    <button type="button" className="om-pf-btn om-pf-gold" onClick={() => setShowTopUpModal(true)}>
                      Dobít MIO
                    </button>
                  )}
                  <button type="button" className="om-pf-btn om-pf-outline-dark" onClick={() => navigate('/my-contests')}>
                    Moje hry
                  </button>
                </div>

                <MioCoinHistory refreshKey={walletHistoryRefreshKey} dark />
              </section>

              {/* Zprávy — hlavní vstup do konverzace s podporou (web, PWA i nativní aplikace). */}
              <button type="button" className="om-pf-lc om-pf-msg" onClick={() => navigate('/messages')}>
                <span className="om-pf-ic"><MessageSquare aria-hidden="true" /></span>
                <span className="flex-1 min-w-0">
                  <span className="om-pf-tt">Zprávy</span>
                  <span className="om-pf-st block">
                    {unreadCount > 0
                      ? `Máš ${unreadCount} nepřečtených zpráv`
                      : 'Napiš nám, rádi pomůžeme'}
                  </span>
                </span>
                {unreadCount > 0 && (
                  <span className="om-pf-badge" aria-label={`${unreadCount} nepřečtených`}>{unreadCount}</span>
                )}
                <span className="om-pf-arrow" aria-hidden="true">→</span>
              </button>

              {/* Uplatnění MIO kódu — oddělené od doporučovacího kódu */}
              <RedeemMioCoinCard
                onRedeemed={() => {
                  void fetchUserWallet();
                  setWalletHistoryRefreshKey((version) => version + 1);
                }}
              />

              {/* Osobní údaje */}
              <section className="om-pf-lc">
                <div className="om-pf-head om-pf-head-split">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="om-pf-ic"><UserRound aria-hidden="true" /></span>
                    <div className="min-w-0">
                      <h2 className="om-pf-tt">Osobní údaje</h2>
                      <p className="om-pf-st">Profil a kontaktní informace</p>
                    </div>
                  </div>
                  {!editMode && (
                    <button type="button" className="om-pf-btn om-pf-outline" onClick={() => setEditMode(true)}>
                      Upravit
                    </button>
                  )}
                </div>

                {editMode ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="nickname" className="om-pf-label">Přezdívka</label>
                        <input
                          id="nickname"
                          type="text"
                          className="om-pf-input"
                          value={profile.nickname}
                          onChange={e => setProfile(prev => ({ ...prev, nickname: e.target.value }))}
                          placeholder="Zadej přezdívku"
                        />
                      </div>
                      <div>
                        <label htmlFor="phone" className="om-pf-label">Telefon</label>
                        <input
                          id="phone"
                          type="text"
                          className="om-pf-input"
                          value={profile.phone}
                          onChange={e => setProfile(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="Zadej telefon"
                        />
                      </div>
                      <div>
                        <label htmlFor="first_name" className="om-pf-label">Křestní jméno</label>
                        <input
                          id="first_name"
                          type="text"
                          className="om-pf-input"
                          value={profile.first_name}
                          onChange={e => setProfile(prev => ({ ...prev, first_name: e.target.value }))}
                          placeholder="Zadej křestní jméno"
                        />
                      </div>
                      <div>
                        <label htmlFor="last_name" className="om-pf-label">Příjmení</label>
                        <input
                          id="last_name"
                          type="text"
                          className="om-pf-input"
                          value={profile.last_name}
                          onChange={e => setProfile(prev => ({ ...prev, last_name: e.target.value }))}
                          placeholder="Zadej příjmení"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label htmlFor="address" className="om-pf-label">Doručovací adresa výhry</label>
                        <textarea
                          id="address"
                          className="om-pf-input resize-none"
                          value={profile.address}
                          onChange={e => setProfile(prev => ({ ...prev, address: e.target.value }))}
                          placeholder="Zadej doručovací adresu pro výhry"
                          rows={3}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 pt-5">
                      <button type="button" className="om-pf-btn om-pf-gold" onClick={handleProfileSave} disabled={profileSaving}>
                        {profileSaving
                          ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Ukládám…</>
                          : <><Check className="h-4 w-4" aria-hidden="true" />Uložit změny</>}
                      </button>
                      <button type="button" className="om-pf-btn om-pf-quiet" onClick={() => setEditMode(false)} disabled={profileSaving}>
                        Zrušit
                      </button>
                    </div>
                  </>
                ) : (
                  <div>
                    <div className="om-pf-row">
                      <span>Přezdívka</span>
                      <span>{profile.nickname || <span className="om-pf-empty">Nenastaveno</span>}</span>
                    </div>
                    <div className="om-pf-row">
                      <span>Jméno</span>
                      <span>
                        {(profile.first_name || profile.last_name)
                          ? [profile.first_name, profile.last_name].filter(Boolean).join(' ')
                          : <span className="om-pf-empty">Nenastaveno</span>}
                      </span>
                    </div>
                    <div className="om-pf-row">
                      <span>Telefon</span>
                      <span>{profile.phone || <span className="om-pf-empty">Nenastaveno</span>}</span>
                    </div>
                    {profile.date_of_birth && (
                      <div className="om-pf-row">
                        <span>Datum narození</span>
                        <span>{format(new Date(profile.date_of_birth), 'd. MMMM yyyy', { locale: cs })}</span>
                      </div>
                    )}
                    <div className="om-pf-row om-pf-row-stack">
                      <span>Doručovací adresa</span>
                      <span className="whitespace-pre-wrap">{profile.address || <span className="om-pf-empty">Nenastaveno</span>}</span>
                    </div>
                  </div>
                )}
              </section>

            </div>

            {/* PRAVÝ SLOUPEC */}
            <div className="space-y-5">

              {/* Pozvi přátele */}
              <ReferralSection isLoaded={pageLoaded} />

              <RecommendShopMailtoCard />

              {/* Účet */}
              <section className="om-pf-lc">
                <div className="om-pf-head">
                  <span className="om-pf-ic"><Lock aria-hidden="true" /></span>
                  <div>
                    <h2 className="om-pf-tt">Účet</h2>
                    <p className="om-pf-st">Přihlašovací údaje</p>
                  </div>
                </div>
                <div className="om-pf-row">
                  <span>E-mailová adresa</span>
                  <span className="flex items-center justify-end gap-2 flex-wrap">
                    <span className="break-all">{wallet?.email || user?.email}</span>
                    <span className="om-pf-pill om-pf-pill-ok"><CheckCircle className="h-3 w-3" aria-hidden="true" />Ověřeno</span>
                  </span>
                </div>
                {wallet?.name && (
                  <div className="om-pf-row">
                    <span>Jméno účtu</span>
                    <span>{wallet.name}</span>
                  </div>
                )}
              </section>

              {/* Notifikace */}
              <section className="om-pf-lc">
                <div className="om-pf-head">
                  <span className="om-pf-ic"><Bell aria-hidden="true" /></span>
                  <div>
                    <h2 className="om-pf-tt">Notifikace</h2>
                    <p className="om-pf-st">Zvuky a upozornění</p>
                  </div>
                </div>
                <div className="om-pf-row">
                  <label htmlFor="pf-sound-messages" className="flex flex-col cursor-pointer">
                    <strong className="text-[14px] text-[#17171B]">Zvuk pro zprávy</strong>
                    <span className="text-[12px] text-[#5E5B57]">Při nových zprávách</span>
                  </label>
                  <Switch
                    id="pf-sound-messages"
                    checked={messageSoundEnabled}
                    onCheckedChange={toggleMessageSound}
                    className="om-pf-switch"
                  />
                </div>
                <div className="om-pf-row">
                  <label htmlFor="pf-sound-wins" className="flex flex-col cursor-pointer">
                    <strong className="text-[14px] text-[#17171B]">Zvuk pro výhry</strong>
                    <span className="text-[12px] text-[#5E5B57]">Při nových výhrách</span>
                  </label>
                  <Switch
                    id="pf-sound-wins"
                    checked={winSoundEnabled}
                    onCheckedChange={toggleWinSound}
                    className="om-pf-switch"
                  />
                </div>
                <div className="pt-3 border-t border-[rgba(160,120,50,0.16)]">
                  <p className="om-pf-note mb-3">Otestuj si, jestli ti na tomhle zařízení chodí push notifikace.</p>
                  <button
                    type="button"
                    className="om-pf-btn om-pf-outline w-full"
                    onClick={handleTestNotification}
                    disabled={testingNotification}
                  >
                    <Bell className={`h-4 w-4 ${testingNotification ? 'animate-pulse' : ''}`} aria-hidden="true" />
                    {testingNotification ? 'Odesílám…' : 'Otestovat notifikaci'}
                  </button>
                </div>
              </section>

              {/* Marketingová sdělení */}
              <section className="om-pf-lc">
                <div className="om-pf-head">
                  <span className="om-pf-ic"><Mail aria-hidden="true" /></span>
                  <div>
                    <h2 className="om-pf-tt">Marketingová sdělení</h2>
                    <p className="om-pf-st">E-mailové novinky</p>
                  </div>
                </div>
                <p className="om-pf-note mb-3">
                  Můžeš dostávat informace o nových soutěžích, speciálních akcích a dalších novinkách e-mailem.
                </p>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  {marketingStatus === 'active' ? (
                    <span className="om-pf-pill om-pf-pill-ok"><CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />Marketing: Aktivní</span>
                  ) : marketingStatus === 'revoked' ? (
                    <span className="om-pf-pill om-pf-pill-off"><XCircle className="h-3.5 w-3.5" aria-hidden="true" />Marketing: Odhlášeno</span>
                  ) : marketingStatus === 'none' ? (
                    <span className="om-pf-pill om-pf-pill-neutral"><XCircle className="h-3.5 w-3.5" aria-hidden="true" />Marketing: Nepřihlášeno</span>
                  ) : (
                    <span className="om-pf-pill om-pf-pill-neutral"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Načítám…</span>
                  )}

                  {marketingStatus === 'active' && (
                    <button
                      type="button"
                      className="om-pf-btn om-pf-quiet"
                      onClick={() => {
                        setPendingMarketingAction('unsubscribe');
                        setMarketingDialogOpen(true);
                      }}
                    >
                      Odhlásit
                    </button>
                  )}
                  {(marketingStatus === 'revoked' || marketingStatus === 'none') && (
                    <button
                      type="button"
                      className="om-pf-btn om-pf-black"
                      onClick={() => {
                        setPendingMarketingAction('subscribe');
                        setMarketingDialogOpen(true);
                      }}
                      disabled={marketingSubscribing}
                    >
                      {marketingSubscribing
                        ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Přihlašuji…</>
                        : 'Přihlásit k odběru'}
                    </button>
                  )}
                </div>
              </section>

            </div>
          </div>
        </div>
      </div>

      {/* Premium Top-up Modal */}
      {/* Top-up modal se v nativní aplikaci vůbec nerenderuje — nejde otevřít ani nepřímo. */}
      <Dialog open={showTopUpModal && !isNativeApp()} onOpenChange={setShowTopUpModal}>
        <DialogContent className="max-w-md border-[rgba(194,144,47,0.15)] bg-gradient-to-br from-card via-card to-[rgba(194,144,47,0.04)] backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-xl bg-[rgba(194,144,47,0.15)]">
                <OneMilCoinsIcon size={20} className="h-5 w-5 text-[#C2902F]" />
              </div>
              Dobít MIO
            </DialogTitle>
            <DialogDescription>Vyber balíček nebo zadej vlastní částku.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              {COIN_PACKAGES.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => handlePackageSelect(pkg)}
                  className={`p-5 rounded-xl border-2 text-left transition-all duration-300 hover:scale-[1.01] ${
                    selectedPackage?.id === pkg.id
                      ? 'border-[rgba(194,144,47,0.5)] bg-gradient-to-r from-[rgba(194,144,47,0.12)] via-[rgba(194,144,47,0.08)] to-[rgba(194,144,47,0.04)] shadow-lg shadow-[rgba(194,144,47,0.08)]'
                      : 'border-border/40 hover:border-[rgba(194,144,47,0.25)] bg-muted/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-xl transition-all duration-300 ${selectedPackage?.id === pkg.id ? 'bg-[rgba(194,144,47,0.2)]' : 'bg-muted/30'}`}>
                        <OneMilCoinsIcon size={20} className={`h-5 w-5 transition-colors ${selectedPackage?.id === pkg.id ? 'text-[#C2902F]' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className="font-bold text-lg">
                          {pkg.coins.toLocaleString('cs-CZ')} MIO
                          {pkg.bonus > 0 && (
                            <span className="text-green-500 ml-2 font-semibold">+{pkg.bonus} Bonus</span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">{pkg.price} Kč</p>
                      </div>
                    </div>
                    {selectedPackage?.id === pkg.id && (
                      <Check className="h-6 w-6 text-[#C2902F]" />
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
                placeholder="Zadej částku..."
                min="1"
                value={customAmount}
                onChange={(e) => handleCustomAmountChange(e.target.value)}
                className="mt-2 premium-input bg-muted/20 border-border/40 focus:border-[rgba(194,144,47,0.45)]"
              />
              {customAmount && parseInt(customAmount) > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Dostaneš <span className="text-[#E9B949] font-semibold">{parseInt(customAmount).toLocaleString('cs-CZ')} MIO</span> (bez bonusu)
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
              className="bg-gradient-to-r from-[#C2902F] to-[#E9B949] hover:from-[#E9B949] hover:to-[#C2902F] text-black font-bold transition-all duration-300 hover:scale-[1.02]"
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
              Opravdu chceš změnit nastavení marketingových sdělení? Tuto volbu můžeš kdykoliv změnit.
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
