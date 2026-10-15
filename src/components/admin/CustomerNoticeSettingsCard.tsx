import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

/**
 * Vypínače automatických upozornění zákazníkům (redesign: notifikace a e-maily).
 * Hodnoty jsou v `settings` (výchozí 'false'); spouštěče v DB je čtou při každé události.
 * Zápis do `settings` smí jen superadmin (RLS) – karta se proto zobrazuje jen jemu.
 */
const NOTICES: Array<{ key: string; title: string; description: string }> = [
  {
    key: 'notice_push_mio_credited',
    title: 'Notifikace „MIO připsány“',
    description: 'Push po úspěšném dobití: „Na účet ti přibylo N MIO. Hodně štěstí!“',
  },
  {
    key: 'notice_email_payment_received',
    title: 'E-mail „Platba přijata“',
    description: 'Shrnutí platby (balíček, zaplaceno) po úspěšném dobití.',
  },
  {
    key: 'notice_push_support_reply',
    title: 'Notifikace „Nová zpráva od podpory“',
    description: 'Push po odpovědi podpory ve Zprávách (nejvýš jednou za 10 minut).',
  },
  {
    key: 'notice_email_voucher_code',
    title: 'E-mail s kódem voucheru',
    description: 'Po získání voucheru přijde e-mail „Voucher je tvůj“ s kódem.',
  },
];

export const CustomerNoticeSettingsCard: React.FC = () => {
  const [values, setValues] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', NOTICES.map((n) => n.key));
    if (!error) {
      const next: Record<string, boolean> = {};
      for (const row of data ?? []) next[row.key] = row.value === 'true';
      setValues(next);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (key: string, value: boolean) => {
    setSaving(key);
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value: value ? 'true' : 'false', updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSaving(null);
    if (error) {
      toast({ title: 'Nastavení se nepodařilo uložit', description: error.message, variant: 'destructive' });
      return;
    }
    setValues((prev) => ({ ...prev, [key]: value }));
    toast({ title: value ? 'Zapnuto' : 'Vypnuto', description: NOTICES.find((n) => n.key === key)?.title });
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Automatická upozornění zákazníkům</CardTitle>
        <CardDescription>
          Každé upozornění lze samostatně zapnout. Ve výchozím stavu je vše vypnuté. Push se pošle jen
          zákazníkům s povolenými notifikacemi; e-mail jde přes běžnou frontu e-mailů.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {NOTICES.map((n) => (
          <div key={n.key} className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{n.title}</p>
              <p className="text-xs text-muted-foreground">{n.description}</p>
            </div>
            <Switch
              checked={!!values[n.key]}
              disabled={loading || saving === n.key}
              onCheckedChange={(v) => void toggle(n.key, v)}
              aria-label={n.title}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default CustomerNoticeSettingsCard;
