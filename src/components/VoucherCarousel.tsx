import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4">
        {availableVouchers.map((voucher) => (
          <div key={voucher.id}>
            <Card className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-background via-background/70 to-muted/30 shadow-md hover:shadow-lg transition-all duration-300">
              {voucher.banner_url && (
                <img
                  src={voucher.banner_url}
                  alt={`${voucher.name} banner`}
                  className="w-full h-28 object-cover"
                  loading="lazy"
                />
              )}

              <CardContent className="p-6 space-y-5 text-center">
                {/* Centered image + title block */}
                <div className="flex flex-col items-center gap-3">
                  {voucher.image_url && (
                    <div className="flex-shrink-0">
                      <img
                        src={voucher.image_url}
                        alt={voucher.name}
                        className="w-14 h-14 object-cover rounded-xl border border-border/50 shadow-sm"
                        loading="lazy"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <h3 className="text-xl font-bold tracking-tight text-foreground leading-tight">
                      {voucher.name}
                    </h3>
                    {!isVoucherAvailable(voucher) && (
                      <Badge variant="destructive" className="mt-1.5">Nedostupný</Badge>
                    )}
                  </div>
                </div>

                {/* Remaining count */}
                <div className="py-1">
                  <p className="text-sm font-medium text-muted-foreground tracking-wide">
                    Zbývá: <span className="text-primary font-semibold">{getRemainingCount(voucher)}</span>
                  </p>
                </div>

                {/* Redesigned gold gradient button */}
                <div className="pt-1">
                  <Button
                    onClick={() => redeemVoucher(voucher.id)}
                    disabled={!isVoucherAvailable(voucher)}
                    className="w-full max-w-[220px] mx-auto h-12 text-base font-bold tracking-wide rounded-xl bg-gradient-to-r from-[hsl(45_80%_45%)] via-[hsl(40_85%_50%)] to-[hsl(35_80%_45%)] text-[hsl(220_30%_10%)] border border-[hsl(45_70%_55%/0.4)] shadow-[0_2px_12px_hsl(45_80%_50%/0.25)] hover:shadow-[0_4px_20px_hsl(45_80%_50%/0.35)] hover:brightness-110 transition-all duration-200"
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