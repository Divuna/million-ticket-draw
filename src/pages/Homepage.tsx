import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Card, TicketCard, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { BottomNavigation } from '@/components/BottomNavigation';
import { AdminMenu } from '@/components/AdminMenu';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { Gift, Trophy, ChevronRight, Ticket, Star } from 'lucide-react';
import { toast } from 'sonner';

interface Contest {
  id: string;
  title: string;
  main_prize: string;
  main_image: string | null;
  status: string;
  ticket_count: number;
  ticket_price: number;
  created_at: string;
}

const Homepage = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();
  const contestsCarouselRef = useRef<HTMLDivElement>(null);
  const vouchersCarouselRef = useRef<HTMLDivElement>(null);
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch contests from database
  const fetchContests = async () => {
    try {
      const { data, error } = await supabase
        .from('contests')
        .select('id, title, main_prize, main_image, status, ticket_count, ticket_price, created_at')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      
      setContests(data || []);
    } catch (error) {
      console.error('Error fetching contests:', error);
      toast.error('Nepodařilo se načíst soutěže');
    } finally {
      setLoading(false);
    }
  };

  // Load contests on component mount
  useEffect(() => {
    fetchContests();
  }, []);

  // Subscribe to contest changes for real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('contest-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'contests' }, 
        () => {
          fetchContests(); // Refresh contests when any contest changes
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-scroll functionality for carousels (disabled for admin)
  useEffect(() => {
    if (isAdmin || !user) return; // No auto-scroll for admin or non-logged-in users

    const scrollCarousel = (ref: React.RefObject<HTMLDivElement>, direction: 'left' | 'right') => {
      if (!ref.current) return;
      
      // The ref points directly to the scrollable container
      const container = ref.current;
      const scrollAmount = 280; // Width of one card approximately
      const currentScroll = container.scrollLeft;
      const maxScroll = container.scrollWidth - container.clientWidth;

      if (direction === 'right') {
        // Scroll right, reset to start when reaching end
        if (currentScroll >= maxScroll - 10) { // Small buffer for precision
          container.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
      } else {
        // Scroll left, reset to end when reaching start
        if (currentScroll <= 10) { // Small buffer for precision
          container.scrollTo({ left: maxScroll, behavior: 'smooth' });
        } else {
          container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
        }
      }
    };

    // Auto-scroll contests to the right every 4 seconds (only for logged-in non-admin users)
    const contestInterval = setInterval(() => {
      scrollCarousel(contestsCarouselRef, 'right');
    }, 4000);

    // Auto-scroll vouchers to the left every 5 seconds (only for logged-in non-admin users)
    const voucherInterval = setInterval(() => {
      scrollCarousel(vouchersCarouselRef, 'left');
    }, 5000);

    return () => {
      clearInterval(contestInterval);
      clearInterval(voucherInterval);
    };
  }, [isAdmin, user]);

  const handleVoucherClick = () => {
    if (!user) {
      toast.error('Pro nákup voucheru se musíte přihlásit');
      navigate('/login');
      return;
    }
    
    if (isAdmin) {
      return; // Read-only for admin
    }
    
    // Link to voucher purchase - using vouchers page for now
    navigate('/vouchers');
  };

  const handleGamesClick = () => {
    if (!user) {
      toast.error('Pro hraní her se musíte přihlásit');
      navigate('/login');
      return;
    }
    
    if (isAdmin) {
      return; // Read-only for admin
    }
    
    // Link to existing main games page
    navigate('/games');
  };

  const handleContestClick = (contestId: string) => {
    if (!user) {
      toast.error('Pro hraní her se musíte přihlásit');
      navigate('/login');
      return;
    }
    
    if (isAdmin) {
      return; // Read-only for admin
    }
    
    // Navigate to main games page
    navigate('/games');
  };

  const handleVoucherRedeem = (voucherId: string) => {
    if (!user) {
      toast.error('Pro uplatnění voucheru se musíte přihlásit');
      navigate('/login');
      return;
    }
    
    if (isAdmin) {
      return; // Read-only for admin
    }
    
    // Link to voucher redemption
    navigate('/vouchers');
    toast.success(`Uplatnění voucheru ${voucherId}`);
  };

  // Placeholder data for vouchers (keeping existing voucher data)
  const userVouchers = [
    { id: '1', name: 'Voucher 50 Kč', value: '50 Kč', status: 'available', code: 'V50-2024' },
    { id: '2', name: 'Voucher 100 Kč', value: '100 Kč', status: 'available', code: 'V100-2024' },
    { id: '3', name: 'Voucher 200 Kč', value: '200 Kč', status: 'used', code: 'V200-2024' },
    { id: '4', name: 'Voucher 500 Kč', value: '500 Kč', status: 'available', code: 'V500-2024' },
  ];

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8 space-y-12">
        {/* Hero Section - 3 Column Layout */}
        <section className="w-full">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Small Side Cards */}
            <div className="space-y-4 order-2 lg:order-1">
              {/* Left Side Card 1 */}
              <TicketCard variant="purple" className="p-6 h-40 transition-all duration-300 hover:scale-105">
                <div className="text-center space-y-3">
                  <div className="w-8 h-8 mx-auto bg-gradient-to-br from-purple-500 to-violet-600 rounded-full flex items-center justify-center mb-2">
                    <Gift className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Voucher Rewards</h3>
                  <p className="text-sm opacity-80">Získej slevy na produkty</p>
                  <Button variant="neonPurple" size="sm" onClick={handleVoucherClick}>
                    Získat odměnu
                  </Button>
                </div>
              </TicketCard>
              
              {/* Left Side Card 2 */}
              <TicketCard variant="green" className="p-6 h-40 transition-all duration-300 hover:scale-105">
                <div className="text-center space-y-3">
                  <div className="w-8 h-8 mx-auto bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mb-2">
                    <Star className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Speciální Akce</h3>
                  <p className="text-sm opacity-80">Limitované nabídky</p>
                  <Button variant="neonGreen" size="sm">
                    Zobrazit akce
                  </Button>
                </div>
              </TicketCard>
            </div>
            
            {/* Center Column - Main Hero Banner */}
            <div className="order-1 lg:order-2">
              <TicketCard variant="cyan" className="hero-neon-frame h-80 lg:h-96 p-8 transition-all duration-300 hover:scale-102">
                <div className="text-center space-y-6 h-full flex flex-col justify-center">
                  <div className="text-6xl md:text-8xl animate-bounce">🎯</div>
                  <h1 className="text-3xl md:text-4xl font-bold text-white">
                    OneMil Jackpot
                  </h1>
                  <p className="text-lg text-white/80">
                    Vyhraj hlavní cenu v hodnotě milionů korun
                  </p>
                  <div className="pt-4">
                    <Button variant="neonPink" size="lg" onClick={handleGamesClick} className="text-lg px-8 py-3">
                      Koupit tiket
                    </Button>
                  </div>
                </div>
              </TicketCard>
            </div>
            
            {/* Right Column - Small Side Cards */}
            <div className="space-y-4 order-3">
              {/* Right Side Card 1 */}
              <TicketCard variant="orange" className="p-6 h-40 transition-all duration-300 hover:scale-105">
                <div className="text-center space-y-3">
                  <div className="w-8 h-8 mx-auto bg-gradient-to-br from-orange-500 to-amber-600 rounded-full flex items-center justify-center mb-2">
                    <Trophy className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Bonus Ceny</h3>
                  <p className="text-sm opacity-80">Extra odměny za účast</p>
                  <Button variant="neonOrange" size="sm">
                    Zjistit více
                  </Button>
                </div>
              </TicketCard>
              
              {/* Right Side Card 2 */}
              <TicketCard variant="pink" className="p-6 h-40 transition-all duration-300 hover:scale-105">
                <div className="text-center space-y-3">
                  <div className="w-8 h-8 mx-auto bg-gradient-to-br from-pink-500 to-rose-600 rounded-full flex items-center justify-center mb-2">
                    <Ticket className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Daily Tickets</h3>
                  <p className="text-sm opacity-80">Denní šance na výhru</p>
                  <Button variant="neonPink" size="sm">
                    Hrát denně
                  </Button>
                </div>
              </TicketCard>
            </div>
          </div>
          
          {/* Role-based messaging */}
          <div className="mt-6 text-center">
            {isAdmin && (
              <div className="inline-block px-4 py-2 bg-amber-100/10 border border-amber-400/30 rounded-lg">
                <p className="text-sm text-amber-400">Admin zobrazení - všechny sekce jsou pouze pro čtení</p>
              </div>
            )}
            {!user && (
              <div className="inline-block px-4 py-2 bg-blue-100/10 border border-blue-400/30 rounded-lg">
                <p className="text-sm text-blue-400">Přihlaste se pro plnou interaktivitu</p>
              </div>
            )}
          </div>
        </section>

        {/* Two Dominant Boxes */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Voucher Purchase Box */}
          <Card className={`border-neon-cyan glow-cyan bg-card/50 backdrop-blur-sm transition-all duration-200 ${
            user && !isAdmin ? 'cursor-pointer hover:scale-105' : ''
          }`} onClick={handleVoucherClick}>
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
                <Gift className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold text-neon-cyan">
                Kupte Voucher
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">
                Získejte vouchers s okamžitou hodnotou
              </p>
              {user && !isAdmin && (
                <Button className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white border-0 glow-cyan">
                  Koupit Voucher
                  <ChevronRight className="ml-2 w-4 h-4" />
                </Button>
              )}
              {!user && (
                <Button variant="outline" className="w-full border-cyan-400 text-cyan-400 hover:bg-cyan-400/10">
                  Přihlásit se pro nákup
                </Button>
              )}
              {isAdmin && (
                <div className="text-sm text-muted-foreground py-2">
                  Admin zobrazení - pouze pro čtení
                </div>
              )}
            </CardContent>
          </Card>

          {/* Games Box */}
          <Card className={`border-neon-purple glow-purple bg-card/50 backdrop-blur-sm transition-all duration-200 ${
            user && !isAdmin ? 'cursor-pointer hover:scale-105' : ''
          }`} onClick={handleGamesClick}>
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold text-neon-purple">
                Hraj o luxusní ceny
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">
                Připojte se k hlavním hrám a vyhrajte velké ceny
              </p>
              {user && !isAdmin && (
                <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white border-0 glow-purple">
                  Hrát Hry
                  <ChevronRight className="ml-2 w-4 h-4" />
                </Button>
              )}
              {!user && (
                <Button variant="outline" className="w-full border-purple-400 text-purple-400 hover:bg-purple-400/10">
                  Přihlásit se pro hraní
                </Button>
              )}
              {isAdmin && (
                <div className="text-sm text-muted-foreground py-2">
                  Admin zobrazení - pouze pro čtení
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Ongoing Contests Carousel */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-neon-cyan flex items-center gap-2">
              <Ticket className="w-6 h-6" />
              Probíhající Soutěže
            </h3>
            <div className="flex items-center gap-2">
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
              {/* Role indicator */}
              {isAdmin && (
                <div className="px-2 py-1 bg-amber-100/10 border border-amber-400/30 rounded text-xs text-amber-400">
                  Pouze čtení
                </div>
              )}
              {!user && (
                <div className="px-2 py-1 bg-blue-100/10 border border-blue-400/30 rounded text-xs text-blue-400">
                  Přihlásit pro interakci
                </div>
              )}
            </div>
          </div>
          
          <div 
            ref={contestsCarouselRef}
            data-carousel-content
            className={`flex overflow-x-auto scroll-smooth gap-4 pb-4 ${isAdmin ? 'carousel-disabled' : ''}`}
            style={{ 
              scrollBehavior: 'smooth', 
              scrollSnapType: 'x mandatory',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            {loading ? (
              // Loading placeholder
              <div className="flex-none w-72">
                <TicketCard variant="gold" className="h-full">
                  <CardHeader className="pb-2">
                    <div className="h-32 bg-gradient-to-br from-yellow-500/20 to-amber-500/20 rounded animate-pulse mb-2" />
                    <div className="h-4 bg-neon-gold/20 rounded animate-pulse mb-2" />
                    <div className="h-3 bg-neon-gold/10 rounded animate-pulse w-20" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-16 bg-neon-gold/10 rounded animate-pulse mb-2" />
                    <div className="h-3 bg-neon-gold/20 rounded animate-pulse" />
                  </CardContent>
                </TicketCard>
              </div>
            ) : contests.length === 0 ? (
              // No contests message
              <div className="flex-none w-72">
                <TicketCard variant="gold" className="h-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-bold text-white">
                      Žádné aktivní soutěže
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-neon-gold/80">
                      Momentálně nejsou k dispozici žádné aktivní soutěže
                    </div>
                  </CardContent>
                </TicketCard>
              </div>
            ) : (
              contests.map((contest) => (
                <div 
                  key={contest.id} 
                  className="flex-none w-72"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  <TicketCard 
                    variant="gold"
                    className={`transition-all duration-300 h-full ${
                      user && !isAdmin ? 'cursor-pointer hover-scale hover:shadow-lg' : 
                      !user ? 'cursor-pointer hover:opacity-80 hover:scale-[1.01]' : 
                      'opacity-90'
                    }`}
                    onClick={() => !isAdmin && handleContestClick(contest.id)}
                  >
                    <CardHeader className="pb-2">
                      {/* Contest Image */}
                      <div className="w-full h-32 rounded-lg overflow-hidden mb-3 bg-gradient-to-br from-yellow-500/20 to-amber-500/20 flex items-center justify-center border border-neon-gold/30">
                        {contest.main_image ? (
                          <img 
                            src={contest.main_image.startsWith('http') ? contest.main_image : `https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-images/${contest.main_image}`}
                            alt={contest.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              console.log('Contest image loading error:', contest.main_image);
                              toast.error('Obrázek soutěže se nepodařilo načíst');
                              // Replace with fallback
                              e.currentTarget.style.display = 'none';
                              if (e.currentTarget.nextSibling) {
                                (e.currentTarget.nextSibling as HTMLElement).style.display = 'flex';
                              }
                            }}
                          />
                        ) : null}
                        <div 
                          className={`w-full h-full flex items-center justify-center text-neon-gold ${contest.main_image ? 'hidden' : 'flex'}`}
                          style={{ display: contest.main_image ? 'none' : 'flex' }}
                        >
                          <div className="text-center">
                            <Trophy className="w-8 h-8 mx-auto mb-2" />
                            <span className="text-xs">Bez obrázku</span>
                          </div>
                        </div>
                      </div>

                      <CardTitle className="text-lg font-bold text-white mb-2">
                        {contest.title}
                      </CardTitle>
                      <div className="text-xs text-neon-gold bg-black/50 px-2 py-1 rounded border border-neon-gold/30">
                        Cena: {contest.ticket_price} Kč
                      </div>
                    </CardHeader>
                    
                    <CardContent>
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-white">
                          Hlavní cena: {contest.main_prize}
                        </p>
                        <div className="flex justify-between text-xs text-neon-gold">
                          <span>Tikety: {contest.ticket_count}</span>
                          <span className="capitalize">{contest.status}</span>
                        </div>
                        
                        {/* CTA Button */}
                        {user && !isAdmin && (
                          <Button 
                            variant="neonOrange"
                            className="w-full mt-3"
                            size="sm"
                          >
                            Koupit Tiket
                            <Ticket className="ml-2 w-3 h-3" />
                          </Button>
                        )}
                        
                        {!user && (
                          <Button 
                            variant="outline" 
                            className="w-full mt-3 border-neon-gold text-neon-gold hover:bg-neon-gold/10"
                            size="sm"
                          >
                            Přihlásit se
                          </Button>
                        )}
                        
                        {isAdmin && (
                          <div className="mt-3 text-xs text-center text-white/60 py-2 bg-black/50 rounded">
                            Admin zobrazení
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </TicketCard>
                </div>
              ))
            )}
          </div>
        </section>

        {/* User Vouchers Carousel */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-neon-pink flex items-center gap-2">
              <Gift className="w-6 h-6" />
              Vaše Vouchery
            </h3>
            <div className="flex items-center gap-2">
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
              {/* Role indicator */}
              {isAdmin && (
                <div className="px-2 py-1 bg-amber-100/10 border border-amber-400/30 rounded text-xs text-amber-400">
                  Pouze čtení
                </div>
              )}
              {!user && (
                <div className="px-2 py-1 bg-blue-100/10 border border-blue-400/30 rounded text-xs text-blue-400">
                  Přihlásit pro správu
                </div>
              )}
            </div>
          </div>
          
          <div 
            ref={vouchersCarouselRef}
            data-carousel-content
            className={`flex overflow-x-auto scroll-smooth gap-4 pb-4 ${isAdmin ? 'carousel-disabled' : ''}`}
            style={{ 
              scrollBehavior: 'smooth', 
              scrollSnapType: 'x mandatory',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            {userVouchers.map((voucher) => (
              <div 
                key={voucher.id} 
                className="flex-none w-64"
                style={{ scrollSnapAlign: 'start' }}
              >
                <TicketCard 
                  variant={voucher.status === 'available' ? 'pink' : 'purple'}
                  className={`transition-all duration-300 h-full ${
                    user && !isAdmin && voucher.status === 'available' ? 'cursor-pointer hover-scale hover:shadow-lg' : 
                    !user ? 'cursor-pointer hover:opacity-80 hover:scale-[1.01]' : 
                    'opacity-70'
                  }`}
                  onClick={() => voucher.status === 'available' && !isAdmin && handleVoucherRedeem(voucher.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="text-center mb-3">
                      <div className="w-12 h-12 mx-auto bg-gradient-to-br from-pink-500 to-rose-500 rounded-full flex items-center justify-center mb-2">
                        <Gift className="w-6 h-6 text-white" />
                      </div>
                    </div>
                    <CardTitle className="text-lg font-bold text-white text-center mb-2">
                      {voucher.name}
                    </CardTitle>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-neon-pink mb-1">{voucher.value}</div>
                      <div className={`text-xs px-2 py-1 rounded border ${
                        voucher.status === 'available' 
                          ? 'text-neon-pink bg-pink-500/20 border-neon-pink/30' 
                          : 'text-gray-400 bg-gray-500/20 border-gray-400/30'
                      }`}>
                        {voucher.status === 'available' ? 'Dostupný' : 'Použitý'}
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-xs text-center text-white/80 font-mono">
                        Kód: {voucher.code}
                      </div>
                      
                      {/* CTA Button */}
                      {user && !isAdmin && voucher.status === 'available' && (
                        <Button 
                          variant="neonPink"
                          className="w-full mt-3"
                          size="sm"
                        >
                          Uplatnit
                          <Gift className="ml-2 w-3 h-3" />
                        </Button>
                      )}
                      
                      {user && !isAdmin && voucher.status === 'used' && (
                        <div className="mt-3 text-xs text-center text-white/60 py-2 bg-black/50 rounded">
                          Již použitý
                        </div>
                      )}
                      
                      {!user && (
                        <Button 
                          variant="outline" 
                          className="w-full mt-3 border-neon-pink text-neon-pink hover:bg-neon-pink/10"
                          size="sm"
                        >
                          Přihlásit se
                        </Button>
                      )}
                      
                      {isAdmin && (
                        <div className="mt-3 text-xs text-center text-white/60 py-2 bg-black/50 rounded">
                          Admin zobrazení
                        </div>
                      )}
                    </div>
                  </CardContent>
                </TicketCard>
              </div>
            ))}
          </div>
        </section>

        {/* Enhanced Footer */}
        <footer className="border-t border-border pt-12 mt-20 bg-gradient-to-br from-background to-muted/20">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            {/* Company Info */}
            <div className="space-y-4">
              <h4 className="font-bold text-xl text-neon-cyan mb-6">OneMil</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Vaše platforma pro soutěže a výhry. Získejte šanci vyhrát luxusní ceny a vouchery.
              </p>
              <div className="flex space-x-4 pt-4">
                <div className="w-8 h-8 bg-neon-cyan/20 rounded-full flex items-center justify-center">
                  <span className="text-xs text-neon-cyan">FB</span>
                </div>
                <div className="w-8 h-8 bg-neon-purple/20 rounded-full flex items-center justify-center">
                  <span className="text-xs text-neon-purple">TW</span>
                </div>
                <div className="w-8 h-8 bg-neon-pink/20 rounded-full flex items-center justify-center">
                  <span className="text-xs text-neon-pink">IG</span>
                </div>
              </div>
            </div>

            {/* Information Links */}
            <div className="space-y-4">
              <h4 className="font-semibold text-lg text-neon-purple mb-6">Informace</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-neon-purple transition-colors duration-200 story-link">
                    O společnosti
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-neon-purple transition-colors duration-200 story-link">
                    Jak to funguje
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-neon-purple transition-colors duration-200 story-link">
                    Naše mise
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-neon-purple transition-colors duration-200 story-link">
                    Kariéra
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-neon-purple transition-colors duration-200 story-link">
                    Tiskové zprávy
                  </a>
                </li>
              </ul>
            </div>

            {/* FAQ & Support */}
            <div className="space-y-4">
              <h4 className="font-semibold text-lg text-neon-cyan mb-6">Podpora</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-neon-cyan transition-colors duration-200 story-link">
                    Často kladené otázky
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-neon-cyan transition-colors duration-200 story-link">
                    Centrum nápovědy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-neon-cyan transition-colors duration-200 story-link">
                    Kontaktujte nás
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-neon-cyan transition-colors duration-200 story-link">
                    Nahlásit problém
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-neon-cyan transition-colors duration-200 story-link">
                    Živý chat
                  </a>
                </li>
              </ul>
            </div>

            {/* Legal Terms */}
            <div className="space-y-4">
              <h4 className="font-semibold text-lg text-neon-pink mb-6">Právní podmínky</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-neon-pink transition-colors duration-200 story-link">
                    Všeobecné obchodní podmínky
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-neon-pink transition-colors duration-200 story-link">
                    Ochrana osobních údajů
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-neon-pink transition-colors duration-200 story-link">
                    Pravidla soutěží
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-neon-pink transition-colors duration-200 story-link">
                    Zásady použití cookies
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-neon-pink transition-colors duration-200 story-link">
                    Autorská práva
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-border pt-8 pb-8">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <div className="text-sm text-muted-foreground">
                © 2024 OneMil s.r.o. Všechna práva vyhrazena.
              </div>
              <div className="flex items-center space-x-6 text-sm text-muted-foreground">
                <span>Verze 1.0.0</span>
                <span>•</span>
                <span>Česká republika</span>
                <span>•</span>
                <span>
                  {isAdmin && "Admin režim"}
                  {!isAdmin && user && "Přihlášený uživatel"}
                  {!user && "Návštěvník"}
                </span>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Show admin menu or regular bottom navigation */}
      {isAdmin ? <AdminMenu /> : <BottomNavigation />}
    </div>
  );
};

export default Homepage;
