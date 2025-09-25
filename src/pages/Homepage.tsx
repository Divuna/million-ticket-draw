import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { BottomNavigation } from '@/components/BottomNavigation';
import { AdminMenu } from '@/components/AdminMenu';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { useHomepageVouchers } from '@/hooks/useHomepageVouchers';
import { useMegajackpotBanners } from '@/hooks/useMegajackpotBanners';
import { usePartners } from '@/hooks/usePartners';
import { Gift, Trophy, ChevronRight, Ticket, Star, ChevronLeft, Handshake, ExternalLink } from 'lucide-react';
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
  const { vouchers: homepageVouchers, loading: vouchersLoading, getRemainingCount } = useHomepageVouchers();
  const { banners: megajackpotBanners, loading: bannersLoading } = useMegajackpotBanners();
  const { partners, loading: partnersLoading } = usePartners();
  const contestsCarouselRef = useRef<HTMLDivElement>(null);
  const vouchersCarouselRef = useRef<HTMLDivElement>(null);
  const megajackpotCarouselRef = useRef<HTMLDivElement>(null);
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  // Fetch contests from database
  const fetchContests = async () => {
    try {
      const { data, error } = await supabase
        .from('contests')
        .select('id, title, main_prize, main_image, status, ticket_count, ticket_price, created_at')
        .in('status', ['active', 'pending'])
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
  };

  return (
    <div className="min-h-screen bg-background dark pb-20">
      <Header />
      
      <div className="container mx-auto px-4 py-8 space-y-12">
        {/* Megajackpot Banner Section */}
        <section className="w-full">
          {bannersLoading ? (
            // Loading placeholder
            <div className="neon-ticket h-80 md:h-96 flex items-center justify-center relative overflow-hidden animate-pulse">
              <div className="absolute inset-0 bg-gradient-to-br from-transparent via-neon-cyan/5 to-neon-purple/5" />
              <div className="text-center space-y-6 z-10 px-8">
                <div className="w-32 h-12 bg-neon-cyan/20 rounded-xl mx-auto" />
                <div className="w-48 h-8 bg-neon-purple/20 rounded-lg mx-auto" />
              </div>
            </div>
          ) : megajackpotBanners.length > 0 ? (
            // Banner display with carousel for multiple banners
            <div className="relative">
              <div className="neon-ticket h-80 md:h-96 flex items-center justify-center relative overflow-hidden">
                {/* Background image from current banner */}
                <div 
                  className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-30"
                  style={{ backgroundImage: `url(${megajackpotBanners[currentBannerIndex]?.image_url})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-br from-transparent via-neon-cyan/5 to-neon-purple/5" />
                
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
                
                {/* Navigation arrows for multiple banners */}
                {megajackpotBanners.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute left-2 top-1/2 transform -translate-y-1/2 z-20 bg-background/20 backdrop-blur-sm hover:bg-background/40"
                      onClick={() => setCurrentBannerIndex(prev => 
                        prev === 0 ? megajackpotBanners.length - 1 : prev - 1
                      )}
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 z-20 bg-background/20 backdrop-blur-sm hover:bg-background/40"
                      onClick={() => setCurrentBannerIndex(prev => 
                        prev === megajackpotBanners.length - 1 ? 0 : prev + 1
                      )}
                    >
                      <ChevronRight className="w-6 h-6" />
                    </Button>
                  </>
                )}
                
                {/* Central content */}
                <div className="text-center space-y-6 z-10 px-8">
                  <div className="flex items-center justify-center gap-4 mb-4">
                    <div className="text-6xl md:text-8xl animate-pulse">🎟️</div>
                    <div className="text-4xl md:text-6xl text-neon-cyan animate-bounce">⚡</div>
                  </div>
                  
                  <h1 className="hero-title text-4xl md:text-7xl font-black leading-tight">
                    {megajackpotBanners[currentBannerIndex]?.title || 'MEGA JACKPOT'}
                  </h1>
                  
                  <div className="space-y-2">
                    <p className="text-xl md:text-2xl text-neon-purple font-bold">
                      Vyhrajte až 1,000,000 Kč!
                    </p>
                    <p className="text-base md:text-lg text-muted-foreground">
                      Kupte si lístek a staňte se milionářem ještě dnes
                    </p>
                  </div>
                  
                  {/* CTA Button */}
                  <div className="pt-4">
                    {user && !isAdmin && (
                      <Button 
                        size="lg"
                        className="bg-gradient-to-r from-neon-cyan via-neon-purple to-neon-pink text-white font-black text-lg px-8 py-4 rounded-xl border-2 border-neon-cyan hover:border-neon-purple transition-all duration-300 hover:scale-110 hover:rotate-1 shadow-2xl"
                        style={{ 
                          boxShadow: '0 0 30px hsl(var(--neon-cyan) / 0.6), 0 0 60px hsl(var(--neon-purple) / 0.4)',
                          animation: 'neon-pulse 2s ease-in-out infinite'
                        }}
                        onClick={() => navigate('/games')}
                      >
                        <Ticket className="mr-3 w-6 h-6" />
                        KOUPIT LÍSTEK
                        <Star className="ml-3 w-6 h-6" />
                      </Button>
                    )}
                    {!user && (
                      <Button 
                        size="lg"
                        variant="outline"
                        className="border-2 border-neon-cyan text-neon-cyan hover:bg-neon-cyan/10 font-bold text-lg px-8 py-4 rounded-xl transition-all duration-300 hover:scale-105"
                        onClick={() => navigate('/login')}
                      >
                        Přihlásit se pro hraní
                      </Button>
                    )}
                    {isAdmin && (
                      <div className="px-6 py-3 bg-amber-100/10 border-2 border-amber-400/30 rounded-xl">
                        <p className="text-amber-400 font-semibold">Admin režim - pouze pro čtení</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Dot indicators for multiple banners */}
              {megajackpotBanners.length > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  {megajackpotBanners.map((_, index) => (
                    <button
                      key={index}
                      className={`w-3 h-3 rounded-full transition-all duration-200 ${
                        index === currentBannerIndex 
                          ? 'bg-neon-cyan shadow-lg' 
                          : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                      }`}
                      onClick={() => setCurrentBannerIndex(index)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Fallback to default Megajackpot when no banners
            <div className="neon-ticket h-80 md:h-96 flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-transparent via-neon-cyan/5 to-neon-purple/5" />
              
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
              
              {/* Central content */}
              <div className="text-center space-y-6 z-10 px-8">
                <div className="flex items-center justify-center gap-4 mb-4">
                  <div className="text-6xl md:text-8xl animate-pulse">🎟️</div>
                  <div className="text-4xl md:text-6xl text-neon-cyan animate-bounce">⚡</div>
                </div>
                
                <h1 className="hero-title text-4xl md:text-7xl font-black leading-tight">
                  MEGA JACKPOT
                </h1>
                
                <div className="space-y-2">
                  <p className="text-xl md:text-2xl text-neon-purple font-bold">
                    Vyhrajte až 1,000,000 Kč!
                  </p>
                  <p className="text-base md:text-lg text-muted-foreground">
                    Kupte si lístek a staňte se milionářem ještě dnes
                  </p>
                </div>
                
                {/* CTA Button */}
                <div className="pt-4">
                  {user && !isAdmin && (
                    <Button 
                      size="lg"
                      className="bg-gradient-to-r from-neon-cyan via-neon-purple to-neon-pink text-white font-black text-lg px-8 py-4 rounded-xl border-2 border-neon-cyan hover:border-neon-purple transition-all duration-300 hover:scale-110 hover:rotate-1 shadow-2xl"
                      style={{ 
                        boxShadow: '0 0 30px hsl(var(--neon-cyan) / 0.6), 0 0 60px hsl(var(--neon-purple) / 0.4)',
                        animation: 'neon-pulse 2s ease-in-out infinite'
                      }}
                      onClick={() => navigate('/games')}
                    >
                      <Ticket className="mr-3 w-6 h-6" />
                      KOUPIT LÍSTEK
                      <Star className="ml-3 w-6 h-6" />
                    </Button>
                  )}
                  {!user && (
                    <Button 
                      size="lg"
                      variant="outline"
                      className="border-2 border-neon-cyan text-neon-cyan hover:bg-neon-cyan/10 font-bold text-lg px-8 py-4 rounded-xl transition-all duration-300 hover:scale-105"
                      onClick={() => navigate('/login')}
                    >
                      Přihlásit se pro hraní
                    </Button>
                  )}
                  {isAdmin && (
                    <div className="px-6 py-3 bg-amber-100/10 border-2 border-amber-400/30 rounded-xl">
                      <p className="text-amber-400 font-semibold">Admin režim - pouze pro čtení</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
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
                <Card className="coupon-card border-amber-400 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 relative overflow-hidden h-full">
                  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full -translate-x-2" />
                  <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full translate-x-2" />
                  <CardHeader className="pb-2">
                    <div className="h-4 bg-amber-200 dark:bg-amber-800 rounded animate-pulse mb-2" />
                    <div className="h-3 bg-amber-100 dark:bg-amber-900 rounded animate-pulse w-20" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-16 bg-amber-100 dark:bg-amber-900 rounded animate-pulse mb-2" />
                    <div className="h-3 bg-amber-200 dark:bg-amber-800 rounded animate-pulse" />
                  </CardContent>
                </Card>
              </div>
            ) : contests.length === 0 ? (
              // No contests message
              <div className="flex-none w-72">
                <Card className="coupon-card border-amber-400 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 relative overflow-hidden h-full">
                  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full -translate-x-2" />
                  <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full translate-x-2" />
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-bold text-amber-800 dark:text-amber-400">
                      Žádné aktivní soutěže
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-amber-600 dark:text-amber-500">
                      Momentálně nejsou k dispozici žádné aktivní soutěže
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              contests.map((contest) => (
                <div 
                  key={contest.id} 
                  className="flex-none w-72"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  <Card 
                    className={`coupon-card border-neon-purple bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 relative overflow-hidden transition-all duration-300 h-full ${
                      user && !isAdmin ? 'cursor-pointer hover-scale hover:shadow-lg hover:border-neon-purple hover:bg-gradient-to-r hover:from-purple-100 hover:to-pink-100 dark:hover:from-purple-800/30 dark:hover:to-pink-800/30' : 
                      !user ? 'cursor-pointer hover:opacity-80 hover:scale-[1.01]' : 
                      'opacity-90'
                    }`}
                    onClick={() => !isAdmin && handleContestClick(contest.id)}
                  >
                    {/* Coupon notches */}
                    <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full -translate-x-2" />
                    <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full translate-x-2" />
                    
                    <CardHeader className="pb-2">
                      {/* Contest Image */}
                      <div className="w-full h-32 rounded-lg overflow-hidden mb-3 bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center">
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
                          className={`w-full h-full flex items-center justify-center text-amber-600 dark:text-amber-400 ${contest.main_image ? 'hidden' : 'flex'}`}
                          style={{ display: contest.main_image ? 'none' : 'flex' }}
                        >
                          <div className="text-center">
                            <Trophy className="w-8 h-8 mx-auto mb-2" />
                            <span className="text-xs">Bez obrázku</span>
                          </div>
                        </div>
                      </div>

                      <CardTitle className="text-lg font-bold text-neon-purple">
                        {contest.title}
                      </CardTitle>
                      <div className="text-xs text-purple-600 dark:text-purple-400 font-mono">
                        #{contest.id.slice(0, 8)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Star className="w-4 h-4 text-neon-purple" />
                          <span className="text-sm font-medium text-neon-purple">
                            {contest.main_prize}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-purple-600 dark:text-purple-400">
                          <span>Tiketů: {contest.ticket_count.toLocaleString('cs-CZ')}</span>
                          <span>Cena: {contest.ticket_price} Miocoin</span>
                        </div>
                        <div className="border-t border-dashed border-neon-purple pt-2">
                          <div className="text-xs text-purple-600 dark:text-purple-400">
                            {user && !isAdmin ? 'Klikněte pro hraní her' : !user ? 'Přihlaste se pro hraní' : 'Contest zobrazení'}
                          </div>
                          {isAdmin && (
                            <div className="text-xs text-purple-500 mt-1">
                              Admin zobrazení - pouze pro čtení
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
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
                  Pouze čtění
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
            {vouchersLoading ? (
              // Loading placeholder
              <div className="flex-none w-64">
                <Card className="coupon-card border-pink-400 bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 relative overflow-hidden h-full">
                  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full -translate-x-2" />
                  <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full translate-x-2" />
                  <CardHeader className="pb-2">
                    <div className="h-4 bg-pink-200 dark:bg-pink-800 rounded animate-pulse mb-2" />
                    <div className="h-3 bg-pink-100 dark:bg-pink-900 rounded animate-pulse w-20" />
                  </CardHeader>
                  <CardContent>
                    <div className="h-16 bg-pink-100 dark:bg-pink-900 rounded animate-pulse mb-2" />
                    <div className="h-3 bg-pink-200 dark:bg-pink-800 rounded animate-pulse" />
                  </CardContent>
                </Card>
              </div>
            ) : homepageVouchers.length === 0 ? (
              // No vouchers message
              <div className="flex-none w-64">
                <Card className="coupon-card border-pink-400 bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 relative overflow-hidden h-full">
                  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full -translate-x-2" />
                  <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full translate-x-2" />
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-bold text-pink-800 dark:text-pink-400">
                      Žádné aktivní vouchery
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-pink-600 dark:text-pink-500">
                      Momentálně nejsou k dispozici žádné aktivní vouchery
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              homepageVouchers.map((voucher) => (
                <div 
                  key={voucher.id} 
                  className="flex-none w-64"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  <Card 
                    className={`coupon-card relative overflow-hidden transition-all duration-300 h-full border-neon-pink bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 ${
                      user && !isAdmin 
                        ? 'cursor-pointer hover-scale hover:shadow-lg hover:border-neon-pink hover:bg-gradient-to-r hover:from-pink-100 hover:to-rose-100 dark:hover:from-pink-800/30 dark:hover:to-rose-800/30' 
                        : !user
                          ? 'cursor-pointer hover:opacity-80 hover:scale-[1.01]'
                          : isAdmin
                            ? 'opacity-90'
                            : ''
                    }`}
                    onClick={() => !isAdmin && handleVoucherRedeem(voucher.id)}
                  >
                    {/* Banner image if available */}
                    {voucher.banner_url && (
                      <div className="h-24 overflow-hidden">
                        <img 
                          src={voucher.banner_url} 
                          alt={`${voucher.name} banner`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    {/* Coupon notches */}
                    <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full -translate-x-2" />
                    <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full translate-x-2" />
                    
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-3">
                        {voucher.image_url && (
                          <img 
                            src={voucher.image_url} 
                            alt={voucher.name}
                            className="w-8 h-8 object-cover rounded-lg flex-shrink-0"
                          />
                        )}
                        <CardTitle className="text-lg font-bold text-neon-pink">
                          {voucher.name}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-bold text-neon-pink">
                            Zbývá: {getRemainingCount(voucher)}
                          </span>
                          <div className="px-2 py-1 rounded text-xs font-medium bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400">
                            Dostupný
                          </div>
                        </div>
                        <div className="border-t border-dashed border-neon-pink pt-2">
                          <div className="text-xs text-pink-600 dark:text-pink-400">
                            {user && !isAdmin 
                              ? 'Klikněte pro uplatnění' 
                              : !user
                                ? 'Přihlaste se pro uplatnění'
                                : 'Admin zobrazení - pouze pro čtení'
                            }
                          </div>
                          {isAdmin && (
                            <div className="text-xs mt-1 text-green-500">
                              Admin zobrazení - pouze pro čtení
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Partners Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-neon-cyan flex items-center gap-2">
              <Handshake className="w-6 h-6" />
              Naši partneři, kde můžete získat MioCoiny za nákup
            </h3>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {partnersLoading ? (
              // Loading placeholder
              Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="aspect-square bg-muted rounded-lg animate-pulse" />
              ))
            ) : partners.length === 0 ? (
              // No partners message
              <div className="col-span-full text-center py-12">
                <div className="text-muted-foreground">
                  Momentálně nejsou k dispozici žádní partneři
                </div>
              </div>
            ) : (
              partners.map((partner) => (
                <div
                  key={partner.id}
                  className="aspect-square bg-card border border-border rounded-lg overflow-hidden cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-lg hover:border-neon-cyan group"
                  onClick={() => window.open(partner.website_url, '_blank')}
                >
                  <div className="w-full h-full p-4 flex items-center justify-center relative">
                    <img
                      src={partner.logo_url}
                      alt={partner.name}
                      className="max-w-full max-h-full object-contain transition-all duration-300 group-hover:scale-110"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        if (target.nextElementSibling) {
                          (target.nextElementSibling as HTMLElement).style.display = 'flex';
                        }
                      }}
                    />
                    <div className="hidden w-full h-full flex-col items-center justify-center text-muted-foreground">
                      <span className="text-xs text-center">{partner.name}</span>
                    </div>
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <ExternalLink className="w-4 h-4 text-neon-cyan" />
                    </div>
                  </div>
                </div>
              ))
            )}
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