import React, { useEffect, useState } from 'react';
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
import { RefreshCw, GamepadIcon } from 'lucide-react';
import { BottomNavigation } from '@/components/BottomNavigation';
import { AdminMenu } from '@/components/AdminMenu';
import { useUserRole } from '@/hooks/useUserRole';

interface UserWallet {
  user_id: string;
  email: string;
  name: string;
  balance_coins: number;
  balance_vouchers: number;
  created_at: string;
}

interface UserProfile {
  nickname: string;
  first_name: string;
  last_name: string;
  address: string;
  phone: string;
}

const Profile: React.FC = () => {
  const { user, session } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [profile, setProfile] = useState<UserProfile>({
    nickname: '',
    first_name: '',
    last_name: '',
    address: '',
    phone: ''
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showVoucherForm, setShowVoucherForm] = useState(false);
  const [voucherAmount, setVoucherAmount] = useState('');
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUserWallet();
      fetchUserProfile();
    }
  }, [user]);

  const fetchUserWallet = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('wallets')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching wallet:', error);
        // Fallback to basic user data
        setWallet({
          user_id: user?.id || '',
          email: user?.email || '',
          name: user?.user_metadata?.name || user?.user_metadata?.full_name || '',
          balance_coins: 0,
          balance_vouchers: 0,
          created_at: new Date().toISOString()
        });
      } else if (data) {
        setWallet({
          user_id: data.user_id || '',
          email: user?.email || '',
          name: user?.user_metadata?.name || user?.user_metadata?.full_name || '',
          balance_coins: Number(data.balance_coins) || 0,
          balance_vouchers: Number(data.balance_vouchers) || 0,
          created_at: data.created_at || new Date().toISOString()
        });
      } else {
        // No wallet data found, use fallback
        setWallet({
          user_id: user?.id || '',
          email: user?.email || '',
          name: user?.user_metadata?.name || user?.user_metadata?.full_name || '',
          balance_coins: 0,
          balance_vouchers: 0,
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
        balance_vouchers: 0,
        created_at: new Date().toISOString()
      });
    }
  };

  const fetchUserProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
        return;
      }

      if (data) {
        setProfile({
          nickname: data.nickname || '',
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          address: data.address || '',
          phone: data.phone || ''
        });
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserProfile = async () => {
    try {
      // Use direct SQL query to avoid type issues
      const { data, error } = await supabase.rpc('get_user_profile' as any, {
        p_user_id: user?.id
      });

      if (error) {
        console.error('Error fetching profile:', error);
        return;
      }

      if (data && data.length > 0) {
        const profileData = data[0];
        setProfile({
          nickname: profileData.nickname || '',
          first_name: profileData.first_name || '',
          last_name: profileData.last_name || '',
          address: profileData.address || '',
          phone: profileData.phone || ''
        });
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };
      
      toast({
        title: "Úspěch",
        description: "Profil byl úspěšně uložen"
      });
      
      setEditMode(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se uložit profil",
        variant: "destructive"
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleRefreshBalance = async () => {
    setRefreshing(true);
    await fetchUserWallet();
    setRefreshing(false);
    toast({
      title: "Aktualizováno",
      description: "Zůstatek byl aktualizován"
    });
  };

  const handleVoucherPurchase = async () => {
    if (!voucherAmount || !user) return;
    
    setPurchaseLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-checkout', {
        body: {
          amount: parseInt(voucherAmount),
          userId: user.id,
          type: 'voucher'
        }
      });

      if (error) throw error;
      
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
      toast({
        title: "Chyba",
        description: "Nepodařilo se vytvořit platbu",
        variant: "destructive"
      });
    } finally {
      setPurchaseLoading(false);
    }
  };

  const handleMyGamesClick = () => {
    navigate('/my-contests');
  };

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Načítám profil...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-6xl font-black text-transparent bg-gradient-to-r from-neon-cyan via-cyan-400 to-neon-cyan bg-clip-text animate-pulse mb-4">
              ⚡ MŮJ PROFIL ⚡
            </h1>
            <p className="text-neon-cyan/80 font-medium text-lg">Správa vašich osobních údajů</p>
          </div>

          <div className="space-y-8">
            {/* Profile Section */}
            <div className="neon-ticket ticket-profile ticket-perforations">
              {/* Ticket perforations */}
              <div className="absolute left-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-3">
                {Array.from({length: 8}).map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-background border border-neon-cyan/50" />
                ))}
              </div>
              <div className="absolute right-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-3">
                {Array.from({length: 8}).map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-background border border-neon-cyan/50" />
                ))}
              </div>
              
              <div className="relative z-10 p-8">
                <div className="text-center mb-6">
                  <h2 className="text-3xl font-black text-transparent bg-gradient-to-r from-neon-cyan via-cyan-400 to-neon-cyan bg-clip-text animate-pulse">
                    👤 OSOBNÍ ÚDAJE 👤
                  </h2>
                </div>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="nickname" className="text-neon-cyan font-bold">Přezdívka</Label>
                      <Input
                        id="nickname"
                        value={profile.nickname}
                        onChange={(e) => setProfile({...profile, nickname: e.target.value})}
                        disabled={!editMode}
                        className="bg-background/50 border-2 border-neon-cyan/30 focus:border-neon-cyan text-white"
                      />
                    </div>
                    <div>
                      <Label htmlFor="first_name" className="text-neon-cyan font-bold">Jméno</Label>
                      <Input
                        id="first_name"
                        value={profile.first_name}
                        onChange={(e) => setProfile({...profile, first_name: e.target.value})}
                        disabled={!editMode}
                        className="bg-background/50 border-2 border-neon-cyan/30 focus:border-neon-cyan text-white"
                      />
                    </div>
                    <div>
                      <Label htmlFor="last_name" className="text-neon-cyan font-bold">Příjmení</Label>
                      <Input
                        id="last_name"
                        value={profile.last_name}
                        onChange={(e) => setProfile({...profile, last_name: e.target.value})}
                        disabled={!editMode}
                        className="bg-background/50 border-2 border-neon-cyan/30 focus:border-neon-cyan text-white"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone" className="text-neon-cyan font-bold">Telefon</Label>
                      <Input
                        id="phone"
                        value={profile.phone}
                        onChange={(e) => setProfile({...profile, phone: e.target.value})}
                        disabled={!editMode}
                        className="bg-background/50 border-2 border-neon-cyan/30 focus:border-neon-cyan text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="address" className="text-neon-cyan font-bold">Adresa</Label>
                    <Textarea
                      id="address"
                      value={profile.address}
                      onChange={(e) => setProfile({...profile, address: e.target.value})}
                      disabled={!editMode}
                      className="bg-background/50 border-2 border-neon-cyan/30 focus:border-neon-cyan text-white"
                    />
                  </div>
                  <div className="flex gap-2 pt-4 justify-center">
                    {!editMode ? (
                      <Button 
                        onClick={() => setEditMode(true)}
                        className="bg-gradient-to-r from-neon-cyan via-cyan-400 to-neon-cyan text-black font-bold px-8 py-3 rounded-xl hover:scale-105 transition-all duration-300 shadow-lg"
                        style={{ 
                          boxShadow: '0 0 30px hsl(var(--neon-cyan) / 0.6)',
                          animation: 'neon-pulse 2s ease-in-out infinite'
                        }}
                      >
                        ⚡ UPRAVIT PROFIL ⚡
                      </Button>
                    ) : (
                      <>
                        <Button 
                          onClick={handleProfileSave}
                          disabled={profileSaving}
                          className="bg-gradient-to-r from-green-400 to-emerald-500 text-black font-bold px-6 py-3 rounded-xl hover:scale-105 transition-all duration-300"
                          style={{ boxShadow: '0 0 20px rgba(34, 197, 94, 0.5)' }}
                        >
                          {profileSaving ? '💾 UKLÁDÁNÍ...' : '✅ ULOŽIT'}
                        </Button>
                        <Button 
                          onClick={() => setEditMode(false)}
                          className="bg-gradient-to-r from-red-400 to-pink-500 text-black font-bold px-6 py-3 rounded-xl hover:scale-105 transition-all duration-300"
                          style={{ boxShadow: '0 0 20px rgba(244, 63, 94, 0.5)' }}
                        >
                          ❌ ZRUŠIT
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Wallet Section */}
            <div className="neon-ticket ticket-profile ticket-perforations">
              {/* Ticket perforations */}
              <div className="absolute left-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-3">
                {Array.from({length: 6}).map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-background border border-neon-cyan/50" />
                ))}
              </div>
              <div className="absolute right-6 top-1/2 transform -translate-y-1/2 flex flex-col gap-3">
                {Array.from({length: 6}).map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-background border border-neon-cyan/50" />
                ))}
              </div>
              
              <div className="relative z-10 p-8">
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-black text-transparent bg-gradient-to-r from-neon-cyan via-cyan-400 to-neon-cyan bg-clip-text animate-pulse">
                    💰 PENĚŽENKA 💰
                  </h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="bg-gradient-to-br from-neon-cyan/20 via-cyan-400/10 to-neon-cyan/5 p-6 rounded-xl border-2 border-neon-cyan/40">
                    <div className="text-center">
                      <div className="text-4xl font-black text-neon-cyan mb-2">{wallet?.balance_coins || 0}</div>
                      <div className="text-neon-cyan/80 font-bold text-lg">🪙 MINCE</div>
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-neon-cyan/20 via-cyan-400/10 to-neon-cyan/5 p-6 rounded-xl border-2 border-neon-cyan/40">
                    <div className="text-center">
                      <div className="text-4xl font-black text-neon-cyan mb-2">{wallet?.balance_vouchers || 0}</div>
                      <div className="text-neon-cyan/80 font-bold text-lg">🎫 VOUCHERY</div>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-3 justify-center">
                  <Button 
                    onClick={handleRefreshBalance}
                    disabled={refreshing}
                    className="bg-gradient-to-r from-neon-cyan via-cyan-400 to-neon-cyan text-black font-bold px-6 py-3 rounded-xl hover:scale-105 transition-all duration-300"
                    style={{ 
                      boxShadow: '0 0 25px hsl(var(--neon-cyan) / 0.5)',
                      animation: refreshing ? 'neon-pulse 1s ease-in-out infinite' : 'none'
                    }}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    {refreshing ? '🔄 AKTUALIZUJI...' : '🔄 AKTUALIZOVAT'}
                  </Button>
                  <Button 
                    onClick={() => setShowVoucherForm(true)}
                    className="bg-gradient-to-r from-neon-purple via-purple-400 to-neon-purple text-white font-bold px-6 py-3 rounded-xl hover:scale-105 transition-all duration-300"
                    style={{ boxShadow: '0 0 25px hsl(var(--neon-purple) / 0.5)' }}
                  >
                    🛒 KOUPIT VOUCHER
                  </Button>
                  <Button 
                    onClick={handleMyGamesClick}
                    className="bg-gradient-to-r from-neon-pink via-pink-400 to-neon-pink text-white font-bold px-6 py-3 rounded-xl hover:scale-105 transition-all duration-300"
                    style={{ boxShadow: '0 0 25px hsl(var(--neon-pink) / 0.5)' }}
                  >
                    <GamepadIcon className="mr-2 h-4 w-4" />
                    🎮 MOJE HRY
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showVoucherForm} onOpenChange={setShowVoucherForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Koupit Voucher</DialogTitle>
            <DialogDescription>
              Zadejte částku pro váš voucher
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="amount">Částka (Kč)</Label>
              <Input
                id="amount"
                type="number"
                value={voucherAmount}
                onChange={(e) => setVoucherAmount(e.target.value)}
                placeholder="Zadejte částku"
                min="1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleVoucherPurchase}
              disabled={purchaseLoading || !voucherAmount}
            >
              {purchaseLoading ? 'Zpracování...' : 'Koupit Voucher'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default Profile;