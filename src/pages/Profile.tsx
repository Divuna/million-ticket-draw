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
import { RefreshCw, GamepadIcon, Bell, Coins, Check, Volume2, VolumeX, User, Camera, Loader2, ChevronDown, Mail, CheckCircle, XCircle, Info, Crown, Sparkles, Wallet, Shield } from 'lucide-react';
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

// Premium VIP Card Component
const VIPCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  delay?: number;
  variant?: 'default' | 'gold' | 'accent';
  glowIntensity?: 'low' | 'medium' | 'high';
  isLoaded?: boolean;
}> = ({ children, className = '', delay = 0, variant = 'default', glowIntensity = 'low', isLoaded = true }) => {
  const glowStyles = {
    low: 'shadow-[0_0_30px_-8px_hsl(var(--border)/0.3)]',
    medium: 'shadow-[0_0_40px_-8px_rgba(255,138,0,0.12)]',
    high: 'shadow-[0_0_60px_-12px_rgba(255,138,0,0.2),0_0_100px_-20px_rgba(255,138,0,0.12)]'
  };

  const variantStyles = {
    default: 'border-border/30 bg-gradient-to-br from-card/95 via-card/90 to-card/80',
    gold: 'border-[rgba(255,138,0,0.2)] bg-gradient-to-br from-[rgba(255,138,0,0.04)] via-card/95 to-[rgba(255,138,0,0.03)]',
    accent: 'border-primary/25 bg-gradient-to-br from-primary/5 via-card/95 to-primary/3'
  };

  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl border backdrop-blur-xl
        transition-all duration-700 ease-out
        hover:border-opacity-60 hover:shadow-xl
        ${variantStyles[variant]}
        ${glowStyles[glowIntensity]}
        ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}
        ${className}
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Shimmer effect overlay */}
      <div 
        className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: 'linear-gradient(105deg, transparent 40%, rgba(255,138,0,0.025) 45%, rgba(255,138,0,0.04) 50%, rgba(255,138,0,0.025) 55%, transparent 60%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s ease-in-out infinite'
        }}
      />
      {children}
    </div>
  );
};

// Floating particles background
const FloatingParticles: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    {[...Array(6)].map((_, i) => (
      <div
        key={i}
        className="absolute w-1 h-1 rounded-full bg-[rgba(255,138,0,0.15)]"
        style={{
          left: `${15 + i * 15}%`,
          top: `${20 + (i % 3) * 25}%`,
          animation: `float ${4 + i * 0.5}s ease-in-out infinite`,
          animationDelay: `${i * 0.3}s`
        }}
      />
    ))}
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
              <Sparkles className="absolute inset-0 m-auto w-5 h-5 text-[#FF8A00] animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark pb-20">
      {/* Custom CSS for animations */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.4; }
          50% { transform: translateY(-20px) rotate(180deg); opacity: 0.8; }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1.05); opacity: 0.8; }
          100% { transform: scale(0.95); opacity: 0.5; }
        }
        @keyframes rotate-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.4; filter: blur(20px); }
          50% { opacity: 0.7; filter: blur(25px); }
        }
        @keyframes coin-shine {
          0% { background-position: -100% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes ambient-drift {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.3; }
          25% { transform: translate(10px, -5px) scale(1.02); opacity: 0.4; }
          50% { transform: translate(-5px, 5px) scale(0.98); opacity: 0.35; }
          75% { transform: translate(-10px, -3px) scale(1.01); opacity: 0.38; }
        }
        @keyframes avatar-ring-glow {
          0%, 100% { 
            box-shadow: 0 0 30px rgba(255,138,0,0.25), 0 0 60px rgba(255,138,0,0.12), inset 0 0 20px rgba(255,138,0,0.08);
          }
          50% {
            box-shadow: 0 0 40px rgba(255,138,0,0.35), 0 0 80px rgba(255,138,0,0.16), inset 0 0 25px rgba(255,138,0,0.12);
          }
        }
        @keyframes hover-shimmer {
          0% { left: -100%; opacity: 0; }
          50% { opacity: 0.6; }
          100% { left: 100%; opacity: 0; }
        }
        .vip-button {
          position: relative;
          overflow: hidden;
        }
        .vip-button::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          transition: left 0.5s ease;
        }
        .vip-button:hover::before {
          left: 100%;
        }
        .premium-input:focus {
          box-shadow: 0 0 0 2px rgba(255,138,0,0.18), 0 0 20px -5px rgba(255,138,0,0.25);
        }
        .vip-header-container {
          position: relative;
        }
        .vip-header-container::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,138,0,0.025) 0%, transparent 40%, hsl(220 80% 45% / 0.025) 100%);
          pointer-events: none;
        }
        .avatar-hover-shimmer::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 50%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,181,71,0.3), transparent);
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        .avatar-hover-shimmer:hover::before {
          animation: hover-shimmer 0.8s ease-out forwards;
          opacity: 1;
        }
      `}</style>

      <Header />
      
      <div className="container mx-auto px-4 py-8 relative">
        {/* Background ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[rgba(255,138,0,0.04)] rounded-full blur-[100px] pointer-events-none" />
        
        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* VIP HEADER SECTION - Premium Luxury Design */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div 
          className={`relative mb-12 transition-all duration-1000 ease-out ${
            pageLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          {/* Full-width premium header container */}
          <div className="vip-header-container relative rounded-3xl overflow-hidden border border-[rgba(255,138,0,0.1)]">
            {/* Multi-layer gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-background via-card/95 to-background" />
            <div className="absolute inset-0 bg-gradient-to-r from-[rgba(255,138,0,0.025)] via-transparent to-primary/[0.03]" />
            
            {/* Animated ambient light orbs - very subtle */}
            <div 
              className="absolute top-0 left-1/4 w-64 h-64 rounded-full pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(255,138,0,0.06) 0%, transparent 70%)',
                animation: 'ambient-drift 12s ease-in-out infinite'
              }}
            />
            <div 
              className="absolute bottom-0 right-1/4 w-48 h-48 rounded-full pointer-events-none"
              style={{
                background: 'radial-gradient(circle, hsl(220 80% 55% / 0.06) 0%, transparent 70%)',
                animation: 'ambient-drift 15s ease-in-out infinite reverse'
              }}
            />
            
            {/* Subtle noise texture overlay */}
            <div 
              className="absolute inset-0 opacity-[0.015] pointer-events-none"
              style={{
                backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")'
              }}
            />
            
            <div className="relative px-6 py-10 md:py-12 flex flex-col items-center">
              {/* Premium Avatar Container - Centered & Larger */}
              <div className="relative group mb-6">
                {/* Outermost soft glow halo */}
                <div 
                  className="absolute -inset-8 rounded-full opacity-40 pointer-events-none"
                  style={{
                    background: 'radial-gradient(circle, rgba(255,138,0,0.2) 0%, rgba(255,138,0,0.08) 40%, transparent 70%)',
                    animation: 'glow-pulse 4s ease-in-out infinite'
                  }}
                />
                
                {/* Animated rotating gold gradient ring */}
                <div 
                  className="absolute -inset-[6px] rounded-full"
                  style={{
                    background: 'conic-gradient(from 0deg, #FFB547, #FF8A00, #e07800, #FF8A00, #FFB547)',
                    animation: 'rotate-slow 12s linear infinite'
                  }}
                />
                
                {/* Inner dark ring to separate gradient from avatar */}
                <div className="absolute -inset-[3px] rounded-full bg-background" />
                
                {/* Glowing ring effect */}
                <div 
                  className="absolute -inset-[3px] rounded-full pointer-events-none"
                  style={{
                    animation: 'avatar-ring-glow 3s ease-in-out infinite'
                  }}
                />
                
                {/* The Avatar itself */}
                <Avatar className="avatar-hover-shimmer relative h-32 w-32 md:h-36 md:w-36 border-2 border-[rgba(255,138,0,0.4)] shadow-2xl overflow-hidden">
                  <AvatarImage src={profile.avatar_url || undefined} alt="Avatar" className="object-cover" />
                  <AvatarFallback className="bg-gradient-to-br from-[rgba(255,138,0,0.15)] via-card to-primary/20 text-4xl font-bold text-[#FF8A00]">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
                
                {/* VIP Crown Badge - Larger & More Prominent */}
                <div 
                  className="absolute -top-1 -right-1 p-2.5 rounded-full bg-gradient-to-br from-[#FFB547] via-[#FF8A00] to-[#e07800] shadow-xl"
                  style={{
                    boxShadow: '0 4px 20px rgba(255,138,0,0.45), 0 0 30px rgba(255,138,0,0.25)'
                  }}
                >
                  <Crown className="w-5 h-5 text-black" />
                </div>
                
                {/* Upload overlay on hover */}
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute inset-0 flex items-center justify-center bg-black/75 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer backdrop-blur-sm border-2 border-[rgba(255,138,0,0.5)]"
                >
                  {avatarUploading ? (
                    <Loader2 className="h-10 w-10 text-[#FF8A00] animate-spin" />
                  ) : (
                    <Camera className="h-10 w-10 text-[#FF8A00]" />
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
              
              {/* VIP Title & Badge - Elegant Typography */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <h1 
                    className="text-4xl md:text-5xl font-bold"
                    style={{
                      background: 'linear-gradient(135deg, #E7EBF0 0%, #FFB547 35%, #FF8A00 60%, #E7EBF0 100%)',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      color: 'transparent',
                      textShadow: '0 2px 30px rgba(255,138,0,0.22)'
                    }}
                  >
                    {profile.nickname || profile.first_name || 'Můj profil'}
                  </h1>
                  
                  {/* VIP Badge */}
                  <div 
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[rgba(255,138,0,0.4)]"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,138,0,0.12) 0%, rgba(255,138,0,0.06) 100%)',
                      boxShadow: '0 0 20px rgba(255,138,0,0.12), inset 0 1px 0 rgba(255,181,71,0.08)'
                    }}
                  >
                    <Sparkles className="w-4 h-4 text-[#FF8A00]" />
                    <span className="text-sm font-bold tracking-wider text-[#FF8A00]">VIP</span>
                  </div>
                </div>
                
                <p className="text-muted-foreground text-base md:text-lg">
                  Kliknutím na avatar změníte obrázek
                </p>
              </div>
            </div>
            
            {/* Bottom gradient fade */}
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background/50 to-transparent pointer-events-none" />
          </div>
        </div>

        <div className="max-w-2xl mx-auto space-y-6 relative">
          
          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* WALLET SECTION - The Crown Jewel */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <VIPCard 
            delay={150} 
            variant="gold" 
            glowIntensity="high" 
            isLoaded={pageLoaded}
            className="relative"
          >
            {/* Floating particles */}
            <FloatingParticles />
            
            {/* Premium corner accents */}
            <div className="absolute top-0 left-0 w-20 h-20 bg-gradient-to-br from-[rgba(255,138,0,0.15)] to-transparent rounded-br-full" />
            <div className="absolute bottom-0 right-0 w-20 h-20 bg-gradient-to-tl from-[rgba(255,138,0,0.08)] to-transparent rounded-tl-full" />
            
            {/* Background glow orbs */}
            <div className="absolute top-1/2 left-1/4 w-32 h-32 bg-[rgba(255,138,0,0.08)] rounded-full blur-3xl" />
            <div className="absolute top-1/4 right-1/4 w-24 h-24 bg-[rgba(255,138,0,0.06)] rounded-full blur-2xl" />
            
            <div className="relative p-8">
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-[rgba(255,138,0,0.3)] rounded-2xl blur-lg" />
                    <div className="relative p-3.5 rounded-2xl bg-gradient-to-br from-[rgba(255,138,0,0.25)] via-[rgba(255,138,0,0.15)] to-[rgba(255,138,0,0.2)] border border-[rgba(255,138,0,0.35)] shadow-inner">
                      <Wallet className="h-6 w-6 text-[#FF8A00]" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-[#FF8A00] to-[#FFB547] bg-clip-text text-transparent">
                      Peněženka
                    </h2>
                    <p className="text-sm text-muted-foreground">Váš MioCoin účet</p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleRefreshBalance} 
                  disabled={refreshing}
                  className="text-muted-foreground hover:text-[#FF8A00] hover:bg-[rgba(255,138,0,0.08)] transition-all duration-300 hover:scale-105"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Aktualizuji...' : 'Aktualizovat'}
                </Button>
              </div>
              
              {/* Main Balance Display - Premium Design */}
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-gradient-to-r from-[rgba(255,138,0,0.08)] via-[rgba(255,138,0,0.04)] to-[rgba(255,138,0,0.08)] rounded-2xl blur-sm" />
                <div className="relative rounded-2xl border border-[rgba(255,138,0,0.15)] bg-gradient-to-br from-[rgba(255,138,0,0.04)] via-transparent to-[rgba(255,138,0,0.03)] p-8 overflow-hidden">
                  {/* Animated shine effect */}
                  <div 
                    className="absolute inset-0 opacity-50"
                    style={{
                      background: 'linear-gradient(105deg, transparent 40%, rgba(255,138,0,0.06) 45%, rgba(255,138,0,0.1) 50%, rgba(255,138,0,0.06) 55%, transparent 60%)',
                      backgroundSize: '200% 100%',
                      animation: 'coin-shine 4s ease-in-out infinite'
                    }}
                  />
                  
                  <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
                    {/* Main Balance */}
                    <div className="flex items-center gap-5">
                      <div className="relative">
                        {/* Coin glow */}
                        <div className="absolute inset-0 bg-[rgba(255,138,0,0.35)] rounded-full blur-xl scale-150" style={{ animation: 'glow-pulse 2s ease-in-out infinite' }} />
                        <div className="relative p-4 rounded-full bg-gradient-to-br from-[#FFB547] via-[#FF8A00] to-[#e07800] shadow-xl shadow-[rgba(255,138,0,0.3)]">
                          <Coins className="h-10 w-10 text-black" />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[rgba(255,138,0,0.75)] uppercase tracking-wider mb-1">MioCoiny</p>
                        <p className="text-5xl lg:text-6xl font-black bg-gradient-to-r from-[#FFB547] via-[#FF8A00] to-[#FFB547] bg-clip-text text-transparent tabular-nums tracking-tight">
                          {animatedBalance.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                        </p>
                      </div>
                    </div>
                    
                    {/* Bonus Balance */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:border-l lg:border-[rgba(255,138,0,0.15)] lg:pl-8">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="absolute inset-0 bg-green-500/30 rounded-full blur-lg" />
                          <div className="relative p-3 rounded-full bg-gradient-to-br from-green-500/30 to-green-600/20 border border-green-500/40">
                            <Coins className="h-6 w-6 text-green-500" />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-medium text-green-500/80 uppercase tracking-wider">Bonusové</p>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-green-500 cursor-help transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs bg-card/95 backdrop-blur-xl border-border/50">
                                  <p className="text-sm">Bonusové MioCoiny získáváte jako odměnu při hraní soutěží. Můžete je převést do hlavní peněženky a použít na otevření tiketů.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <p className="text-3xl font-bold text-green-500 tabular-nums">
                            {animatedBonusBalance.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleTransferBonus}
                        disabled={transferring || (wallet?.bonus_balance_coins ?? 0) === 0}
                        className="bg-gradient-to-r from-green-600 via-green-500 to-green-600 hover:from-green-500 hover:via-green-600 hover:to-green-500 text-white font-semibold shadow-lg shadow-green-500/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-green-500/30 border-0"
                      >
                        {transferring ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        Převést bonusové MioCoiny
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Action Buttons - Premium Style */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  onClick={() => setShowTopUpModal(true)} 
                  className="vip-button flex-1 bg-gradient-to-r from-[#FF8A00] via-[#FFB547] to-[#FF8A00] hover:from-[#FFB547] hover:via-[#FF8A00] hover:to-[#FFB547] text-black font-bold text-lg shadow-xl shadow-[rgba(255,138,0,0.2)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[rgba(255,138,0,0.35)] border-0" 
                  size="lg"
                >
                  <Coins className="h-5 w-5 mr-2" />
                  Dobít MioCoiny
                </Button>
                
                <Button 
                  onClick={() => navigate('/my-contests')} 
                  variant="outline" 
                  className="vip-button flex-1 border-primary/40 hover:border-primary/60 hover:bg-primary/10 text-lg font-semibold transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/10" 
                  size="lg"
                >
                  <GamepadIcon className="h-5 w-5 mr-2" />
                  Moje hry
                </Button>
              </div>

              {/* Bonus Transfer History */}
              <div className="mt-8 pt-6 border-t border-[rgba(255,138,0,0.1)]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Historie převodů</h3>
                  {bonusTransfers.length > 3 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setHistoryExpanded(!historyExpanded)}
                      className="text-xs text-muted-foreground hover:text-[#FF8A00] flex items-center gap-1 transition-all duration-300"
                    >
                      {historyExpanded ? 'Skrýt historii' : 'Zobrazit celou historii'}
                      <ChevronDown 
                        className={`h-4 w-4 transition-transform duration-300 ${historyExpanded ? 'rotate-180' : ''}`} 
                      />
                    </Button>
                  )}
                </div>
                {bonusTransfersLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Načítám...
                  </div>
                ) : bonusTransfers.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Zatím žádné převody bonusových MioCoinů</p>
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
                            <Coins className="h-4 w-4 text-green-500" />
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
          </VIPCard>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* ACCOUNT SECTION - Premium Wallet Style */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <VIPCard 
            delay={250} 
            variant="accent" 
            glowIntensity="medium" 
            isLoaded={pageLoaded}
            className="relative"
          >
            {/* Subtle floating particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-1 h-1 rounded-full bg-primary/20"
                  style={{
                    left: `${20 + i * 20}%`,
                    top: `${25 + (i % 2) * 50}%`,
                    animation: `float ${5 + i * 0.5}s ease-in-out infinite`,
                    animationDelay: `${i * 0.4}s`
                  }}
                />
              ))}
            </div>
            
            {/* Premium corner accents */}
            <div className="absolute top-0 left-0 w-16 h-16 bg-gradient-to-br from-primary/15 to-transparent rounded-br-full" />
            <div className="absolute bottom-0 right-0 w-16 h-16 bg-gradient-to-tl from-primary/10 to-transparent rounded-tl-full" />
            
            {/* Background glow orbs */}
            <div className="absolute top-1/2 left-1/4 w-24 h-24 bg-primary/8 rounded-full blur-2xl" />
            <div className="absolute top-1/4 right-1/4 w-20 h-20 bg-primary/5 rounded-full blur-xl" />
            
            <div className="relative p-8">
              {/* Section Header */}
              <div className="flex items-center gap-5 mb-8">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 rounded-xl blur-lg" />
                  <div className="relative p-3.5 rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 border border-primary/30 shadow-lg shadow-primary/10">
                    <Shield className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">Účet</h2>
                  <p className="text-sm text-muted-foreground/70 mt-0.5">Přihlašovací údaje</p>
                </div>
              </div>
              
              {/* Premium Info Blocks */}
              <div className="space-y-4">
                {/* Email Block */}
                <div className="group relative p-5 rounded-2xl bg-gradient-to-br from-primary/8 via-transparent to-primary/5 border border-primary/15 hover:border-primary/30 transition-all duration-500 hover:shadow-lg hover:shadow-primary/5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="p-2.5 rounded-xl bg-primary/15 border border-primary/20">
                        <Mail className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1.5">
                          E-mailová adresa
                        </p>
                        <p className="text-lg font-semibold text-foreground truncate">
                          {wallet?.email || user?.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/15 border border-green-500/25 shadow-sm shadow-green-500/10">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      <span className="text-xs font-semibold text-green-500">Ověřeno</span>
                    </div>
                  </div>
                </div>
                
                {/* Name Block */}
                {wallet?.name && (
                  <div className="group relative p-5 rounded-2xl bg-gradient-to-br from-primary/8 via-transparent to-primary/5 border border-primary/15 hover:border-primary/30 transition-all duration-500 hover:shadow-lg hover:shadow-primary/5">
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 rounded-xl bg-primary/15 border border-primary/20">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1.5">
                          Jméno účtu
                        </p>
                        <p className="text-lg font-semibold text-foreground truncate">
                          {wallet.name}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </VIPCard>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* PERSONAL DETAILS SECTION - Premium Wallet Style */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <VIPCard 
            delay={350} 
            variant="gold" 
            glowIntensity="medium" 
            isLoaded={pageLoaded}
            className="relative"
          >
            {/* Floating particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-1 h-1 rounded-full bg-[rgba(255,138,0,0.12)]"
                  style={{
                    left: `${10 + i * 18}%`,
                    top: `${15 + (i % 3) * 30}%`,
                    animation: `float ${4.5 + i * 0.4}s ease-in-out infinite`,
                    animationDelay: `${i * 0.25}s`
                  }}
                />
              ))}
            </div>
            
            {/* Premium corner accents */}
            <div className="absolute top-0 left-0 w-20 h-20 bg-gradient-to-br from-[rgba(255,138,0,0.12)] to-transparent rounded-br-full pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-20 h-20 bg-gradient-to-tl from-[rgba(255,138,0,0.08)] to-transparent rounded-tl-full pointer-events-none" />
            
            {/* Background glow orbs */}
            <div className="absolute top-1/3 left-1/3 w-28 h-28 bg-[rgba(255,138,0,0.06)] rounded-full blur-2xl pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-[rgba(255,138,0,0.04)] rounded-full blur-xl pointer-events-none" />
            
            <div className="relative z-10 p-8">
              {/* Section Header */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-5">
                  <div className="relative">
                    <div className="absolute inset-0 bg-[rgba(255,138,0,0.2)] rounded-xl blur-lg pointer-events-none" />
                    <div className="relative p-3.5 rounded-xl bg-gradient-to-br from-[rgba(255,138,0,0.2)] to-[rgba(255,138,0,0.1)] border border-[rgba(255,138,0,0.3)] shadow-lg shadow-[rgba(255,138,0,0.08)]">
                      <User className="h-6 w-6 text-[#FF8A00]" />
                    </div>
                  </div>
                  <div>
                    <h2 
                      className="text-2xl font-bold"
                      style={{
                        background: 'linear-gradient(135deg, #E7EBF0 0%, #FFB547 50%, #FF8A00 100%)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        color: 'transparent'
                      }}
                    >
                      Osobní údaje
                    </h2>
                    <p className="text-sm text-muted-foreground/70 mt-0.5">Profil a kontaktní informace</p>
                  </div>
                </div>
                {!editMode && (
                  <Button 
                    variant="outline" 
                    size="default" 
                    type="button"
                    onClick={() => setEditMode(true)}
                    className="relative z-20 vip-button border-[rgba(255,138,0,0.3)] bg-[rgba(255,138,0,0.04)] hover:bg-[rgba(255,138,0,0.08)] hover:border-[rgba(255,138,0,0.5)] text-[#FF8A00] hover:text-[#FFB547] transition-all duration-300 font-semibold px-6 rounded-xl hover:shadow-lg hover:shadow-[rgba(255,138,0,0.08)] hover:scale-[1.02]"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
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
                        <Sparkles className="h-3 w-3" />
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
                        <Sparkles className="h-3 w-3" />
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
                        <Sparkles className="h-3 w-3" />
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
                        <Sparkles className="h-3 w-3" />
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
                        <Sparkles className="h-3 w-3" />
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
                      className="vip-button bg-gradient-to-r from-[#FF8A00] via-[#FFB547] to-[#FF8A00] hover:from-[#FFB547] hover:via-[#FF8A00] hover:to-[#FFB547] text-black font-bold px-8 h-12 rounded-xl transition-all duration-300 shadow-lg shadow-[rgba(255,138,0,0.2)] hover:shadow-[rgba(255,138,0,0.35)] hover:scale-[1.02]"
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
                          <Sparkles className="h-3 w-3" />
                          Přezdívka
                        </p>
                        <p className="text-xl text-foreground font-semibold tracking-tight">
                          {profile.nickname || <span className="text-muted-foreground/40 font-normal italic">Nenastaveno</span>}
                        </p>
                      </div>
                      
                      {/* Full Name Row */}
                      <div className="group p-4 rounded-xl bg-gradient-to-r from-[rgba(255,138,0,0.06)] via-transparent to-[rgba(255,138,0,0.04)] border border-[rgba(255,138,0,0.12)] hover:border-[rgba(255,138,0,0.25)] transition-all duration-300 hover:shadow-lg hover:shadow-[rgba(255,138,0,0.04)]">
                        <p className="text-xs font-semibold text-[rgba(255,138,0,0.55)] uppercase tracking-wider mb-2 flex items-center gap-2">
                          <User className="h-3 w-3" />
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
                          <User className="w-12 h-12 text-[rgba(255,138,0,0.4)]" />
                        </div>
                      </div>
                      <p className="text-xl text-foreground font-semibold mb-2">Zatím nemáte vyplněny osobní údaje</p>
                      <p className="text-sm text-muted-foreground/60">Klikněte na „Upravit" pro jejich zadání</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </VIPCard>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* NOTIFICATIONS SECTION - Premium Wallet Style */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <VIPCard 
            delay={450} 
            variant="accent" 
            glowIntensity="medium" 
            isLoaded={pageLoaded}
            className="relative"
          >
            {/* Subtle floating particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-1 h-1 rounded-full bg-primary/20"
                  style={{
                    left: `${25 + i * 25}%`,
                    top: `${30 + (i % 2) * 40}%`,
                    animation: `float ${5.5 + i * 0.5}s ease-in-out infinite`,
                    animationDelay: `${i * 0.3}s`
                  }}
                />
              ))}
            </div>
            
            {/* Premium corner accents */}
            <div className="absolute top-0 left-0 w-16 h-16 bg-gradient-to-br from-primary/15 to-transparent rounded-br-full" />
            <div className="absolute bottom-0 right-0 w-16 h-16 bg-gradient-to-tl from-primary/10 to-transparent rounded-tl-full" />
            
            {/* Background glow */}
            <div className="absolute top-1/2 right-1/4 w-24 h-24 bg-primary/8 rounded-full blur-2xl" />
            
            <div className="relative p-8">
              {/* Section Header */}
              <div className="flex items-center gap-5 mb-8">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 rounded-xl blur-lg" />
                  <div className="relative p-3.5 rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 border border-primary/30 shadow-lg shadow-primary/10">
                    <Bell className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">Notifikace</h2>
                  <p className="text-sm text-muted-foreground/70 mt-0.5">Zvuky a upozornění</p>
                </div>
              </div>
              
              {/* Message sound toggle */}
              <div className="flex items-center justify-between mb-4 p-5 rounded-xl bg-gradient-to-r from-primary/10 via-transparent to-primary/5 border border-primary/20 hover:border-primary/40 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
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
              <div className="flex items-center justify-between mb-6 p-5 rounded-xl bg-gradient-to-r from-[rgba(255,138,0,0.08)] via-transparent to-[rgba(255,138,0,0.04)] border border-[rgba(255,138,0,0.2)] hover:border-[rgba(255,138,0,0.38)] transition-all duration-300 hover:shadow-lg hover:shadow-[rgba(255,138,0,0.08)]">
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
              <div className="mt-8 pt-6 border-t border-primary/10">
                <p className="text-sm text-muted-foreground/70 mb-4">Otestujte si funkčnost push notifikací na vašem zařízení.</p>
                <Button 
                  onClick={handleTestNotification} 
                  variant="outline" 
                  disabled={testingNotification}
                  className="vip-button w-full sm:w-auto border-primary/35 bg-primary/5 hover:border-primary/55 hover:bg-primary/15 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/10 font-semibold"
                >
                  <Bell className={`h-4 w-4 mr-2 ${testingNotification ? 'animate-pulse' : ''}`} />
                  {testingNotification ? 'Odesílám...' : 'Otestovat notifikaci'}
                </Button>
              </div>
            </div>
          </VIPCard>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* MARKETING SECTION - Premium Wallet Style */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <VIPCard 
            delay={550} 
            variant="gold" 
            glowIntensity="low" 
            isLoaded={pageLoaded}
            className="relative"
          >
            {/* Subtle floating particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-1 h-1 rounded-full bg-[rgba(255,138,0,0.12)]"
                  style={{
                    left: `${15 + i * 30}%`,
                    top: `${20 + (i % 2) * 55}%`,
                    animation: `float ${6 + i * 0.4}s ease-in-out infinite`,
                    animationDelay: `${i * 0.35}s`
                  }}
                />
              ))}
            </div>
            
            {/* Premium corner accents */}
            <div className="absolute top-0 left-0 w-14 h-14 bg-gradient-to-br from-[rgba(255,138,0,0.1)] to-transparent rounded-br-full" />
            <div className="absolute bottom-0 right-0 w-14 h-14 bg-gradient-to-tl from-[rgba(255,138,0,0.06)] to-transparent rounded-tl-full" />
            
            {/* Background glow */}
            <div className="absolute top-1/3 left-1/3 w-20 h-20 bg-[rgba(255,138,0,0.05)] rounded-full blur-xl" />
            
            <div className="relative p-8">
              {/* Section Header */}
              <div className="flex items-center gap-5 mb-8">
                <div className="relative">
                  <div className="absolute inset-0 bg-[rgba(255,138,0,0.15)] rounded-xl blur-lg" />
                  <div className="relative p-3.5 rounded-xl bg-gradient-to-br from-[rgba(255,138,0,0.15)] to-[rgba(255,138,0,0.08)] border border-[rgba(255,138,0,0.25)] shadow-lg shadow-[rgba(255,138,0,0.08)]">
                    <Mail className="h-6 w-6 text-[#FF8A00]" />
                  </div>
                </div>
                <div>
                  <h2 
                    className="text-2xl font-bold"
                    style={{
                      background: 'linear-gradient(135deg, #E7EBF0 0%, #FFB547 50%, #FF8A00 100%)',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      color: 'transparent'
                    }}
                  >
                    Marketingová sdělení
                  </h2>
                  <p className="text-sm text-muted-foreground/70 mt-0.5">E-mailové novinky</p>
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
                      className="vip-button w-full sm:w-auto border-destructive/35 bg-destructive/5 hover:border-destructive/55 hover:bg-destructive/15 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-destructive/10 font-semibold"
                      onClick={() => {
                        setPendingMarketingAction('unsubscribe');
                        setMarketingDialogOpen(true);
                      }}
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Odhlásit marketing
                    </Button>
                  </div>
                )}

                {(marketingStatus === 'revoked' || marketingStatus === 'none') && (
                  <div className="pt-4 border-t border-[rgba(255,138,0,0.08)]">
                    <p className="text-sm text-muted-foreground/60 mb-4">Chcete-li dostávat marketingová sdělení, můžete se přihlásit.</p>
                    <Button 
                      className="vip-button w-full sm:w-auto bg-gradient-to-r from-[#FF8A00] via-[#FFB547] to-[#FF8A00] hover:from-[#FFB547] hover:via-[#FF8A00] hover:to-[#FFB547] text-black font-bold transition-all duration-300 hover:scale-[1.02] shadow-lg shadow-[rgba(255,138,0,0.2)] hover:shadow-[rgba(255,138,0,0.35)]"
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
                          <Mail className="h-4 w-4 mr-2" />
                          Přihlásit marketing
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </VIPCard>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* REFERRAL SECTION - Invite Friends */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <ReferralSection isLoaded={pageLoaded} />
        </div>
      </div>

      {/* Premium Top-up Modal */}
      <Dialog open={showTopUpModal} onOpenChange={setShowTopUpModal}>
        <DialogContent className="max-w-md border-[rgba(255,138,0,0.15)] bg-gradient-to-br from-card via-card to-[rgba(255,138,0,0.04)] backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-xl bg-[rgba(255,138,0,0.15)]">
                <Coins className="h-5 w-5 text-[#FF8A00]" />
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
                        <Coins className={`h-5 w-5 transition-colors ${selectedPackage?.id === pkg.id ? 'text-[#FF8A00]' : 'text-muted-foreground'}`} />
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
              className="vip-button bg-gradient-to-r from-[#FF8A00] to-[#FFB547] hover:from-[#FFB547] hover:to-[#FF8A00] text-black font-bold transition-all duration-300 hover:scale-[1.02]"
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
              className="vip-button bg-gradient-to-r from-primary to-primary/80 transition-all duration-300 hover:scale-[1.02]"
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
