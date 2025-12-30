import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AdminSoundIndicatorProps {
  soundEnabled: boolean;
  realtimeConnected: boolean;
  lastRealtimeEvent: Date | null;
  onToggleSound: () => void;
}

export const AdminSoundIndicator: React.FC<AdminSoundIndicatorProps> = ({
  soundEnabled,
  realtimeConnected,
  lastRealtimeEvent,
  onToggleSound,
}) => {
  const [isPulsing, setIsPulsing] = useState(false);

  // Pulse animation when new event occurs
  useEffect(() => {
    if (!lastRealtimeEvent) return;
    
    setIsPulsing(true);
    const timeout = setTimeout(() => setIsPulsing(false), 1000);
    
    return () => clearTimeout(timeout);
  }, [lastRealtimeEvent]);

  return (
    <div className="flex items-center gap-2">
      {/* Sound toggle button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleSound}
        className={cn(
          "h-8 w-8 p-0 relative transition-all duration-200",
          isPulsing && "animate-pulse ring-2 ring-primary/50"
        )}
        title={soundEnabled ? "Zvuk zapnutý" : "Zvuk vypnutý"}
      >
        {soundEnabled ? (
          <Volume2 className={cn(
            "h-4 w-4 transition-colors",
            isPulsing ? "text-primary" : "text-green-500"
          )} />
        ) : (
          <VolumeX className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>

      {/* Connection status badge */}
      <div
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors",
          realtimeConnected 
            ? "bg-green-500/20 text-green-400" 
            : "bg-destructive/20 text-destructive"
        )}
        title={realtimeConnected ? "Realtime připojeno" : "Realtime odpojeno"}
      >
        {realtimeConnected ? (
          <>
            <Wifi className="h-3 w-3" />
            <span className="hidden sm:inline">Připojeno</span>
          </>
        ) : (
          <>
            <WifiOff className="h-3 w-3" />
            <span className="hidden sm:inline">Odpojeno</span>
          </>
        )}
      </div>
    </div>
  );
};