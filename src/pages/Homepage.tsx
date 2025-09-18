import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { BottomNavigation } from '@/components/BottomNavigation';
import { AdminMenu } from '@/components/AdminMenu';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { Gift, Trophy, ChevronRight, Ticket, Star } from 'lucide-react';
import { toast } from 'sonner';

const Homepage = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();
  const contestsCarouselRef = useRef<HTMLDivElement>(null);
  const vouchersCarouselRef = useRef<HTMLDivElement>(null);

  // Smooth auto-scroll functionality for carousels (only for logged-in non-admin users)
  useEffect(() => {
    if (isAdmin || !user) return; // No auto-scroll for admin or non-logged-in users

    let contestsAnimationId: number;
    let vouchersAnimationId: number;
    let contestsLastTime = 0;
    let vouchersLastTime = 0;

    const smoothScrollCarousel = (
      ref: React.RefObject<HTMLDivElement>, 
      direction: 'left' | 'right',
      currentTime: number,
      lastTime: number
    ) => {
      if (!ref.current) return lastTime;
      
      const container = ref.current;
      const scrollSpeed = 0.15; // Much slower: 0.15 pixels per millisecond for calm movement
      const deltaTime = currentTime - lastTime;
      
      if (deltaTime > 25) { // ~40fps for smoother, calmer movement
        const scrollAmount = scrollSpeed * deltaTime;
        const currentScroll = container.scrollLeft;
        const maxScroll = container.scrollWidth - container.clientWidth;

        if (direction === 'right') {
          // Scroll right, reset to start when reaching end
          if (currentScroll >= maxScroll - 5) {
            container.scrollTo({ left: 0, behavior: 'auto' });
          } else {
            container.scrollBy({ left: scrollAmount, behavior: 'auto' });
          }
        } else {
          // Scroll left, reset to end when reaching start
          if (currentScroll <= 5) {
            container.scrollTo({ left: maxScroll, behavior: 'auto' });
          } else {
            container.scrollBy({ left: -scrollAmount, behavior: 'auto' });
          }
        }
        
        return currentTime;
      }
      return lastTime;
    };

    const animateContests = (currentTime: number) => {
      contestsLastTime = smoothScrollCarousel(
        contestsCarouselRef, 
        'right', 
        currentTime, 
        contestsLastTime
      );
      contestsAnimationId = requestAnimationFrame(animateContests);
    };

    const animateVouchers = (currentTime: number) => {
      vouchersLastTime = smoothScrollCarousel(
        vouchersCarouselRef, 
        'left', 
        currentTime, 
        vouchersLastTime
      );
      vouchersAnimationId = requestAnimationFrame(animateVouchers);
    };

    // Start smooth animations
    contestsAnimationId = requestAnimationFrame(animateContests);
    vouchersAnimationId = requestAnimationFrame(animateVouchers);

    return () => {
      cancelAnimationFrame(contestsAnimationId);
      cancelAnimationFrame(vouchersAnimationId);
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

  // Placeholder data for carousels
  const ongoingContests = [
    { id: '1', name: 'Luxusní Auto 2024', prize: 'BMW X5 M50i', couponCode: 'AUTO2024' },
    { id: '2', name: 'Million Cash', prize: '1,000,000 Kč', couponCode: 'CASH2024' },
    { id: '3', name: 'Dream House', prize: 'Rodinný dům v Praze', couponCode: 'HOUSE24' },
    { id: '4', name: 'Luxury Trip', prize: 'Dovolená na Maledivách', couponCode: 'TRIP2024' },
  ];

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
        {/* Main Banner */}
        <section className="w-full">
          <div className="h-64 md:h-80 bg-gradient-to-br from-purple-900/20 to-cyan-900/20 rounded-lg border border-neon-purple glow-purple flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse" />
            <div className="text-center space-y-4 z-10">
              <div className="text-6xl md:text-8xl animate-bounce">🎯</div>
              <h2 className="text-2xl md:text-4xl font-bold text-neon-cyan">
                Rotující Výhry
              </h2>
              <p className="text-lg text-muted-foreground">
                Placeholder pro rotující zobrazení hlavních cen
              </p>
              {/* Role-based messaging */}
              {isAdmin && (
                <div className="mt-4 px-4 py-2 bg-amber-100/10 border border-amber-400/30 rounded-lg">
                  <p className="text-sm text-amber-400">Admin zobrazení - všechny sekce jsou pouze pro čtení</p>
                </div>
              )}
              {!user && (
                <div className="mt-4 px-4 py-2 bg-blue-100/10 border border-blue-400/30 rounded-lg">
                  <p className="text-sm text-blue-400">Přihlaste se pro plnou interaktivitu</p>
                </div>
              )}
            </div>
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
            className={`flex gap-4 pb-4 ${isAdmin ? 'carousel-disabled overflow-x-auto' : 'overflow-x-hidden'}`}
            style={{ 
              scrollBehavior: user && !isAdmin ? 'auto' : 'smooth', 
              scrollSnapType: 'x mandatory',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            {ongoingContests.map((contest) => (
              <div 
                key={contest.id} 
                className="flex-none w-60 md:w-64"
                style={{ scrollSnapAlign: 'start' }}
              >
                <Card 
                  className={`coupon-card border-amber-400 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 relative overflow-hidden transition-all duration-300 h-full ${
                    user && !isAdmin ? 'cursor-pointer hover-scale hover:shadow-lg hover:border-amber-500 hover:bg-gradient-to-r hover:from-amber-100 hover:to-yellow-100 dark:hover:from-amber-800/30 dark:hover:to-yellow-800/30' : 
                    !user ? 'cursor-pointer hover:opacity-80 hover:scale-[1.01]' : 
                    'opacity-90'
                  }`}
                  onClick={() => !isAdmin && handleContestClick(contest.id)}
                >
                  {/* Coupon notches */}
                  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full -translate-x-2" />
                  <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full translate-x-2" />
                  
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-bold text-amber-800 dark:text-amber-400">
                      {contest.name}
                    </CardTitle>
                    <div className="text-xs text-amber-600 dark:text-amber-500 font-mono">
                      #{contest.couponCode}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 text-amber-500" />
                        <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                          {contest.prize}
                        </span>
                      </div>
                      <div className="border-t border-dashed border-amber-300 pt-2">
                        <div className="text-xs text-amber-600 dark:text-amber-500">
                          {user && !isAdmin ? 'Klikněte pro hraní her' : !user ? 'Přihlaste se pro hraní' : 'Placeholder obsah'}
                        </div>
                        {isAdmin && (
                          <div className="text-xs text-amber-500 mt-1">
                            Admin zobrazení - pouze pro čtení
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
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
            className={`flex gap-4 pb-4 ${isAdmin ? 'carousel-disabled overflow-x-auto' : 'overflow-x-hidden'}`}
            style={{ 
              scrollBehavior: user && !isAdmin ? 'auto' : 'smooth', 
              scrollSnapType: 'x mandatory',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            {userVouchers.map((voucher) => (
              <div 
                key={voucher.id} 
                className="flex-none w-56 md:w-60"
                style={{ scrollSnapAlign: 'start' }}
              >
                <Card 
                  className={`coupon-card relative overflow-hidden transition-all duration-300 h-full ${
                    voucher.status === 'available' 
                      ? 'border-green-400 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20' 
                      : 'border-gray-400 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/20 dark:to-slate-900/20 opacity-60'
                  } ${
                    user && !isAdmin && voucher.status === 'available' 
                      ? 'cursor-pointer hover-scale hover:shadow-lg hover:border-green-500 hover:bg-gradient-to-r hover:from-green-100 hover:to-emerald-100 dark:hover:from-green-800/30 dark:hover:to-emerald-800/30' 
                      : !user && voucher.status === 'available'
                        ? 'cursor-pointer hover:opacity-80 hover:scale-[1.01]'
                        : voucher.status === 'available' && isAdmin
                          ? 'opacity-90'
                          : ''
                  }`}
                  onClick={() => !isAdmin && voucher.status === 'available' && handleVoucherRedeem(voucher.id)}
                >
                  {/* Coupon notches */}
                  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full -translate-x-2" />
                  <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-background rounded-full translate-x-2" />
                  
                  <CardHeader className="pb-2">
                    <CardTitle className={`text-lg font-bold ${
                      voucher.status === 'available' 
                        ? 'text-green-800 dark:text-green-400' 
                        : 'text-gray-800 dark:text-gray-400'
                    }`}>
                      {voucher.name}
                    </CardTitle>
                    <div className={`text-xs font-mono ${
                      voucher.status === 'available' 
                        ? 'text-green-600 dark:text-green-500' 
                        : 'text-gray-600 dark:text-gray-500'
                    }`}>
                      #{voucher.code}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`text-2xl font-bold ${
                          voucher.status === 'available' 
                            ? 'text-green-700 dark:text-green-300' 
                            : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          {voucher.value}
                        </span>
                        <div className={`px-2 py-1 rounded text-xs font-medium ${
                          voucher.status === 'available' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                        }`}>
                          {voucher.status === 'available' ? 'Dostupný' : 'Použitý'}
                        </div>
                      </div>
                      <div className={`border-t border-dashed pt-2 ${
                        voucher.status === 'available' 
                          ? 'border-green-300' 
                          : 'border-gray-300'
                      }`}>
                        <div className={`text-xs ${
                          voucher.status === 'available' 
                            ? 'text-green-600 dark:text-green-500' 
                            : 'text-gray-600 dark:text-gray-500'
                        }`}>
                          {voucher.status === 'available' && user && !isAdmin 
                            ? 'Klikněte pro uplatnění' 
                            : voucher.status === 'used' 
                              ? 'Voucher již použit' 
                              : 'Placeholder obsah'
                          }
                        </div>
                        {isAdmin && (
                          <div className={`text-xs mt-1 ${
                            voucher.status === 'available' 
                              ? 'text-green-500' 
                              : 'text-gray-500'
                          }`}>
                            Admin zobrazení - pouze pro čtení
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
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