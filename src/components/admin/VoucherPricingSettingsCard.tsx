import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useVoucherPrice } from '@/lib/voucherPricing';

/**
 * Přepínač „Placené vouchery“ (settings.voucher_paid_enabled, výchozí 'false').
 * Vypnuto = vouchery zdarma („Získat slevu“), zapnuto = 5 MIO („Koupit za 5 MIO“).
 * Cenu strhává buy_voucher_atomic přes get_voucher_price_mio(); web čte tutéž funkci.
 * Zápis do `settings` smí jen superadmin (RLS).
 */
export const VoucherPricingSettingsCard: React.FC = () => {
  const price = useVoucherPrice();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const paid = price > 0;

  const toggle = async (value: boolean) => {
    setSaving(true);
    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'voucher_paid_enabled', value: value ? 'true' : 'false', updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSaving(false);
    if (error) {
      toast({ title: 'Chyba', description: 'Nastavení se nepodařilo uložit.', variant: 'destructive' });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['voucher-price-mio'] });
    toast({
      title: value ? 'Placené vouchery zapnuty' : 'Vouchery jsou zdarma',
      description: value ? 'Zákazník zaplatí 5 MIO za voucher.' : 'Zákazník získá voucher zdarma („Získat slevu“).',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Placené vouchery</CardTitle>
        <CardDescription>
          Vypnuto = vouchery jsou pro zákazníky zdarma. Zapnuto = voucher stojí 5 MIO.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="text-sm">
          Teď: <strong>{paid ? `${price} MIO za voucher` : 'zdarma'}</strong>
          <span className="text-muted-foreground"> · tlačítko „{paid ? `Koupit za ${price} MIO` : 'Získat slevu'}“</span>
        </div>
        <Switch
          checked={paid}
          disabled={saving}
          onCheckedChange={(value) => void toggle(value)}
          aria-label="Placené vouchery"
        />
      </CardContent>
    </Card>
  );
};

export default VoucherPricingSettingsCard;
