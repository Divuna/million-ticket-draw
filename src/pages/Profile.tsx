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
import { RefreshCw, GamepadIcon, Gift } from 'lucide-react';
import { BottomNavigation } from '@/components/BottomNavigation';
import { AdminMenu } from '@/components/AdminMenu';
import { useUserRole } from '@/hooks/useUserRole';
import { VoucherCarousel } from '@/components/VoucherCarousel';
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

interface UserVoucher {
  id: string;
  voucher_id: string;
  redeemed: boolean;
  created_at: string;
  voucher: {
    id: string;
    name: string;
    image_url: string;
    banner_url: string | null;
    max_quantity: number | null;
    redeemed_count: number;
  };
}
const Profile: React.FC = () => {
  const {
    user,
    session
  } = useAuth();
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
  const [userVouchers, setUserVouchers] = useState<UserVoucher[]>([]);
  useEffect(() => {
    if (user) {
      fetchUserWallet();
      fetchUserProfile();
      fetchUserVouchers();
    }
  }, [user]);
  const fetchUserWallet = async () => {
    try {
      const {
        data,
        error
      } = await (supabase as any).from('wallets').select('*').eq('user_id', user?.id).maybeSingle();
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
    }
  };

  const fetchUserVouchers = async () => {
    try {
      const { data, error } = await supabase
        .from('user_vouchers')
        .select(`
          id,
          voucher_id,
          redeemed,
          created_at,
          voucher:voucher_id (
            id,
            name,
            image_url,
            banner_url,
            max_quantity,
            redeemed_count
          )
        `)
        .eq('user_id', user?.id)
        .eq('redeemed', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching user vouchers:', error);
        return;
      }

      setUserVouchers(data || []);
    } catch (error) {
      console.error('Error:', error);
    }
  };
  const handleProfileSave = async () => {
    setProfileSaving(true);
    try {
      const {
        error
      } = await (supabase as any).from('users').update({
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
      
      // Switch back to read-only mode and scroll to top
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
  const handleVoucherPurchase = async () => {
    const amount = parseInt(voucherAmount);
    if (!amount || amount < 50) {
      toast({
        title: "Chyba",
        description: "Minimální částka je 50 CZK.",
        variant: "destructive"
      });
      return;
    }
    setPurchaseLoading(true);

    // Pre-open a blank window immediately (tied to user gesture)
    const preOpenedWindow = window.open('', '_blank');
    try {
      // Call edge function to create Stripe checkout session
      const {
        data,
        error
      } = await supabase.functions.invoke('create-stripe-checkout', {
        body: {
          amount
        }
      });
      if (error) {
        throw error;
      }
      if (data.checkout_url) {
        // Try to redirect pre-opened window first
        if (preOpenedWindow && !preOpenedWindow.closed) {
          preOpenedWindow.location.href = data.checkout_url;
        } else {
          // Fallback to top-level navigation (escape iframe)
          if (window.top && window.top !== window) {
            window.top.location.assign(data.checkout_url);
          } else {
            // Final fallback to current window
            window.location.assign(data.checkout_url);
          }
        }
      } else {
        throw new Error('No checkout URL received');
      }
      setShowVoucherForm(false);
      setVoucherAmount('');
    } catch (error) {
      console.error('Error creating checkout session:', error);

      // Close pre-opened window on error
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
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (loading) {
    return <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Načítám profil...</p>
          </div>
        </div>
      </div>;
  }
  return <div className="min-h-screen bg-background pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Card className="ticket-profile ticket-perforations">
            <CardHeader>
              <CardTitle className="text-neon-cyan">Můj profil</CardTitle>
              <CardDescription>
                Přehled vašeho účtu a peněženky
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    E-mail:
                  </label>
                  <p className="text-lg">{wallet?.email || user?.email}</p>
                </div>
                
                {wallet?.name && <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      Jméno:
                    </label>
                    <p className="text-lg">{wallet.name}</p>
                  </div>}
              </div>
              
              {/* Profile Section */}
              <div className="border-t pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Osobní údaje</h3>
                  {!editMode && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setEditMode(true)}
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
                        <Input id="nickname" type="text" value={profile.nickname} onChange={e => setProfile(prev => ({
                        ...prev,
                        nickname: e.target.value
                      }))} placeholder="Zadejte přezdívku" />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="phone">Telefon</Label>
                        <Input id="phone" type="text" value={profile.phone} onChange={e => setProfile(prev => ({
                        ...prev,
                        phone: e.target.value
                      }))} placeholder="Zadejte telefon" />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="first_name">Křestní jméno</Label>
                        <Input id="first_name" type="text" value={profile.first_name} onChange={e => setProfile(prev => ({
                        ...prev,
                        first_name: e.target.value
                      }))} placeholder="Zadejte křestní jméno" />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="last_name">Příjmení</Label>
                        <Input id="last_name" type="text" value={profile.last_name} onChange={e => setProfile(prev => ({
                        ...prev,
                        last_name: e.target.value
                      }))} placeholder="Zadejte příjmení" />
                      </div>
                      
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="address">Doručovací adresa výhry
                      </Label>
                        <Textarea id="address" value={profile.address} onChange={e => setProfile(prev => ({
                        ...prev,
                        address: e.target.value
                      }))} placeholder="Zadejte doručovací adresu pro výhry" rows={3} />
                      </div>
                    </div>
                    
                    <div className="flex gap-2 mb-6">
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {profile.nickname && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">
                          Přezdívka:
                        </label>
                        <p className="text-lg">{profile.nickname}</p>
                      </div>
                    )}
                    
                    {profile.phone && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">
                          Telefon:
                        </label>
                        <p className="text-lg">{profile.phone}</p>
                      </div>
                    )}
                    
                    {(profile.first_name || profile.last_name) && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">
                          Jméno:
                        </label>
                        <p className="text-lg">
                          {[profile.first_name, profile.last_name].filter(Boolean).join(' ')}
                        </p>
                      </div>
                    )}
                    
                    {profile.address && (
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium text-muted-foreground">
                          Doručovací adresa:
                        </label>
                        <p className="text-lg whitespace-pre-wrap">{profile.address}</p>
                      </div>
                    )}
                    
                    {!profile.nickname && !profile.phone && !profile.first_name && !profile.last_name && !profile.address && (
                      <div className="md:col-span-2 text-center py-8 text-muted-foreground">
                        <p>Zatím nemáte vyplněny osobní údaje.</p>
                        <p className="text-sm">Klikněte na "Upravit profil" pro jejich zadání.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* My Vouchers Section */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Moje Vouchery</h3>
                
                {userVouchers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Zatím nemáte žádné uplatněné vouchery.</p>
                    <p className="text-sm">Navštivte sekci Vouchery pro dostupné nabídky.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {userVouchers.map((userVoucher) => (
                      <Card key={userVoucher.id} className="overflow-hidden">
                        <CardContent className="p-0">
                          {userVoucher.voucher.banner_url && (
                            <img 
                              src={userVoucher.voucher.banner_url} 
                              alt={`${userVoucher.voucher.name} banner`}
                              className="w-full h-32 object-cover"
                            />
                          )}
                          
                          <div className="p-4 space-y-3">
                            <div className="flex items-center gap-3">
                              {userVoucher.voucher.image_url && (
                                <img 
                                  src={userVoucher.voucher.image_url} 
                                  alt={userVoucher.voucher.name}
                                  className="w-12 h-12 object-cover rounded-lg flex-shrink-0"
                                />
                              )}
                              
                              <div className="flex-1">
                                <h4 className="font-semibold">{userVoucher.voucher.name}</h4>
                                <p className="text-sm text-muted-foreground">
                                  Uplatněno: {new Date(userVoucher.created_at).toLocaleDateString('cs-CZ')}
                                </p>
                              </div>
                            </div>

                            <div className="text-sm text-muted-foreground">
                              {userVoucher.voucher.max_quantity ? (
                                <>
                                  Zbývá: {userVoucher.voucher.max_quantity - userVoucher.voucher.redeemed_count} / {userVoucher.voucher.max_quantity}
                                </>
                              ) : (
                                'Neomezené množství'
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Peněženka</h3>
                  <Button variant="outline" size="sm" onClick={handleRefreshBalance} disabled={refreshing}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                    {refreshing ? 'Aktualizuji...' : 'Aktualizovat zůstatek'}
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <Card className="ticket-game ticket-perforations">
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm font-medium text-muted-foreground">Mince (coins):</p>
                        <p className="text-3xl font-bold text-neon-green">
                          {wallet?.balance_coins?.toLocaleString('cs-CZ') || '0'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="ticket-voucher ticket-perforations">
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm font-medium text-muted-foreground">Vouchery:</p>
                        <p className="text-3xl font-bold text-neon-pink">
                          {wallet?.balance_vouchers?.toLocaleString('cs-CZ') || '0'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button onClick={() => setShowVoucherForm(true)} size="lg">
                    Dobít vouchery + miocoiny
                  </Button>
                  
                  <Button onClick={() => navigate('/my-contests')} variant="outline" size="lg">
                    <GamepadIcon className="h-5 w-5 mr-2" />
                    Moje hry
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* My Vouchers Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Mé vouchery
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Zde najdete všechny dostupné vouchery k uplatnění
            </p>
          </CardHeader>
          <CardContent>
            <VoucherCarousel />
          </CardContent>
        </Card>
      </div>

      {/* Voucher Purchase Dialog */}
      <Dialog open={showVoucherForm} onOpenChange={setShowVoucherForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Koupit vouchery</DialogTitle>
            <DialogDescription>
              Zadejte částku v CZK (minimálně 50). 1 CZK = 1 voucher = 1 mince.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="amount" className="text-sm font-medium">
                Částka (CZK) *
              </label>
              <Input id="amount" type="number" placeholder="50" min="50" value={voucherAmount} onChange={e => setVoucherAmount(e.target.value)} />
              <p className="text-sm text-muted-foreground">
                Minimální částka je 50 CZK
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
            setShowVoucherForm(false);
            setVoucherAmount('');
          }} disabled={purchaseLoading}>
              Zrušit
            </Button>
            <Button onClick={handleVoucherPurchase} disabled={purchaseLoading || !voucherAmount || parseInt(voucherAmount) < 50}>
              {purchaseLoading ? 'Zpracovávám...' : 'Pokračovat k platbě'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>;
};
export default Profile;