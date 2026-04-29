import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import './ContestCard.css';

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

    try {
      await supabase.rpc('ensure_wallet_exists', { p_user_id: user.id });

      const { data, error } = await supabase.rpc('buy_voucher_atomic', {
        p_user_id: user.id,
        p_voucher_id: voucherId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };

      if (!result.success) {
        toast.error(result.error || 'Chyba při uplatnění voucheru');
        return;
      }

      toast.success('Voucher byl úspěšně uplatněn!');
      fetchVouchers();
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
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4">
        {availableVouchers.map((voucher) => (
          <div key={voucher.id}>
            <Card className="voucher-card-glow relative overflow-hidden rounded-[20px] bg-gradient-to-b from-[hsl(40_20%_14%)] via-[hsl(40_15%_10%)] to-[hsl(40_12%_7%)] border-[3px] border-[hsl(40_30%_35%)] shadow-[0_4px_16px_hsl(222_50%_3%/0.5)] transition-all duration-300 hover:border-[hsl(40_40%_45%)] hover:shadow-[0_0_12px_hsl(40_30%_40%/0.2)] hover:scale-[1.02]">
              {voucher.banner_url && (
                <img
                  src={voucher.banner_url}
                  alt={`${voucher.name} banner`}
                  className="w-full h-28 object-cover"
                  loading="lazy"
                />
              )}

              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-4">
                  {voucher.image_url && (
                    <div className="flex-shrink-0">
                      <img
                        src={voucher.image_url}
                        alt={voucher.name}
                        className="w-12 h-12 object-cover rounded-lg border border-[hsl(40_30%_35%)]"
                        loading="lazy"
                      />
                    </div>
                  )}

                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-heading-gold">{voucher.name}</h3>
                    {!isVoucherAvailable(voucher) && (
                      <Badge variant="destructive" className="mt-1">Nedostupný</Badge>
                    )}
                  </div>
                </div>

                <div className="text-center py-1">
                  <div className="text-lg font-medium text-heading-gold">
                    Zbývá: {getRemainingCount(voucher)}
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    onClick={() => redeemVoucher(voucher.id)}
                    disabled={!isVoucherAvailable(voucher)}
                    className="w-full h-11 text-base font-semibold rounded-xl bg-gradient-to-r from-[hsl(45_80%_45%)] via-[hsl(40_85%_50%)] to-[hsl(35_80%_45%)] text-secondary-foreground shadow-[0_2px_12px_hsl(45_80%_50%/0.25)] hover:shadow-[0_4px_16px_hsl(45_80%_50%/0.35)] hover:brightness-110 transition-all"
                  >
                    POUŽÍT VOUCHER
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
};