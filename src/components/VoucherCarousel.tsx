import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Infinity, Clock, Gift } from 'lucide-react';

interface VoucherData {
  id: string;
  code: string;
  value: number;
  image_url: string | null;
  banner_url: string | null;
  max_quantity: number | null;
  redeemed_count: number;
  remaining_vouchers: number | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  user_already_redeemed: boolean;
}

export const VoucherCarousel: React.FC = () => {
  const [vouchers, setVouchers] = useState<VoucherData[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);

  useEffect(() => {
    fetchAvailableVouchers();
  }, []);

  const fetchAvailableVouchers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .rpc('get_available_vouchers');

      if (error) throw error;
      setVouchers(data || []);
    } catch (error: any) {
      console.error('Error fetching vouchers:', error);
      toast.error('Chyba při načítání voucherů');
    } finally {
      setLoading(false);
    }
  };

  const handleRedeemVoucher = async (voucherId: string) => {
    try {
      setRedeeming(voucherId);
      
      const { data, error } = await supabase
        .rpc('redeem_voucher', { p_voucher_id: voucherId });

      if (error) throw error;

      const result = data as { success: boolean; message: string; redeemed_value?: number };
      
      if (result.success) {
        toast.success(`${result.message} (${result.redeemed_value} Kč)`);
        // Refresh voucher list to update remaining counts
        await fetchAvailableVouchers();
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      console.error('Error redeeming voucher:', error);
      toast.error('Chyba při uplatnění voucheru');
    } finally {
      setRedeeming(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('cs-CZ');
  };

  const getVoucherStatus = (voucher: VoucherData) => {
    if (voucher.user_already_redeemed) {
      return { label: 'Uplatněno', variant: 'secondary' as const, disabled: true };
    }
    if (!voucher.is_active) {
      return { label: 'Neaktivní', variant: 'destructive' as const, disabled: true };
    }
    return { label: 'Dostupný', variant: 'default' as const, disabled: false };
  };

  if (loading) {
    return (
      <div className="w-full p-6">
        <div className="flex items-center gap-2 mb-4">
          <Gift className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Dostupné Vouchery</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="animate-pulse">
                  <div className="h-48 bg-muted"></div>
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                    <div className="h-8 bg-muted rounded"></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (vouchers.length === 0) {
    return (
      <div className="w-full p-6">
        <div className="flex items-center gap-2 mb-4">
          <Gift className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Dostupné Vouchery</h2>
        </div>
        <Card>
          <CardContent className="p-8 text-center">
            <div className="flex flex-col items-center gap-2">
              <Gift className="h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-semibold">Žádné vouchery</h3>
              <p className="text-muted-foreground">
                Momentálně nejsou k dispozici žádné vouchery.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full p-6">
      <div className="flex items-center gap-2 mb-6">
        <Gift className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Dostupné Vouchery</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {vouchers.map((voucher) => {
          const status = getVoucherStatus(voucher);
          
          return (
            <Card key={voucher.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <CardContent className="p-0">
                {/* Main Voucher Image */}
                {voucher.image_url && (
                  <div className="relative">
                    <img 
                      src={voucher.image_url} 
                      alt={voucher.code}
                      className="w-full h-48 object-cover"
                    />
                    
                    {/* Banner Overlay */}
                    {voucher.banner_url && (
                      <div className="absolute top-2 right-2">
                        <img 
                          src={voucher.banner_url} 
                          alt={`${voucher.code} banner`}
                          className="w-20 h-12 object-cover rounded shadow-lg"
                        />
                      </div>
                    )}

                    {/* Status Badge */}
                    <div className="absolute top-2 left-2">
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                  </div>
                )}

                <div className="p-4 space-y-4">
                  {/* Voucher Info */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-lg">{voucher.code}</h3>
                      <span className="text-lg font-bold text-primary">
                        {voucher.value} Kč
                      </span>
                    </div>

                    {/* Remaining Count */}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {voucher.max_quantity === null ? (
                        <div className="flex items-center gap-1">
                          <Infinity className="h-4 w-4" />
                          <span>Neomezené množství</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-foreground">
                            {voucher.remaining_vouchers}
                          </span>
                          <span>zbývá z {voucher.max_quantity}</span>
                        </div>
                      )}
                    </div>

                    {/* Validity Period */}
                    {(voucher.start_date || voucher.end_date) && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {voucher.start_date && voucher.end_date ? (
                          <span>
                            Platné {formatDate(voucher.start_date)} - {formatDate(voucher.end_date)}
                          </span>
                        ) : voucher.end_date ? (
                          <span>Platné do {formatDate(voucher.end_date)}</span>
                        ) : voucher.start_date ? (
                          <span>Platné od {formatDate(voucher.start_date)}</span>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {/* Redeem Button */}
                  <Button
                    onClick={() => handleRedeemVoucher(voucher.id)}
                    disabled={status.disabled || redeeming === voucher.id || !voucher.is_active}
                    className="w-full"
                    variant={status.disabled ? "secondary" : "default"}
                  >
                    {redeeming === voucher.id ? (
                      'Uplatňuji...'
                    ) : voucher.user_already_redeemed ? (
                      'Již uplatněno'
                    ) : !voucher.is_active ? (
                      'Nedostupný'
                    ) : (
                      `Uplatnit voucher (${voucher.value} Kč)`
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};