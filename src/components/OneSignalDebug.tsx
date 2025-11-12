import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useOneSignal } from '@/hooks/useOneSignal';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, Bell, Database } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

export const OneSignalDebug: React.FC = () => {
  const { user } = useAuth();
  const { playerId, isInitialized, permissionState } = useOneSignal(user?.id);
  const [deviceCount, setDeviceCount] = useState<number>(0);
  const [appId, setAppId] = useState<string>('');
  const [settingKey, setSettingKey] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const previousPermission = useRef<string>('unknown');

  // Show toast when permission changes
  useEffect(() => {
    if (previousPermission.current === permissionState) return;

    if (permissionState === 'granted' && previousPermission.current !== 'unknown') {
      toast({
        title: '🔔 Oprávnění k notifikacím povoleno',
        description: 'Push notifikace jsou nyní aktivní',
        duration: 3000,
      });
    } else if (permissionState === 'denied') {
      toast({
        title: '⚠️ Oprávnění odmítnuto – povolte v nastavení prohlížeče',
        description: 'Bez oprávnění nelze přijímat push notifikace',
        variant: 'destructive',
        duration: 3000,
      });
    }

    previousPermission.current = permissionState;
  }, [permissionState]);

  useEffect(() => {
    fetchAppId();
    
    if (user?.id) {
      fetchDeviceCount();
    }
  }, [user?.id]);

  const fetchAppId = async () => {
    const host = window.location.hostname;
    const isProd = host === "app.onemil.cz";
    const key = isProd ? "onesignal_app_id" : "onesignal_app_id_dev";
    setSettingKey(key);
    
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .single();
    
    if (data?.value) {
      setAppId(data.value);
    }
  };

  const fetchDeviceCount = async () => {
    if (!user?.id) return;

    const { count, error } = await supabase
      .from('user_devices')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (!error && count !== null) {
      setDeviceCount(count);
    }
  };

  const handleManualSave = async () => {
    if (!user?.id || !playerId) {
      console.warn('⚠️ Nelze uložit: chybí userId nebo playerId');
      return;
    }

    setLoading(true);
    try {
      // Check if exists
      const { data: existing } = await supabase
        .from('user_devices')
        .select('id')
        .eq('user_id', user.id)
        .eq('player_id', playerId)
        .maybeSingle();

      if (existing?.id) {
        // Update
        await supabase
          .from('user_devices')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        console.log('✅ Zařízení aktualizováno');
      } else {
        // Insert
        await supabase
          .from('user_devices')
          .insert({
            user_id: user.id,
            player_id: playerId,
            device_type: 'web',
          });
        console.log('✅ Zařízení uloženo');
      }

      await fetchDeviceCount();
    } catch (error) {
      console.error('❌ Chyba při ukládání:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPermissionBadge = () => {
    const variants: Record<string, 'default' | 'destructive' | 'outline' | 'secondary'> = {
      granted: 'default',
      denied: 'destructive',
      default: 'secondary',
      unknown: 'outline',
    };

    return (
      <Badge variant={variants[permissionState] || 'outline'}>
        {permissionState === 'granted' && '✅'}
        {permissionState === 'denied' && '⛔'}
        {permissionState === 'default' && '❓'}
        {permissionState === 'unknown' && '⏳'}
        {' '}
        {permissionState}
      </Badge>
    );
  };

  const handleResetOneSignal = async () => {
    try {
      console.log("🔄 Resetuji OneSignal...");
      
      // 1. OptOut
      try {
        await window.OneSignal?.User?.PushSubscription?.optOut?.();
      } catch (e) {
        console.warn("⚠️ OptOut selhalo:", e);
      }
      
      // 2. Unregister SW
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          regs
            .filter(r => /OneSignalSDK/.test(r.active?.scriptURL || ''))
            .map(r => r.unregister())
        );
      } catch (e) {
        console.warn("⚠️ SW unregister selhalo:", e);
      }
      
      // 3. Clear cache
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter(k => k.toLowerCase().includes('onesignal'))
            .map(k => caches.delete(k))
        );
      } catch (e) {
        console.warn("⚠️ Cache clear selhalo:", e);
      }
      
      // 4. Clear localStorage & IndexedDB
      try {
        Object.keys(localStorage).forEach(k => {
          if (k.toLowerCase().includes('onesignal') || k.toLowerCase().startsWith('os_')) {
            localStorage.removeItem(k);
          }
        });
        indexedDB?.deleteDatabase('OneSignalSDKStore');
        indexedDB?.deleteDatabase('OneSignalIndexedDB');
      } catch (e) {
        console.warn("⚠️ Storage clear selhalo:", e);
      }
      
      toast({
        title: '✅ OneSignal resetován',
        description: 'Obnovte stránku (F5) a znovu potvrďte oprávnění k notifikacím.',
        duration: 5000,
      });
    } catch (e) {
      console.error("❌ Reset selhal:", e);
      toast({
        title: '❌ Chyba při resetu',
        description: String(e),
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          OneSignal Debug Panel
        </CardTitle>
        <CardDescription>
          Diagnostika push notifikací - stav inicializace a uložení do databáze
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Inicializace</p>
            <Badge variant={isInitialized ? 'default' : 'secondary'}>
              {isInitialized ? '✅ Inicializováno' : '⏳ Neinicializováno'}
            </Badge>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Oprávnění prohlížeče</p>
            {getPermissionBadge()}
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Player ID</p>
            <code className="text-xs bg-muted px-2 py-1 rounded">
              {playerId || 'není dostupné'}
            </code>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Uživatel</p>
            <Badge variant={user ? 'default' : 'outline'}>
              {user ? '✅ Přihlášen' : '❌ Nepřihlášen'}
            </Badge>
          </div>
        </div>

        {/* App ID */}
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            OneSignal App ID 
            {settingKey && <span className="ml-2 text-xs">({settingKey})</span>}
          </p>
          <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto">
            {appId || 'nenačteno'}
          </code>
        </div>

        {/* Device Count */}
        {user && (
          <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">Zařízení v DB pro tohoto uživatele:</span>
            </div>
            <Badge variant="outline" className="text-base">
              {deviceCount}
            </Badge>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2 flex-wrap">
          <Button
            onClick={async () => {
              console.log("🖱️ Žádám o oprávnění přes OneSignal...");
              console.log("🔎 Aktuální permissionState:", permissionState);
              try {
                toast({ title: 'Žádost o oprávnění', description: 'Otevírám systémové dialogy...', duration: 2000 });
                await window.OneSignal?.User?.PushSubscription?.optIn();
                console.log("✅ optIn() zavolán");
                await new Promise(r => setTimeout(r, 1000));
                const rp = await window.OneSignal?.Notifications?.permission;
                const mapped = rp === true ? 'granted' : rp === false ? 'default' : (rp === 'prompt' ? 'default' : rp);
                console.log("🔎 Permission po optIn:", mapped);
                toast({ title: 'Stav oprávnění', description: String(mapped), duration: 2500 });
              } catch (e) {
                console.error("❌ optIn() selhal:", e);
                toast({ title: 'Chyba při žádosti o oprávnění', description: String(e), variant: 'destructive' });
              }
            }}
            disabled={!isInitialized || permissionState === 'granted'}
            size="sm"
            variant="outline"
          >
            <Bell className="w-4 h-4 mr-2" />
            Vyžádat oprávnění
          </Button>
          <Button
            onClick={handleManualSave}
            disabled={!user || !playerId || loading}
            size="sm"
            variant="outline"
          >
            <Database className="w-4 h-4 mr-2" />
            Uložit do DB ručně
          </Button>
          <Button
            onClick={() => {
              fetchDeviceCount();
              fetchAppId();
            }}
            disabled={!user}
            size="sm"
            variant="ghost"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            onClick={handleResetOneSignal}
            size="sm"
            variant="destructive"
            className="ml-auto"
          >
            Reset OneSignal
          </Button>
        </div>

        {/* Hints */}
        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
          <p>💡 Pokud je Player ID "není dostupné", zkontrolujte konzoli prohlížeče.</p>
          <p>💡 Pokud je oprávnění "denied", povolte notifikace v nastavení prohlížeče.</p>
          <p>💡 Pokud je počet zařízení 0 i přes Player ID, zkontrolujte RLS policies v Supabase.</p>
          <p>💡 Pokud vidíte chybu "AppID doesn't match" nebo "Can only be used on", klikněte na Reset OneSignal.</p>
          <p>💡 Na <strong>app.onemil.cz</strong> se používá PROD App ID, jinde DEV App ID.</p>
        </div>
      </CardContent>
    </Card>
  );
};
