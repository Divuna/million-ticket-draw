import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { buildLoginRedirectUrl } from '@/lib/loginRedirect';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { isNativeApp } from '@/lib/nativeApp';
import { MIOCOIN_PACKAGES, useMioCoinCheckout } from '@/hooks/useMioCoinCheckout';
import { useAdminRealtimeContext } from '@/components/AdminRealtimeProvider';
import { AdminSoundIndicator } from '@/components/AdminSoundIndicator';
import { OneMilMioCoinIcon } from '@/components/icons/OneMilIcons';
import { supabase } from '@/integrations/supabase/client';
import { ChevronDown } from 'lucide-react';
import logo from '@/assets/logo-onemil.png';

/**
 * Veřejná zákaznická hlavička.
 *
 * Přihlášený zákazník vidí vpravo zůstatek MioCoinů a účet s rozbalovacím
 * menu. Partnerská (`PartnerHeader`) ani administrátorská hlavička se odsud
 * nemění a zůstatek se do nich nepřidává.
 *
 * Pravidla (neměnit):
 * - Zůstatek se čte stejně jako v `Games.tsx` — `wallets.balance_coins`
 *   výhradně pro `auth.uid()` přihlášeného uživatele. Nezavádět druhý,
 *   odlišný výpočet zůstatku.
 * - Jméno vychází ze stejných polí profilu jako `Profile.tsx`
 *   (`profiles.full_name`, `first_name`, `last_name`); fallback je část
 *   e-mailu před zavináčem.
 * - Chip se zůstatkem se zobrazí jen tehdy, když peněženka existuje —
 *   partnerské a affiliate účty tak v hlavičce nevidí nulový zůstatek.
 */

interface HeaderAccountState {
  balance: number | null;
  displayName: string | null;
}

export const Header: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const { soundEnabled, toggleSound, realtimeConnected, lastRealtimeEvent } = useAdminRealtimeContext();
  // Rychlé dobití používá stejný Stripe postup jako dobíjecí panel.
  const { startCheckout, loading: checkoutLoading } = useMioCoinCheckout();
  const nativeApp = isNativeApp();

  const [account, setAccount] = useState<HeaderAccountState>({ balance: null, displayName: null });

  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;

  /** Stejný zdroj zůstatku jako `Games.tsx` — jen vlastní řádek peněženky. */
  const loadBalance = useCallback(async () => {
    if (!userId) {
      setAccount((prev) => ({ ...prev, balance: null }));
      return;
    }
    const { data, error } = await supabase
      .from('wallets')
      .select('balance_coins')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error loading wallet in header:', error);
      return;
    }
    setAccount((prev) => ({
      ...prev,
      balance: data ? Number(data.balance_coins) || 0 : null,
    }));
  }, [userId]);

  /** Stejná pole profilu jako `Profile.tsx`. */
  const loadDisplayName = useCallback(async () => {
    if (!userId) {
      setAccount((prev) => ({ ...prev, displayName: null }));
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('first_name, last_name, full_name')
      .eq('id', userId)
      .maybeSingle();

    const fromProfile =
      data?.full_name?.trim() ||
      [data?.first_name, data?.last_name].filter(Boolean).join(' ').trim();

    const fallback = userEmail ? userEmail.split('@')[0] : null;
    setAccount((prev) => ({ ...prev, displayName: fromProfile || fallback }));
  }, [userId, userEmail]);

  useEffect(() => {
    loadBalance();
    loadDisplayName();
  }, [loadBalance, loadDisplayName]);

  // Zůstatek se musí aktualizovat bez odhlášení. Realtime na vlastním řádku
  // peněženky (stejný `postgres_changes` vzor jako jinde v aplikaci) plus
  // dotažení při návratu na záložku a při změně routy jako pojistka.
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`header-wallet-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${userId}` },
        () => {
          loadBalance();
        },
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible') loadBalance();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, loadBalance]);

  useEffect(() => {
    if (userId) loadBalance();
    // Přechod mezi stránkami (nákup tiketu, voucher, dobití) → čerstvý zůstatek.
  }, [location.pathname, userId, loadBalance]);

  const initial = (account.displayName ?? userEmail ?? '?').trim().charAt(0).toUpperCase() || '?';
  const formattedBalance =
    account.balance != null ? account.balance.toLocaleString('cs-CZ', { maximumFractionDigits: 1 }) : null;

  const balanceChipClass =
    'public-customer-header-balance flex items-center gap-1.5 rounded-full border border-[rgba(255,138,0,0.28)] bg-[rgba(255,138,0,0.08)] px-2.5 py-1.5 sm:px-3';
  const balanceChipContent = (
    <>
      <OneMilMioCoinIcon size={18} className="h-[18px] w-[18px] shrink-0" />
      <span className="text-sm font-bold tabular-nums text-foreground">{formattedBalance}</span>
      <span className="hidden text-xs font-medium text-muted-foreground sm:inline">MioCoinů</span>
    </>
  );

  return (
    <>
    <header className="public-customer-header sticky top-0 z-50 h-16 md:h-20 bg-background/70 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-4">
      <div className="container mx-auto flex items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 items-center gap-4">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={logo}
              alt="OneMil logo"
              className="h-12 md:h-20 w-auto object-contain"
            />
          </Link>

          {/* Admin sound indicator next to logo */}
          {isAdmin && (
            <AdminSoundIndicator
              soundEnabled={soundEnabled}
              realtimeConnected={realtimeConnected}
              lastRealtimeEvent={lastRealtimeEvent}
              onToggleSound={toggleSound}
            />
          )}
        </div>

        <nav className="flex shrink-0 items-center gap-2 sm:gap-3">
          {user ? (
            <>
              {formattedBalance !== null &&
                (nativeApp ? (
                  // V nativní aplikaci zůstatek zůstává vidět, ale neotevírá dobíjení.
                  <div className={balanceChipClass}>{balanceChipContent}</div>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Rychlé dobití MioCoinů"
                        disabled={checkoutLoading}
                        className={`${balanceChipClass} transition-colors hover:border-[rgba(255,138,0,0.5)] hover:bg-[rgba(255,138,0,0.14)] disabled:cursor-wait disabled:opacity-70`}
                      >
                        {balanceChipContent}
                      </button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end" className="w-64 bg-popover">
                      <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Rychlé dobití
                      </DropdownMenuLabel>
                      {MIOCOIN_PACKAGES.map((pkg) => (
                        <DropdownMenuItem
                          key={pkg.priceInCzk}
                          disabled={checkoutLoading}
                          onSelect={(event) => {
                            event.preventDefault();
                            void startCheckout(pkg.priceInCzk, pkg.totalCoins);
                          }}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="text-sm font-bold text-foreground">
                            {pkg.priceInCzk.toLocaleString('cs-CZ')} Kč
                          </span>
                          <span className="flex items-center gap-1.5">
                            {pkg.bonusLabel && (
                              <span className="rounded-full bg-[rgba(255,138,0,0.14)] px-1.5 py-0.5 text-[10px] font-bold text-[#e26305]">
                                {pkg.bonusLabel}
                              </span>
                            )}
                            <OneMilMioCoinIcon size={14} className="h-3.5 w-3.5 shrink-0" />
                            <span className="text-sm font-semibold tabular-nums text-foreground">
                              {pkg.totalCoins.toLocaleString('cs-CZ')}
                            </span>
                          </span>
                        </DropdownMenuItem>
                      ))}
                      {checkoutLoading && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          Otevírám platební bránu…
                        </div>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => navigate('/top-up')}>
                        Všechny možnosti dobíjení
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ))}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Menu účtu"
                    className="public-customer-header-account flex max-w-[11rem] items-center gap-2 rounded-full border border-[rgba(15,23,42,0.12)] bg-white/70 py-1 pl-1 pr-2 transition-colors hover:border-[rgba(255,138,0,0.4)] sm:max-w-[16rem] sm:pr-3"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FFB547] to-[#FF8A00] text-sm font-extrabold text-black">
                      {initial}
                    </span>
                    {account.displayName && (
                      <span className="hidden truncate text-sm font-semibold text-foreground md:inline">
                        {account.displayName}
                      </span>
                    )}
                    <ChevronDown className="hidden h-4 w-4 shrink-0 text-muted-foreground md:block" />
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-56 bg-popover">
                  <DropdownMenuItem onSelect={() => navigate('/profile')}>Profil</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => navigate('/my-contests')}>Moje soutěže</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => navigate('/wins')}>Výhry</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => navigate('/vouchers')}>Vouchery</DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem onSelect={() => navigate('/admin')}>Admin</DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => { void signOut(); }}>Odhlásit se</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Link to={buildLoginRedirectUrl(location.pathname + location.search)}>
                <Button variant="ghost" className="public-customer-header-link">Přihlásit</Button>
              </Link>
              <Link to="/register">
                <Button variant="default" className="public-customer-header-primary">Registrovat</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
    </>
  );
};
