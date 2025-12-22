import React, { useEffect, useState, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { toast } from '@/hooks/use-toast';
import { RefreshCw, GamepadIcon, Bell, Coins, Check, Volume2, VolumeX, User, Camera, Loader2 } from 'lucide-react';
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

interface UserProfile {
  nickname: string;
  first_name: string;
  last_name: string;
  address: string;
  phone: string;
  avatar_url: string | null;
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

const Profile: React.FC = () => {
  const { user, session } = useAuth();
  const { isAdmin } = useUserRole();
  const { soundEnabled, toggleSound } = useNotificationSettings();
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [profile, setProfile] = useState<UserProfile>({
    nickname: '',
    first_name: '',
    last_name: '',
    address: '',
    phone: '',
    avatar_url: null
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
  const avatarInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (user) {
      fetchUserWallet();
      fetchUserProfile();
    }
  }, [user]);

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
      
      // Also fetch avatar from profiles table
      const profileResult = await supabase.from('profiles').select('avatar_url').eq('id', user?.id ?? '').maybeSingle();
      const avatarUrl = profileResult.data?.avatar_url || null;
      
      if (data) {
        setProfile({
          nickname: data.nickname || '',
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          address: data.address || '',
          phone: data.phone || '',
          avatar_url: avatarUrl
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
        {/* Page Header with Avatar */}
        <div className="flex items-center gap-4 mb-8">
          {/* Avatar with Upload */}
          <div className="relative group">
            <Avatar className="h-20 w-20 border-2 border-border/50">
              <AvatarImage src={profile.avatar_url || undefined} alt="Avatar" />
              <AvatarFallback className="bg-muted text-foreground text-xl">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              {avatarUploading ? (
                <Loader2 className="h-6 w-6 text-white animate-spin" />
              ) : (
                <Camera className="h-6 w-6 text-white" />
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
            <h1 className="text-2xl font-bold text-foreground">Můj profil</h1>
            <p className="text-sm text-muted-foreground">Kliknutím na avatar změníte obrázek</p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto space-y-6">
          
          {/* Account Info Section */}
          <div className="rounded-2xl bg-black/40 border border-border/50 p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Účet</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">E-mail</label>
                <p className="text-foreground">{wallet?.email || user?.email}</p>
              </div>
              {wallet?.name && (
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">Jméno</label>
                  <p className="text-foreground">{wallet.name}</p>
                </div>
              )}
            </div>
          </div>

          {/* Personal Details Section */}
          <div className="rounded-2xl bg-black/40 border border-border/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Osobní údaje</h2>
              {!editMode && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setEditMode(true)}
                  className="border-primary/30 hover:border-primary/50"
                >
                  Upravit profil
                </Button>
              )}
            </div>
            
            {editMode ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                      className="bg-muted/30 border-border/50"
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
                      className="bg-muted/30 border-border/50"
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
                      className="bg-muted/30 border-border/50"
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
                      className="bg-muted/30 border-border/50"
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
                      className="bg-muted/30 border-border/50"
                    />
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button onClick={handleProfileSave} disabled={profileSaving}>
                    {profileSaving ? 'Ukládám...' : 'Uložit profil'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setEditMode(false)}
                    disabled={profileSaving}
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
                      <div className="space-y-1">
                        <label className="text-sm text-muted-foreground">Přezdívka</label>
                        <p className="text-foreground">{profile.nickname}</p>
                      </div>
                    )}
                    
                    {profile.phone && (
                      <div className="space-y-1">
                        <label className="text-sm text-muted-foreground">Telefon</label>
                        <p className="text-foreground">{profile.phone}</p>
                      </div>
                    )}
                    
                    {(profile.first_name || profile.last_name) && (
                      <div className="space-y-1">
                        <label className="text-sm text-muted-foreground">Jméno</label>
                        <p className="text-foreground">
                          {[profile.first_name, profile.last_name].filter(Boolean).join(' ')}
                        </p>
                      </div>
                    )}
                    
                    {profile.address && (
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-sm text-muted-foreground">Doručovací adresa</label>
                        <p className="text-foreground whitespace-pre-wrap">{profile.address}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <p>Zatím nemáte vyplněny osobní údaje.</p>
                    <p className="text-sm mt-1">Klikněte na "Upravit profil" pro jejich zadání.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Wallet Section */}
          <div className="rounded-2xl bg-black/40 border border-border/50 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">Peněženka</h2>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleRefreshBalance} 
                disabled={refreshing}
                className="text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Aktualizuji...' : 'Aktualizovat'}
              </Button>
            </div>
            
            {/* Balance Display */}
            <div className="flex items-center justify-center gap-6 mb-6 py-4">
              <div className="flex items-center gap-3">
                <Coins className="h-8 w-8 text-yellow-500" />
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">MioCoiny</p>
                  <p className="text-4xl font-bold text-yellow-500">
                    {wallet?.balance_coins?.toLocaleString('cs-CZ') || '0'}
                  </p>
                </div>
              </div>
              {(wallet?.bonus_balance_coins ?? 0) > 0 && (
                <div className="flex items-center gap-3 pl-6 border-l border-border/50">
                  <Coins className="h-6 w-6 text-green-500" />
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Bonusové</p>
                    <p className="text-2xl font-bold text-green-500">
                      {wallet?.bonus_balance_coins?.toLocaleString('cs-CZ') || '0'}
                    </p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={() => setShowTopUpModal(true)} className="flex-1" size="lg">
                <Coins className="h-5 w-5 mr-2" />
                Dobít MioCoiny
              </Button>
              
              <Button onClick={() => navigate('/my-contests')} variant="outline" className="flex-1" size="lg">
                <GamepadIcon className="h-5 w-5 mr-2" />
                Moje hry
              </Button>
            </div>
          </div>

          {/* Notifications Section */}
          <div className="rounded-2xl bg-black/40 border border-border/50 p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Notifikace</h2>
            
            {/* Sound notification toggle */}
            <div className="flex items-center justify-between mb-4 p-3 rounded-lg bg-muted/20 border border-border/30">
              <div className="flex items-center gap-3">
                {soundEnabled ? (
                  <Volume2 className="h-5 w-5 text-primary" />
                ) : (
                  <VolumeX className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="font-medium text-foreground">Zvukové notifikace</p>
                  <p className="text-sm text-muted-foreground">
                    Přehrávat zvuk při změně stavu výhry
                  </p>
                </div>
              </div>
              <Switch
                checked={soundEnabled}
                onCheckedChange={toggleSound}
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
                className="w-full sm:w-auto"
              >
                <Bell className={`h-4 w-4 mr-2 ${testingNotification ? 'animate-pulse' : ''}`} />
                {testingNotification ? 'Odesílám...' : 'Otestovat notifikaci'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* MioCoin Top-up Modal */}
      <Dialog open={showTopUpModal} onOpenChange={setShowTopUpModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dobít MioCoiny</DialogTitle>
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
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    selectedPackage?.id === pkg.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Coins className="h-5 w-5 text-neon-green" />
                      <div>
                        <p className="font-semibold">
                          {pkg.coins.toLocaleString('cs-CZ')} MioCoinů
                          {pkg.bonus > 0 && (
                            <span className="text-neon-green ml-1">+{pkg.bonus} Bonus</span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">{pkg.price} Kč</p>
                      </div>
                    </div>
                    {selectedPackage?.id === pkg.id && (
                      <Check className="h-5 w-5 text-primary" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Custom Amount */}
            <div className="border-t pt-4">
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
                className="mt-2"
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
            >
              Zrušit
            </Button>
            <Button 
              onClick={handleTopUpPurchase} 
              disabled={purchaseLoading || (!selectedPackage && !customAmount)}
            >
              {purchaseLoading ? 'Zpracovávám...' : 'Pokračovat k platbě'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default Profile;
