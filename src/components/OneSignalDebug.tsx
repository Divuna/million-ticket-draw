import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useOneSignal } from '@/hooks/useOneSignal';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, Bell, Database } from 'lucide-react';

export const OneSignalDebug: React.FC = () => {
  const { user } = useAuth();
  const { playerId, isInitialized, requestPermission } = useOneSignal(user?.id);
  const [deviceCount, setDeviceCount] = useState<number>(0);
  const [appId, setAppId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  // Check permission state
  const updatePermission = () => {
    const currentPermission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
    setPermission(currentPermission);
  };

  useEffect(() => {
    fetchAppId();
    updatePermission();
    
    // Check permission every 2 seconds to detect changes
    const interval = setInterval(updatePermission, 2000);
    
    if (user?.id) {
      fetchDeviceCount();
    }

    return () => clearInterval(interval);
  }, [user?.id]);

  const fetchAppId = async () => {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'onesignal_app_id')
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
      <Badge variant={variants[permission] || 'outline'}>
        {permission === 'granted' && '✅'}
        {permission === 'denied' && '⛔'}
        {permission === 'default' && '❓'}
        {' '}
        {permission}
      </Badge>
    );
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
          <p className="text-sm text-muted-foreground mb-1">OneSignal App ID</p>
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
        <div className="flex gap-2 pt-2">
          <Button
            onClick={requestPermission}
            disabled={!isInitialized || permission === 'granted'}
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
              updatePermission();
            }}
            disabled={!user}
            size="sm"
            variant="ghost"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Hints */}
        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
          <p>💡 Pokud je Player ID "není dostupné", zkontrolujte konzoli prohlížeče.</p>
          <p>💡 Pokud je oprávnění "denied", povolte notifikace v nastavení prohlížeče.</p>
          <p>💡 Pokud je počet zařízení 0 i přes Player ID, zkontrolujte RLS policies v Supabase.</p>
        </div>
      </CardContent>
    </Card>
  );
};
