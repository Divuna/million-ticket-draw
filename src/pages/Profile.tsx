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
import { RefreshCw, GamepadIcon, Bell, Coins, Check, Volume2, VolumeX, User, Camera, Loader2, ChevronDown, Mail, CheckCircle, XCircle, Info, Crown, Sparkles, Wallet, Shield } from 'lucide-react';
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

// Unified Premium Section Component
const PremiumSection: React.FC<{
  children: React.ReactNode;
  className?: string;
  delay?: number;
  variant?: 'default' | 'gold' | 'accent';
  isLoaded?: boolean;
  size?: 'normal' | 'large';
}> = ({ children, className = '', delay = 0, variant = 'default', isLoaded = true, size = 'normal' }) => {
  const variantStyles = {
    default: 'border-border/20 bg-gradient-to-br from-[hsl(222_47%_8%)] via-[hsl(222_47%_6%)] to-[hsl(222_47%_7%)]',
    gold: 'border-[hsl(43_70%_40%/0.3)] bg-gradient-to-br from-[hsl(43_50%_8%)] via-[hsl(222_47%_6%)] to-[hsl(43_40%_6%)]',
    accent: 'border-primary/20 bg-gradient-to-br from-primary/5 via-[hsl(222_47%_6%)] to-primary/3'
  };

  const glowStyles = {
    default: '',
    gold: 'shadow-[0_0_80px_-20px_hsl(43_90%_50%/0.2),inset_0_1px_0_hsl(43_90%_60%/0.1)]',
    accent: 'shadow-[0_0_40px_-10px_hsl(var(--primary)/0.15)]'
  };

  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl border backdrop-blur-md
        transition-all duration-700 ease-out
        ${variantStyles[variant]}
        ${glowStyles[variant]}
        ${size === 'large' ? 'p-8' : 'p-6'}
        ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}
        group
        ${className}
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Subtle inner glow on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-br from-white/[0.02] to-transparent" />
      
      {/* Shimmer effect on hover */}
      <div 
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
        style={{
          background: 'linear-gradient(105deg, transparent 40%, hsl(43 90% 55% / 0.02) 45%, hsl(43 90% 55% / 0.04) 50%, hsl(43 90% 55% / 0.02) 55%, transparent 60%)',
          backgroundSize: '200% 100%',
          animation: 'profile-shimmer 3s ease-in-out infinite'
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
};

// Section Header Component for consistency
const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  variant?: 'default' | 'gold';
  action?: React.ReactNode;
}> = ({ icon, title, subtitle, variant = 'default', action }) => (
  <div className="flex items-center justify-between mb-6">
    <div className="flex items-center gap-4">
      <div className={`
        p-3 rounded-xl border transition-all duration-300
        ${variant === 'gold' 
          ? 'bg-gradient-to-br from-[hsl(43_70%_25%)] to-[hsl(43_60%_15%)] border-[hsl(43_70%_40%/0.4)] shadow-[0_0_20px_-5px_hsl(43_90%_50%/0.3)]' 
          : 'bg-gradient-to-br from-primary/20 to-primary/5 border-primary/20'
        }
      `}>
        {icon}
      </div>
      <div>
        <h2 className={`text-xl font-bold ${variant === 'gold' ? 'text-[hsl(43_80%_60%)]' : 'text-foreground'}`}>
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
    {action}
  </div>
);

// Info Field Component
const InfoField: React.FC<{
  label: string;
  value: string;
  colSpan?: boolean;
}> = ({ label, value, colSpan = false }) => (
  <div className={`
    p-4 rounded-xl bg-gradient-to-br from-[hsl(222_47%_10%)] to-[hsl(222_47%_8%)] 
    border border-border/20 
    hover:border-primary/20 hover:bg-[hsl(222_47%_10%)]
    transition-all duration-300
    ${colSpan ? 'md:col-span-2' : ''}
  `}>
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
    <p className="text-foreground mt-1.5 font-medium">{value}</p>
  </div>
);

// Floating Gold Particles
const GoldParticles: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    {[...Array(8)].map((_, i) => (
      <div
        key={i}
        className="absolute rounded-full bg-[hsl(43_90%_55%/0.15)]"
        style={{
          width: `${2 + (i % 3)}px`,
          height: `${2 + (i % 3)}px`,
          left: `${10 + i * 12}%`,
          top: `${15 + (i % 4) * 20}%`,
          animation: `profile-float ${5 + i * 0.4}s ease-in-out infinite`,
          animationDelay: `${i * 0.2}s`
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
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-[hsl(43_70%_50%/0.3)] border-t-[hsl(43_70%_50%)] animate-spin" />
              <Sparkles className="absolute inset-0 m-auto w-5 h-5 text-[hsl(43_70%_50%)] animate-pulse" />
            </div>
          </div>
        </div>
        {isAdmin ? <AdminMenu /> : <BottomNavigation />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark pb-24">
      {/* Full-page Premium CSS */}
      <style>{`
        @keyframes profile-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes profile-float {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.3; }
          50% { transform: translateY(-15px) scale(1.1); opacity: 0.6; }
        }
        @keyframes profile-pulse-ring {
          0%, 100% { transform: scale(0.98); opacity: 0.4; }
          50% { transform: scale(1.02); opacity: 0.7; }
        }
        @keyframes profile-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes profile-glow {
          0%, 100% { opacity: 0.3; filter: blur(30px); }
          50% { opacity: 0.6; filter: blur(40px); }
        }
        @keyframes profile-coin-shine {
          0% { background-position: -100% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes profile-border-flow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .profile-premium-btn {
          position: relative;
          overflow: hidden;
        }
        .profile-premium-btn::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
          transition: left 0.5s ease;
        }
        .profile-premium-btn:hover::after {
          left: 100%;
        }
        .profile-premium-input:focus {
          box-shadow: 0 0 0 2px hsl(43 70% 50% / 0.15), 0 0 30px -10px hsl(43 70% 50% / 0.2);
        }
      `}</style>

      <Header />
      
      {/* Full-page premium background */}
      <div className="relative">
        {/* Ambient background gradients */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div 
            className="absolute top-0 left-1/4 w-[800px] h-[600px] rounded-full"
            style={{
              background: 'radial-gradient(ellipse, hsl(43 50% 50% / 0.04) 0%, transparent 60%)',
              animation: 'profile-glow 8s ease-in-out infinite'
            }}
          />
          <div 
            className="absolute bottom-1/4 right-1/4 w-[600px] h-[400px] rounded-full"
            style={{
              background: 'radial-gradient(ellipse, hsl(220 60% 50% / 0.03) 0%, transparent 60%)',
              animation: 'profile-glow 10s ease-in-out infinite 2s'
            }}
          />
        </div>

        <div className="container mx-auto px-4 py-8 relative z-10">
          
          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* PROFILE HEADER - VIP Avatar Section */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <div 
            className={`relative mb-10 transition-all duration-1000 ease-out ${
              pageLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            <PremiumSection variant="gold" size="large" delay={0} isLoaded={pageLoaded} className="relative">
              <GoldParticles />
              
              {/* Corner accents */}
              <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-[hsl(43_70%_50%/0.1)] to-transparent rounded-br-full pointer-events-none" />
              <div className="absolute bottom-0 right-0 w-24 h-24 bg-gradient-to-tl from-[hsl(43_70%_50%/0.05)] to-transparent rounded-tl-full pointer-events-none" />
              
              <div className="relative flex flex-col md:flex-row items-center gap-8">
                {/* VIP Avatar */}
                <div className="relative group">
                  {/* Rotating gradient ring */}
                  <div 
                    className="absolute -inset-3 rounded-full opacity-50"
                    style={{
                      background: 'conic-gradient(from 0deg, hsl(43 80% 55% / 0.5), hsl(43 60% 35% / 0.2), hsl(43 80% 55% / 0.5), hsl(220 60% 45% / 0.15), hsl(43 80% 55% / 0.5))',
                      animation: 'profile-rotate 10s linear infinite'
                    }}
                  />
                  {/* Glow backdrop */}
                  <div 
                    className="absolute -inset-2 rounded-full bg-[hsl(43_70%_50%/0.25)] blur-xl"
                    style={{ animation: 'profile-pulse-ring 3s ease-in-out infinite' }}
                  />
                  {/* Gold border ring */}
                  <div 
                    className="absolute -inset-0.5 rounded-full"
                    style={{
                      background: 'linear-gradient(135deg, hsl(43 80% 60%), hsl(43 70% 40%), hsl(43 80% 55%))',
                      padding: '2px'
                    }}
                  >
                    <div className="w-full h-full rounded-full bg-background" />
                  </div>
                  
                  <Avatar className="relative h-28 w-28 border-2 border-[hsl(43_70%_50%/0.4)] shadow-xl shadow-[hsl(43_70%_50%/0.15)]">
                    <AvatarImage src={profile.avatar_url || undefined} alt="Avatar" className="object-cover" />
                    <AvatarFallback className="bg-gradient-to-br from-[hsl(43_70%_20%)] via-[hsl(222_47%_10%)] to-[hsl(43_50%_15%)] text-3xl font-bold text-[hsl(43_70%_55%)]">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                  
                  {/* VIP Crown Badge */}
                  <div className="absolute -top-1 -right-1 p-2 rounded-full bg-gradient-to-br from-[hsl(43_80%_55%)] to-[hsl(43_70%_40%)] shadow-lg shadow-[hsl(43_70%_50%/0.4)] border border-[hsl(43_90%_70%/0.3)]">
                    <Crown className="w-4 h-4 text-[hsl(222_47%_8%)]" />
                  </div>
                  
                  {/* Upload overlay */}
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="absolute inset-0 flex items-center justify-center bg-[hsl(222_47%_5%/0.85)] rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer backdrop-blur-sm"
                  >
                    {avatarUploading ? (
                      <Loader2 className="h-8 w-8 text-[hsl(43_70%_55%)] animate-spin" />
                    ) : (
                      <Camera className="h-8 w-8 text-[hsl(43_70%_55%)]" />
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
                
                {/* VIP Info */}
                <div className="text-center md:text-left flex-1">
                  <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                    <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[hsl(43_90%_70%)] via-[hsl(43_80%_55%)] to-[hsl(43_70%_45%)] bg-clip-text text-transparent">
                      Můj profil
                    </h1>
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-[hsl(43_70%_50%/0.2)] to-[hsl(43_60%_40%/0.1)] border border-[hsl(43_70%_50%/0.3)]">
                      <Sparkles className="w-3.5 h-3.5 text-[hsl(43_70%_55%)]" />
                      <span className="text-sm font-semibold text-[hsl(43_70%_55%)]">VIP</span>
                    </div>
                  </div>
                  <p className="text-muted-foreground">Kliknutím na avatar změníte obrázek</p>
                </div>
              </div>
            </PremiumSection>
          </div>

          <div className="max-w-2xl mx-auto space-y-6">
            
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* WALLET SECTION - Primary, Most Dominant */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <PremiumSection variant="gold" size="large" delay={100} isLoaded={pageLoaded}>
              <GoldParticles />
              
              {/* Extra glow orbs for wallet */}
              <div className="absolute top-1/2 left-1/4 w-40 h-40 bg-[hsl(43_70%_50%/0.08)] rounded-full blur-3xl pointer-events-none" />
              <div className="absolute top-1/3 right-1/4 w-32 h-32 bg-[hsl(43_60%_45%/0.06)] rounded-full blur-2xl pointer-events-none" />
              
              <SectionHeader
                icon={<Wallet className="h-6 w-6 text-[hsl(43_80%_60%)]" />}
                title="Peněženka"
                subtitle="Váš MioCoin účet"
                variant="gold"
                action={
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleRefreshBalance} 
                    disabled={refreshing}
                    className="text-muted-foreground hover:text-[hsl(43_70%_55%)] hover:bg-[hsl(43_70%_50%/0.1)] transition-all duration-300 hover:scale-105"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                    {refreshing ? 'Aktualizuji...' : 'Aktualizovat'}
                  </Button>
                }
              />
              
              {/* Main Balance Display */}
              <div className="relative mb-8">
                <div className="rounded-2xl border border-[hsl(43_70%_50%/0.2)] bg-gradient-to-br from-[hsl(43_50%_10%)] via-[hsl(222_47%_7%)] to-[hsl(43_40%_8%)] p-8 overflow-hidden">
                  {/* Animated shine */}
                  <div 
                    className="absolute inset-0 opacity-40 pointer-events-none"
                    style={{
                      background: 'linear-gradient(105deg, transparent 40%, hsl(43 90% 55% / 0.06) 45%, hsl(43 90% 55% / 0.1) 50%, hsl(43 90% 55% / 0.06) 55%, transparent 60%)',
                      backgroundSize: '200% 100%',
                      animation: 'profile-coin-shine 5s ease-in-out infinite'
                    }}
                  />
                  
                  <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
                    {/* Main Balance */}
                    <div className="flex items-center gap-5">
                      <div className="relative">
                        <div 
                          className="absolute inset-0 bg-[hsl(43_70%_50%/0.4)] rounded-full blur-xl scale-150" 
                          style={{ animation: 'profile-pulse-ring 2.5s ease-in-out infinite' }} 
                        />
                        <div className="relative p-4 rounded-full bg-gradient-to-br from-[hsl(43_80%_55%)] via-[hsl(43_70%_50%)] to-[hsl(43_60%_40%)] shadow-xl shadow-[hsl(43_70%_50%/0.3)]">
                          <Coins className="h-10 w-10 text-[hsl(222_47%_8%)]" />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[hsl(43_70%_55%/0.8)] uppercase tracking-wider mb-1">MioCoiny</p>
                        <p className="text-5xl lg:text-6xl font-black bg-gradient-to-r from-[hsl(43_90%_70%)] via-[hsl(43_80%_55%)] to-[hsl(43_70%_50%)] bg-clip-text text-transparent tabular-nums tracking-tight">
                          {animatedBalance.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                        </p>
                      </div>
                    </div>
                    
                    {/* Bonus Balance */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:border-l lg:border-[hsl(43_70%_50%/0.2)] lg:pl-8">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="absolute inset-0 bg-[hsl(142_70%_45%/0.25)] rounded-full blur-lg" />
                          <div className="relative p-3 rounded-full bg-gradient-to-br from-[hsl(142_70%_45%/0.3)] to-[hsl(142_60%_35%/0.2)] border border-[hsl(142_70%_45%/0.4)]">
                            <Coins className="h-6 w-6 text-[hsl(142_70%_50%)]" />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-medium text-[hsl(142_70%_50%/0.8)] uppercase tracking-wider">Bonusové</p>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-[hsl(142_70%_50%)] cursor-help transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs bg-[hsl(222_47%_10%/0.95)] backdrop-blur-xl border-border/40">
                                  <p className="text-sm">Bonusové MioCoiny z vyhrané soutěže lze převést do hlavní peněženky.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <p className="text-3xl lg:text-4xl font-bold text-[hsl(142_70%_50%)] tabular-nums">
                            {animatedBonusBalance.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                          </p>
                        </div>
                      </div>
                      
                      {(wallet?.bonus_balance_coins ?? 0) > 0 && (
                        <Button 
                          onClick={handleTransferBonus} 
                          disabled={transferring}
                          size="sm"
                          className="profile-premium-btn bg-gradient-to-r from-[hsl(142_60%_40%)] to-[hsl(142_50%_35%)] hover:from-[hsl(142_65%_45%)] hover:to-[hsl(142_55%_40%)] text-white border-0 transition-all duration-300 hover:scale-[1.02] shadow-lg shadow-[hsl(142_70%_45%/0.2)]"
                        >
                          {transferring ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                          )}
                          Převést
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex flex-wrap gap-4 mb-6">
                <Button 
                  onClick={() => setShowTopUpModal(true)}
                  className="profile-premium-btn flex-1 sm:flex-none bg-gradient-to-r from-[hsl(43_80%_50%)] to-[hsl(43_70%_40%)] hover:from-[hsl(43_85%_55%)] hover:to-[hsl(43_75%_45%)] text-[hsl(222_47%_8%)] font-bold text-base py-6 transition-all duration-300 hover:scale-[1.02] shadow-lg shadow-[hsl(43_70%_50%/0.25)]"
                >
                  <Coins className="h-5 w-5 mr-2" />
                  Dobít MioCoiny
                </Button>
                <Link to="/moje-hry" className="flex-1 sm:flex-none">
                  <Button 
                    variant="outline"
                    className="w-full border-border/30 hover:border-primary/40 hover:bg-primary/10 py-6 transition-all duration-300 hover:scale-[1.02]"
                  >
                    <GamepadIcon className="h-5 w-5 mr-2" />
                    Moje hry
                  </Button>
                </Link>
              </div>
              
              {/* Transfer History */}
              <div>
                <button 
                  onClick={() => setHistoryExpanded(!historyExpanded)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 group"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${historyExpanded ? 'rotate-180' : ''}`} />
                  <span>Historie převodů bonusových MioCoinů</span>
                  {bonusTransfers.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[hsl(142_70%_45%/0.15)] text-[hsl(142_70%_50%)] text-xs font-semibold">
                      {bonusTransfers.length}
                    </span>
                  )}
                </button>
                
                {historyExpanded && (
                  <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                    {bonusTransfersLoading ? (
                      <div className="flex items-center gap-2 py-4 justify-center">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Načítám...</span>
                      </div>
                    ) : bonusTransfers.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">Zatím žádné převody.</p>
                    ) : bonusTransfers.map((transfer, index) => (
                      <div 
                        key={transfer.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[hsl(142_50%_15%/0.15)] via-transparent to-[hsl(142_50%_15%/0.1)] border border-[hsl(142_70%_45%/0.15)] hover:border-[hsl(142_70%_45%/0.25)] transition-all duration-300"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-lg bg-[hsl(142_70%_45%/0.15)]">
                            <Coins className="h-4 w-4 text-[hsl(142_70%_50%)]" />
                          </div>
                          <span className="text-sm text-foreground">Převod bonusových MioCoinů</span>
                        </div>
                        <div className="flex items-center gap-4 pl-8 sm:pl-0">
                          <span className="text-sm font-bold text-[hsl(142_70%_50%)]">+{transfer.amount} MioCoinů</span>
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
            </PremiumSection>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* ACCOUNT SECTION - Secondary */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <PremiumSection delay={200} isLoaded={pageLoaded}>
              <SectionHeader
                icon={<Shield className="h-5 w-5 text-primary" />}
                title="Účet"
                subtitle="Přihlašovací údaje"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoField label="E-mail" value={wallet?.email || user?.email || ''} />
                {wallet?.name && (
                  <InfoField label="Jméno" value={wallet.name} />
                )}
              </div>
            </PremiumSection>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* PERSONAL DETAILS SECTION - Secondary */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <PremiumSection delay={300} isLoaded={pageLoaded}>
              <SectionHeader
                icon={<User className="h-5 w-5 text-primary" />}
                title="Osobní údaje"
                subtitle="Profil a kontakt"
                action={
                  !editMode && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setEditMode(true)}
                      className="border-primary/30 hover:border-primary/50 hover:bg-primary/10 transition-all duration-300 hover:scale-[1.02]"
                    >
                      Upravit profil
                    </Button>
                  )
                }
              />
              
              {editMode ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="space-y-2">
                      <Label htmlFor="nickname" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Přezdívka</Label>
                      <Input 
                        id="nickname" 
                        type="text" 
                        value={profile.nickname} 
                        onChange={e => setProfile(prev => ({ ...prev, nickname: e.target.value }))} 
                        placeholder="Zadejte přezdívku"
                        className="profile-premium-input bg-[hsl(222_47%_10%)] border-border/30 focus:border-[hsl(43_70%_50%/0.5)] transition-all duration-300"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Telefon</Label>
                      <Input 
                        id="phone" 
                        type="text" 
                        value={profile.phone} 
                        onChange={e => setProfile(prev => ({ ...prev, phone: e.target.value }))} 
                        placeholder="Zadejte telefon"
                        className="profile-premium-input bg-[hsl(222_47%_10%)] border-border/30 focus:border-[hsl(43_70%_50%/0.5)] transition-all duration-300"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="first_name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Křestní jméno</Label>
                      <Input 
                        id="first_name" 
                        type="text" 
                        value={profile.first_name} 
                        onChange={e => setProfile(prev => ({ ...prev, first_name: e.target.value }))} 
                        placeholder="Zadejte křestní jméno"
                        className="profile-premium-input bg-[hsl(222_47%_10%)] border-border/30 focus:border-[hsl(43_70%_50%/0.5)] transition-all duration-300"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="last_name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Příjmení</Label>
                      <Input 
                        id="last_name" 
                        type="text" 
                        value={profile.last_name} 
                        onChange={e => setProfile(prev => ({ ...prev, last_name: e.target.value }))} 
                        placeholder="Zadejte příjmení"
                        className="profile-premium-input bg-[hsl(222_47%_10%)] border-border/30 focus:border-[hsl(43_70%_50%/0.5)] transition-all duration-300"
                      />
                    </div>
                    
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="address" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Doručovací adresa výhry</Label>
                      <Textarea 
                        id="address" 
                        value={profile.address} 
                        onChange={e => setProfile(prev => ({ ...prev, address: e.target.value }))} 
                        placeholder="Zadejte doručovací adresu pro výhry" 
                        rows={3}
                        className="profile-premium-input bg-[hsl(222_47%_10%)] border-border/30 focus:border-[hsl(43_70%_50%/0.5)] transition-all duration-300"
                      />
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <Button 
                      onClick={handleProfileSave} 
                      disabled={profileSaving}
                      className="profile-premium-btn bg-gradient-to-r from-[hsl(43_80%_50%)] to-[hsl(43_70%_40%)] hover:from-[hsl(43_85%_55%)] hover:to-[hsl(43_75%_45%)] text-[hsl(222_47%_8%)] font-semibold transition-all duration-300 hover:scale-[1.02]"
                    >
                      {profileSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Ukládám...
                        </>
                      ) : 'Uložit profil'}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setEditMode(false)}
                      disabled={profileSaving}
                      className="transition-all duration-300 hover:scale-[1.02]"
                    >
                      Zrušit
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  {(profile.nickname || profile.phone || profile.first_name || profile.last_name || profile.address) ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {profile.nickname && <InfoField label="Přezdívka" value={profile.nickname} />}
                      {profile.phone && <InfoField label="Telefon" value={profile.phone} />}
                      {(profile.first_name || profile.last_name) && (
                        <InfoField label="Jméno" value={[profile.first_name, profile.last_name].filter(Boolean).join(' ')} />
                      )}
                      {profile.address && <InfoField label="Doručovací adresa" value={profile.address} colSpan />}
                      <InfoField 
                        label="Datum narození" 
                        value={profile.date_of_birth 
                          ? format(new Date(profile.date_of_birth), 'dd.MM.yyyy', { locale: cs })
                          : 'Neuvedeno'} 
                      />
                    </div>
                  ) : (
                    <div className="text-center py-10 px-4 rounded-2xl bg-gradient-to-br from-[hsl(222_47%_10%)] to-transparent border border-dashed border-border/30">
                      <User className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
                      <p className="text-muted-foreground font-medium">Zatím nemáte vyplněny osobní údaje.</p>
                      <p className="text-sm mt-1 text-muted-foreground/70">Klikněte na "Upravit profil" pro jejich zadání.</p>
                    </div>
                  )}
                </div>
              )}
            </PremiumSection>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* NOTIFICATIONS SECTION - Tertiary */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <PremiumSection delay={400} isLoaded={pageLoaded}>
              <SectionHeader
                icon={<Bell className="h-5 w-5 text-primary" />}
                title="Notifikace"
                subtitle="Zvuky a upozornění"
              />
              
              {/* Message sound toggle */}
              <div className="flex items-center justify-between mb-4 p-4 rounded-xl bg-gradient-to-r from-[hsl(222_47%_10%)] via-transparent to-[hsl(222_47%_9%)] border border-border/20 hover:border-primary/20 transition-all duration-300">
                <div className="flex items-center gap-4">
                  <div className={`p-2.5 rounded-xl transition-all duration-300 ${messageSoundEnabled ? 'bg-primary/20 border border-primary/30' : 'bg-[hsl(222_47%_12%)] border border-border/30'}`}>
                    {messageSoundEnabled ? (
                      <Volume2 className="h-5 w-5 text-primary" />
                    ) : (
                      <VolumeX className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Zvuk pro zprávy</p>
                    <p className="text-sm text-muted-foreground">Přehrávat zvuk při nových zprávách</p>
                  </div>
                </div>
                <Switch
                  checked={messageSoundEnabled}
                  onCheckedChange={toggleMessageSound}
                />
              </div>

              {/* Win sound toggle */}
              <div className="flex items-center justify-between mb-6 p-4 rounded-xl bg-gradient-to-r from-[hsl(43_50%_10%/0.3)] via-transparent to-[hsl(43_50%_10%/0.2)] border border-[hsl(43_70%_50%/0.15)] hover:border-[hsl(43_70%_50%/0.3)] transition-all duration-300">
                <div className="flex items-center gap-4">
                  <div className={`p-2.5 rounded-xl transition-all duration-300 ${winSoundEnabled ? 'bg-[hsl(43_70%_50%/0.2)] border border-[hsl(43_70%_50%/0.3)]' : 'bg-[hsl(222_47%_12%)] border border-border/30'}`}>
                    {winSoundEnabled ? (
                      <Volume2 className="h-5 w-5 text-[hsl(43_70%_55%)]" />
                    ) : (
                      <VolumeX className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Zvuk pro výhry</p>
                    <p className="text-sm text-muted-foreground">Přehrávat zvuk při nových výhrách</p>
                  </div>
                </div>
                <Switch
                  checked={winSoundEnabled}
                  onCheckedChange={toggleWinSound}
                />
              </div>

              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Otestujte si funkčnost push notifikací na vašem zařízení.</p>
                <Button 
                  onClick={handleTestNotification} 
                  variant="outline" 
                  disabled={testingNotification}
                  className="w-full sm:w-auto border-primary/30 hover:border-primary/50 hover:bg-primary/10 transition-all duration-300 hover:scale-[1.02]"
                >
                  <Bell className={`h-4 w-4 mr-2 ${testingNotification ? 'animate-pulse' : ''}`} />
                  {testingNotification ? 'Odesílám...' : 'Otestovat notifikaci'}
                </Button>
              </div>
            </PremiumSection>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* MARKETING SECTION - Tertiary */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <PremiumSection delay={500} isLoaded={pageLoaded}>
              <SectionHeader
                icon={<Mail className="h-5 w-5 text-primary" />}
                title="Marketingová sdělení"
                subtitle="E-mailové novinky"
              />
              
              <div className="space-y-4">
                {/* Status Display */}
                <div className={`flex items-center gap-4 p-4 rounded-xl transition-all duration-300 ${
                  marketingStatus === 'active' 
                    ? 'bg-gradient-to-r from-[hsl(142_50%_15%/0.2)] via-transparent to-[hsl(142_50%_15%/0.1)] border border-[hsl(142_70%_45%/0.25)]' 
                    : 'bg-gradient-to-r from-[hsl(222_47%_10%)] via-transparent to-[hsl(222_47%_9%)] border border-border/20'
                }`}>
                  {marketingStatus === 'active' ? (
                    <>
                      <div className="p-2.5 rounded-xl bg-[hsl(142_70%_45%/0.2)] border border-[hsl(142_70%_45%/0.3)]">
                        <CheckCircle className="h-5 w-5 text-[hsl(142_70%_50%)]" />
                      </div>
                      <span className="font-semibold text-foreground">Marketing: Aktivní</span>
                    </>
                  ) : marketingStatus === 'revoked' ? (
                    <>
                      <div className="p-2.5 rounded-xl bg-destructive/20 border border-destructive/30">
                        <XCircle className="h-5 w-5 text-destructive" />
                      </div>
                      <span className="font-semibold text-foreground">Marketing: Odhlášeno</span>
                    </>
                  ) : marketingStatus === 'none' ? (
                    <>
                      <div className="p-2.5 rounded-xl bg-[hsl(222_47%_12%)] border border-border/30">
                        <XCircle className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <span className="font-semibold text-muted-foreground">Marketing: Nepřihlášeno</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Načítám...</span>
                  )}
                </div>

                <p className="text-sm text-muted-foreground">
                  V rámci vašeho účtu můžete dostávat informace o nových soutěžích, speciálních akcích a dalších novinkách prostřednictvím e-mailu.
                </p>
                
                {marketingStatus === 'active' && (
                  <>
                    <p className="text-sm text-muted-foreground">Pokud si již nepřejete dostávat marketingová sdělení, můžete se odhlásit.</p>
                    <Button 
                      variant="outline" 
                      className="w-full sm:w-auto border-destructive/30 hover:border-destructive/50 hover:bg-destructive/10 transition-all duration-300 hover:scale-[1.02]"
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
                    <p className="text-sm text-muted-foreground">Chcete-li dostávat marketingová sdělení, můžete se přihlásit.</p>
                    <Button 
                      className="profile-premium-btn w-full sm:w-auto bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary transition-all duration-300 hover:scale-[1.02]"
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
            </PremiumSection>
          </div>
        </div>
      </div>

      {/* Premium Top-up Modal */}
      <Dialog open={showTopUpModal} onOpenChange={setShowTopUpModal}>
        <DialogContent className="max-w-md border-[hsl(43_70%_50%/0.2)] bg-gradient-to-br from-[hsl(222_47%_8%)] via-[hsl(222_47%_7%)] to-[hsl(43_40%_6%)] backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-xl bg-[hsl(43_70%_50%/0.2)] border border-[hsl(43_70%_50%/0.3)]">
                <Coins className="h-5 w-5 text-[hsl(43_70%_55%)]" />
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
                      ? 'border-[hsl(43_70%_50%/0.5)] bg-gradient-to-r from-[hsl(43_50%_15%/0.3)] via-[hsl(43_50%_12%/0.2)] to-[hsl(43_50%_15%/0.15)] shadow-lg shadow-[hsl(43_70%_50%/0.1)]'
                      : 'border-border/30 hover:border-[hsl(43_70%_50%/0.3)] bg-[hsl(222_47%_10%/0.5)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-xl transition-all duration-300 ${selectedPackage?.id === pkg.id ? 'bg-[hsl(43_70%_50%/0.25)]' : 'bg-[hsl(222_47%_12%)]'}`}>
                        <Coins className={`h-5 w-5 transition-colors ${selectedPackage?.id === pkg.id ? 'text-[hsl(43_70%_55%)]' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className="font-bold text-lg">
                          {pkg.coins.toLocaleString('cs-CZ')} MioCoinů
                          {pkg.bonus > 0 && (
                            <span className="text-[hsl(142_70%_50%)] ml-2 font-semibold">+{pkg.bonus} Bonus</span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">{pkg.price} Kč</p>
                      </div>
                    </div>
                    {selectedPackage?.id === pkg.id && (
                      <Check className="h-6 w-6 text-[hsl(43_70%_55%)]" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="border-t border-border/20 pt-4">
              <Label htmlFor="customAmount" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vlastní částka (Kč)</Label>
              <Input
                id="customAmount"
                type="number"
                placeholder="Zadejte částku..."
                min="1"
                value={customAmount}
                onChange={(e) => handleCustomAmountChange(e.target.value)}
                className="mt-2 profile-premium-input bg-[hsl(222_47%_10%)] border-border/30 focus:border-[hsl(43_70%_50%/0.5)]"
              />
              {customAmount && parseInt(customAmount) > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Obdržíte <span className="text-[hsl(43_70%_55%)] font-semibold">{parseInt(customAmount).toLocaleString('cs-CZ')} MioCoinů</span> (bez bonusu)
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
              className="profile-premium-btn bg-gradient-to-r from-[hsl(43_80%_50%)] to-[hsl(43_70%_40%)] hover:from-[hsl(43_85%_55%)] hover:to-[hsl(43_75%_45%)] text-[hsl(222_47%_8%)] font-bold transition-all duration-300 hover:scale-[1.02]"
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
        <AlertDialogContent className="border-border/30 bg-gradient-to-br from-[hsl(222_47%_8%)] to-[hsl(222_47%_6%)] backdrop-blur-xl">
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
              className="profile-premium-btn bg-gradient-to-r from-primary to-primary/80 transition-all duration-300 hover:scale-[1.02]"
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
