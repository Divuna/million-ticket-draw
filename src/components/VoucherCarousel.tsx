import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface Voucher {
  id: string;
  name: string;
  image_url: string | null;
  banner_url: string | null;
  max_quantity: number | null;
  redeemed_count: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export const VoucherCarousel: React.FC = () => {
  const { user } = useAuth();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVouchers();
  }, []);

  const fetchVouchers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('vouchers')
        .select('id, name, image_url, banner_url, max_quantity, redeemed_count, start_date, end_date, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVouchers(data || []);
    } catch (error: any) {
      console.error('Error fetching vouchers:', error);
      toast.error('Chyba při načítání voucherů');
    } finally {
      setLoading(false);
    }
  };

  const redeemVoucher = async (voucherId: string) => {
    if (!user) return;

    const voucher = vouchers.find(v => v.id === voucherId);
    if (!voucher) return;

    // Check if limited voucher is exhausted
    if (voucher.max_quantity && voucher.redeemed_count >= voucher.max_quantity) {
      toast.error('Tento voucher již není dostupný');
      return;
    }

    // Check if user already redeemed this voucher
    const { data: existingRedemption } = await supabase
      .from('user_vouchers')
      .select('id')
      .eq('user_id', user.id)
      .eq('voucher_id', voucherId)
      .eq('redeemed', true)
      .maybeSingle();

    if (existingRedemption) {
      toast.error('Tento voucher jste již uplatnili');
      return;
    }

    try {
      // Create redemption record - the database trigger will handle redeemed_count update automatically
      const { error: redemptionError } = await supabase
        .from('user_vouchers')
        .insert({
          user_id: user.id,
          voucher_id: voucherId,
          redeemed: true
        });

      if (redemptionError) throw redemptionError;

      toast.success('Voucher byl úspěšně uplatněn!');
      fetchVouchers(); // Refresh the list
    } catch (error: any) {
      console.error('Error redeeming voucher:', error);
      toast.error('Chyba při uplatnění voucheru');
    }
  };

  const getRemainingCount = (voucher: Voucher) => {
    if (!voucher.max_quantity) return 'Neomezeně';
    const remaining = voucher.max_quantity - voucher.redeemed_count;
    return remaining > 0 ? remaining : 0;
  };

  const isVoucherAvailable = (voucher: Voucher) => {
    const now = new Date();
    const startDate = voucher.start_date ? new Date(voucher.start_date) : null;
    const endDate = voucher.end_date ? new Date(voucher.end_date) : null;
    
    // Check date validity
    if (startDate && now < startDate) return false;
    if (endDate && now > endDate) return false;
    
    // Check quantity availability
    if (voucher.max_quantity && voucher.redeemed_count >= voucher.max_quantity) return false;
    
    return true;
  };

  // Filter vouchers: show unlimited vouchers always, limited ones only if available
  const availableVouchers = vouchers.filter(voucher => {
    if (!voucher.max_quantity) return true; // Unlimited vouchers always shown
    return voucher.redeemed_count < voucher.max_quantity; // Limited vouchers only if remaining
  });

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="mt-2 text-muted-foreground">Načítání voucherů...</p>
      </div>
    );
  }

  if (availableVouchers.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Momentálně nejsou dostupné žádné vouchery.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold hero-title text-center">Vaše Vouchery</h2>
      
      <Carousel className="w-full" opts={{ loop: true }}>
        <CarouselContent>
          {availableVouchers.map((voucher) => (
            <CarouselItem key={voucher.id} className="md:basis-1/2 lg:basis-1/3">
              <div className="coupon-card neon-ticket relative overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 border-2 border-neon-blue/30 rounded-xl shadow-lg shadow-primary/20 p-6">
                {/* Perforated edges */}
                <div className="ticket-perforations"></div>
                
                {/* Banner image if available */}
                {voucher.banner_url && (
                  <div className="mb-4 -mx-6 -mt-6">
                    <img 
                      src={voucher.banner_url} 
                      alt={`${voucher.name} banner`}
                      className="w-full h-24 object-cover"
                    />
                  </div>
                )}
                
                {/* Main content */}
                <div className="space-y-4">
                  {/* Header with logo and title */}
                  <div className="flex items-center gap-4">
                    {voucher.image_url && (
                      <div className="flex-shrink-0">
                        <img 
                          src={voucher.image_url} 
                          alt={voucher.name}
                          className="w-12 h-12 object-cover rounded-lg border border-neon-blue/30"
                        />
                      </div>
                    )}
                    
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-neon-blue">{voucher.name}</h3>
                      {!isVoucherAvailable(voucher) && (
                        <Badge variant="destructive" className="mt-1">Nedostupný</Badge>
                      )}
                    </div>
                  </div>
                  
                  {/* Value/remaining count */}
                  <div className="text-center py-2">
                    <div className="text-lg font-semibold text-neon-gold">
                      Zbývá: {getRemainingCount(voucher)}
                    </div>
                  </div>
                  
                  {/* Action button */}
                  <div className="pt-2">
                    <Button
                      onClick={() => redeemVoucher(voucher.id)}
                      disabled={!isVoucherAvailable(voucher)}
                      className="w-full h-12 text-lg font-bold bg-gradient-to-r from-neon-blue to-neon-purple hover:from-neon-purple hover:to-neon-blue border border-neon-blue/50 shadow-lg shadow-neon-blue/25 transition-all duration-300"
                      variant="outline"
                    >
                      POUŽÍT VOUCHER
                    </Button>
                  </div>
                </div>
                
                {/* Decorative corner cuts */}
                <div className="absolute top-0 left-0 w-4 h-4 bg-background transform rotate-45 -translate-x-2 -translate-y-2"></div>
                <div className="absolute top-0 right-0 w-4 h-4 bg-background transform rotate-45 translate-x-2 -translate-y-2"></div>
                <div className="absolute bottom-0 left-0 w-4 h-4 bg-background transform rotate-45 -translate-x-2 translate-y-2"></div>
                <div className="absolute bottom-0 right-0 w-4 h-4 bg-background transform rotate-45 translate-x-2 translate-y-2"></div>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  );
};