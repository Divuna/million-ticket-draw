import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  peekLastVisitTs,
  writeVisitNow,
  getLastTicketPlayTs,
  wasRetentionPushSentToday,
  markRetentionPushSentToday,
  wasIdleCoinsToastToday,
  markIdleCoinsToastToday,
} from '@/lib/retentionLocal';

const MS_24H = 24 * 60 * 60 * 1000;
const MS_36H = 36 * 60 * 60 * 1000;

async function fetchWalletBalanceCoins(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('wallets')
    .select('balance_coins')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || data?.balance_coins == null) return 0;
  return Number(data.balance_coins) || 0;
}

function tryBrowserNotification(title: string, body: string) {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    new Notification(title, { body, tag: 'onemil-retention', silent: false });
  } catch {
    /* ignore */
  }
}

/**
 * - 24h+ since last session visit + MioCoins → insert `notifications` (existing OneSignal pipeline) + toast + optional Web Notification.
 * - Tab visible again: optional idle toast if user has coins and hasn’t played locally for 36h+ (no ticket counts exposed).
 * Last visit is updated once per mount when `userId` is set (not on every visibility change).
 */
export function useRetentionTriggers(userId: string | undefined) {
  const ranSessionForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      ranSessionForRef.current = null;
      return;
    }

    const runSessionStart = async () => {
      const now = Date.now();
      const prevVisit = peekLastVisitTs();
      writeVisitNow();

      const balance = await fetchWalletBalanceCoins(userId);
      if (balance <= 0) return;

      const away24h = prevVisit > 0 && now - prevVisit >= MS_24H;
      const pushBody = 'Máš MioCoiny — otevři soutěže a zkus štěstí znovu!';
      const toastBody = 'Máš na účtu MioCoiny. Zajdi do soutěží a zkus to znovu!';

      if (away24h && !wasRetentionPushSentToday()) {
        markRetentionPushSentToday();
        try {
          const { error } = await supabase.from('notifications').insert({
            user_id: userId,
            type: 'info',
            title: 'Čeká na tebe další šance',
            message: pushBody,
            status: 'queued',
          });
          if (error) {
            console.warn('[retention] notifications insert:', error.message);
          }
        } catch (e) {
          console.warn('[retention] notifications insert failed', e);
        }
        toast.info(toastBody, { duration: 6500 });
        tryBrowserNotification('OneMil', pushBody);
        return;
      }

      const lastTicket = getLastTicketPlayTs();
      const idle36h = lastTicket > 0 && now - lastTicket >= MS_36H;
      if (idle36h && !wasIdleCoinsToastToday()) {
        markIdleCoinsToastToday();
        toast.message('Tvoje MioCoiny čekají — pojď si zahrát!', {
          duration: 5000,
          description: 'Krátká pauza je OK, štěstí neuteče.',
        });
      }
    };

    const runVisibleIdle = async () => {
      const now = Date.now();
      const balance = await fetchWalletBalanceCoins(userId);
      if (balance <= 0) return;
      if (wasIdleCoinsToastToday()) return;

      const lastTicket = getLastTicketPlayTs();
      if (lastTicket <= 0 || now - lastTicket < MS_36H) return;

      markIdleCoinsToastToday();
      toast.message('Tvoje MioCoiny čekají — pojď si zahrát!', {
        duration: 5000,
        description: 'Krátká pauza je OK, štěstí neuteče.',
      });
    };

    if (ranSessionForRef.current !== userId) {
      ranSessionForRef.current = userId;
      void runSessionStart();
    }

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void runVisibleIdle();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [userId]);
}
