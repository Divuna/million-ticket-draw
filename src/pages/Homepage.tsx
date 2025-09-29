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
import { useHomepageBanners } from '@/hooks/useHomepageBanners';
import { usePartners } from '@/hooks/usePartners';
import { useHomepageVideoSimple } from '@/hooks/useHomepageVideoSimple';
import YouTubeEmbed from '@/components/YouTubeEmbed';
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
  const { voucherBanner, gamesBanner, loading: homepageBannersLoading } = useHomepageBanners();
  const { partners, loading: partnersLoading } = usePartners();
  const { videoUrl, isActive: isVideoActive, loading: videoLoading } = useHomepageVideoSimple();
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

  // Continuous auto-scroll for contests and vouchers (infinite loop)
  useEffect(() => {
    const startAutoScroll = (ref: React.RefObject<HTMLDivElement>, speed: number) => {
      const el = ref.current;
      if (!el) return;
      // Only start if there is something to scroll
      if (el.scrollWidth <= el.clientWidth + 8) return;

      let rafId = 0;
      const step = () => {
        el.scrollLeft += speed;
        const half = el.scrollWidth / 2;
        
        if (speed > 0) {
          // Moving right (contests)
          if (half > 0 && el.scrollLeft >= half) {
            el.scrollLeft -= half;
          }
        } else {
          // Moving left (vouchers)
          if (el.scrollLeft <= 0) {
            el.scrollLeft = half;
          }
        }
        
        rafId = requestAnimationFrame(step);
      };

      rafId = requestAnimationFrame(step);
      return () => cancelAnimationFrame(rafId);
    };

    const stopContests = startAutoScroll(contestsCarouselRef, 0.8);
    const stopVouchers = startAutoScroll(vouchersCarouselRef, -0.8);

    return () => {
      stopContests && stopContests();
      stopVouchers && stopVouchers();
    };
  }, [contests.length, homepageVouchers.length]);

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
            <div className="h-80 md:h-96 bg-muted/30 animate-pulse rounded-lg" />
          ) : megajackpotBanners.length > 0 ? (
            // Banner display with carousel for multiple banners
            <div className="relative">
              <div className="h-80 md:h-96 relative overflow-hidden rounded-lg">
                {/* Banner image */}
                <img 
                  src={megajackpotBanners[currentBannerIndex]?.image_url}
                  alt={megajackpotBanners[currentBannerIndex]?.title || 'Banner'}
                  className="w-full h-full object-cover"
                />
                
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
          ) : null}
        </section>

        {/* Dynamic Banners */}
        {(voucherBanner || gamesBanner) && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Voucher Banner */}
            {voucherBanner && (
              <div 
                className={`relative rounded-lg overflow-hidden transition-all duration-200 ${
                  user && !isAdmin ? 'cursor-pointer hover:scale-105' : ''
                }`} 
                onClick={() => !isAdmin && navigate('/vouchers')}
              >
                <img 
                  src={voucherBanner.image_url} 
                  alt={voucherBanner.title}
                  className="w-full h-64 md:h-80 object-cover"
                />
                {isAdmin && (
                  <div className="absolute top-2 right-2 px-2 py-1 bg-amber-100/10 border border-amber-400/30 rounded text-xs text-amber-400">
                    Pouze čtení
                  </div>
                )}
              </div>
            )}

            {/* Games Banner */}
            {gamesBanner && (
              <div 
                className={`relative rounded-lg overflow-hidden transition-all duration-200 ${
                  user && !isAdmin ? 'cursor-pointer hover:scale-105' : ''
                }`} 
                onClick={() => !isAdmin && navigate('/games')}
              >
                <img 
                  src={gamesBanner.image_url} 
                  alt={gamesBanner.title}
                  className="w-full h-64 md:h-80 object-cover"
                />
                {isAdmin && (
                  <div className="absolute top-2 right-2 px-2 py-1 bg-amber-100/10 border border-amber-400/30 rounded text-xs text-amber-400">
                    Pouze čtení
                  </div>
                )}
              </div>
            )}
          </section>
        )}

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
              scrollSnapType: 'none',
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
              // Duplicate content for infinite loop
              [...contests, ...contests].map((contest, index) => (
                <div 
                  key={`${contest.id}-${index}`} 
                  className="flex-none w-72"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  <div 
                    className={`neon-ticket ticket-perforations relative overflow-hidden bg-gradient-to-br from-red-600/90 to-red-800/95 border-2 border-red-400/40 rounded-xl shadow-lg shadow-red-500/30 transition-all duration-300 h-96 ${
                      user && !isAdmin 
                        ? 'cursor-pointer hover-scale hover:shadow-xl hover:shadow-red-500/40 hover:border-red-400/60' 
                        : !user
                          ? 'cursor-pointer hover:opacity-80 hover:scale-[1.02]'
                          : isAdmin
                            ? 'opacity-90'
                            : ''
                    }`}
                    onClick={() => !isAdmin && handleContestClick(contest.id)}
                  >
                    {/* Ticket perforations on sides */}
                    <div className="absolute top-0 left-0 w-4 h-4 bg-background transform rotate-45 -translate-x-2 -translate-y-2"></div>
                    <div className="absolute top-0 right-0 w-4 h-4 bg-background transform rotate-45 translate-x-2 -translate-y-2"></div>
                    <div className="absolute bottom-0 left-0 w-4 h-4 bg-background transform rotate-45 -translate-x-2 translate-y-2"></div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 bg-background transform rotate-45 translate-x-2 translate-y-2"></div>
                    
                    {/* Top 60% - Contest Image */}
                    <div className="h-[60%] relative overflow-hidden">
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
                        className={`w-full h-full flex items-center justify-center text-red-200 ${contest.main_image ? 'hidden' : 'flex'} bg-red-700/50`}
                        style={{ display: contest.main_image ? 'none' : 'flex' }}
                      >
                        <div className="text-center">
                          <Trophy className="w-12 h-12 mx-auto mb-2" />
                          <span className="text-sm">Bez obrázku</span>
                        </div>
                      </div>
                      
                      {/* Contest ID overlay */}
                      <div className="absolute top-3 right-3 bg-red-900/80 text-red-100 text-xs px-2 py-1 rounded border border-red-400/30">
                        #{contest.id.slice(0, 8)}
                      </div>
                    </div>

                    {/* Bottom 40% - Contest Information */}
                    <div className="h-[40%] p-4 flex flex-col justify-between bg-gradient-to-b from-red-800/20 to-red-900/40">
                      {/* Contest title */}
                      <div>
                        <h3 className="text-white font-bold text-lg mb-1 line-clamp-2">
                          {contest.title}
                        </h3>
                        
                        {/* Main prize */}
                        <div className="flex items-center gap-2 mb-2">
                          <Star className="w-4 h-4 text-yellow-300" />
                          <span className="text-sm font-medium text-yellow-300 line-clamp-1">
                            {contest.main_prize}
                          </span>
                        </div>
                      </div>

                      {/* Contest details and action */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-red-200">
                          <span>Tiketů: {contest.ticket_count.toLocaleString('cs-CZ')}</span>
                          <span>Cena: {contest.ticket_price} Miocoin</span>
                        </div>
                        
                        <div className="border-t border-dashed border-red-300/40 pt-2">
                          <div className="text-xs text-red-200">
                            {user && !isAdmin ? 'Klikněte pro hraní her' : !user ? 'Přihlaste se pro hraní' : 'Contest zobrazení'}
                          </div>
                          {isAdmin && (
                            <div className="text-xs text-red-300 mt-1">
                              Admin zobrazení - pouze pro čtení
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
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
              scrollSnapType: 'none',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            {vouchersLoading ? (
              // Loading placeholder
              <div className="flex-none w-80">
                <div className="neon-ticket ticket-perforations relative overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 border-2 border-neon-pink/30 rounded-xl shadow-lg shadow-primary/20 p-6 h-full">
                  <div className="space-y-4">
                    <div className="h-6 bg-neon-pink/20 rounded animate-pulse mb-2" />
                    <div className="h-4 bg-neon-pink/10 rounded animate-pulse w-24" />
                    <div className="h-12 bg-neon-pink/20 rounded animate-pulse mb-4" />
                    <div className="h-10 bg-neon-pink/30 rounded animate-pulse" />
                  </div>
                  
                  {/* Decorative corner cuts */}
                  <div className="absolute top-0 left-0 w-4 h-4 bg-background transform rotate-45 -translate-x-2 -translate-y-2"></div>
                  <div className="absolute top-0 right-0 w-4 h-4 bg-background transform rotate-45 translate-x-2 -translate-y-2"></div>
                  <div className="absolute bottom-0 left-0 w-4 h-4 bg-background transform rotate-45 -translate-x-2 translate-y-2"></div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 bg-background transform rotate-45 translate-x-2 translate-y-2"></div>
                </div>
              </div>
            ) : homepageVouchers.length === 0 ? (
              // No vouchers message
              <div className="flex-none w-80">
                <div className="neon-ticket ticket-perforations relative overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 border-2 border-neon-pink/30 rounded-xl shadow-lg shadow-primary/20 p-6 h-full">
                  <div className="space-y-4 text-center">
                    <h3 className="text-xl font-bold text-neon-pink">Žádné aktivní vouchery</h3>
                    <div className="text-sm text-muted-foreground">
                      Momentálně nejsou k dispozici žádné aktivní vouchery
                    </div>
                  </div>
                  
                  {/* Decorative corner cuts */}
                  <div className="absolute top-0 left-0 w-4 h-4 bg-background transform rotate-45 -translate-x-2 -translate-y-2"></div>
                  <div className="absolute top-0 right-0 w-4 h-4 bg-background transform rotate-45 translate-x-2 -translate-y-2"></div>
                  <div className="absolute bottom-0 left-0 w-4 h-4 bg-background transform rotate-45 -translate-x-2 translate-y-2"></div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 bg-background transform rotate-45 translate-x-2 translate-y-2"></div>
                </div>
              </div>
            ) : (
              [...homepageVouchers, ...homepageVouchers].map((voucher, index) => (
                <div 
                  key={`${voucher.id}-${index}`} 
                  className="flex-none w-80"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  <div 
                    className={`neon-ticket ticket-perforations relative overflow-hidden bg-gradient-to-br from-red-600/90 to-red-800/95 border-2 border-red-400/40 rounded-xl shadow-lg shadow-red-500/30 transition-all duration-300 ${
                      user && !isAdmin 
                        ? 'cursor-pointer hover-scale hover:shadow-xl hover:shadow-red-500/40 hover:border-red-400/60' 
                        : !user
                          ? 'cursor-pointer hover:opacity-80 hover:scale-[1.02]'
                          : isAdmin
                            ? 'opacity-90'
                            : ''
                    }`}
                    onClick={() => !isAdmin && handleVoucherRedeem(voucher.id)}
                  >
                    <div className="flex h-48 relative">
                      {/* Left side - Content */}
                      <div className="flex-1 p-6 flex flex-col justify-between">
                        {/* Header */}
                        <div>
                          <h2 className="text-white font-bold text-xl tracking-wide mb-1">ONEMIL VOUCHER</h2>
                          <p className="text-red-200 text-sm font-medium">HRAJ O CENY</p>
                        </div>

                        {/* Voucher name and value */}
                        <div className="my-3">
                          <h3 className="text-white font-bold text-lg mb-2">{voucher.name}</h3>
                          <div className="text-yellow-300 font-bold text-3xl">
                            BONUS VOUCHER
                          </div>
                        </div>

                        {/* Button and status */}
                        <div className="space-y-2">
                          <Button
                            className="bg-white text-red-600 font-bold py-2 px-6 rounded-md hover:bg-red-50 transition-colors duration-200 w-fit disabled:bg-gray-300 disabled:text-gray-500"
                            disabled={isAdmin}
                          >
                            POUŽÍT VOUCHER
                          </Button>
                          
                          {/* Status indicator */}
                          <div className="text-xs text-red-200">
                            {user && !isAdmin 
                              ? 'Klikněte pro uplatnění' 
                              : !user
                                ? 'Přihlaste se pro uplatnění'
                                : 'Admin zobrazení - pouze pro čtení'
                            }
                          </div>
                        </div>
                      </div>

                      {/* Right side - Image */}
                      <div className="w-32 relative border-l-2 border-dashed border-red-300/40">
                        {voucher.image_url ? (
                          <img 
                            src={voucher.image_url} 
                            alt={voucher.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-red-700/50 flex items-center justify-center">
                            <span className="text-red-200 text-sm text-center px-2">VOUCHER</span>
                          </div>
                        )}
                      </div>

                      {/* Remaining count indicator */}
                      <div className="absolute top-3 right-3 bg-red-900/80 text-red-100 text-xs px-2 py-1 rounded border border-red-400/30">
                        Zbývá: {getRemainingCount(voucher)}
                      </div>
                    </div>
                  </div>
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

        {/* Instructional Video Section */}
        {!videoLoading && videoUrl && isVideoActive && (
          <section className="space-y-6 mt-16">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold text-neon-cyan flex items-center gap-2">
                <span className="w-6 h-6 text-neon-cyan">🎬</span>
                Jak to funguje
              </h3>
            </div>
            
            <div className="max-w-4xl mx-auto space-y-6">
              <YouTubeEmbed 
                url={videoUrl} 
                className="rounded-lg shadow-lg" 
              />
              
              <div className="text-center space-y-4 px-4">
                <h4 className="text-xl font-semibold text-foreground">
                  Jak hra funguje, co se vyhrává a jak probíhá nákup voucherů
                </h4>
                <div className="text-muted-foreground leading-relaxed max-w-2xl mx-auto">
                  <p className="mb-3">
                    🎯 <strong>Kupte tikety</strong> do soutěží o luxusní ceny za pouhý 1 MioCoin
                  </p>
                  <p className="mb-3">
                    🏆 <strong>Vyhrajte hlavní ceny</strong> jako jsou auta, dovolené nebo elektronika
                  </p>
                  <p className="mb-3">
                    🎁 <strong>Získejte bonusové výhry</strong> na každé 100. pozici tiketu
                  </p>
                  <p>
                    💳 <strong>Nakupte vouchery</strong> u našich partnerů a získejte MioCoiny za každý nákup
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

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