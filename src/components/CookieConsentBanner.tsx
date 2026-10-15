import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  CONSENT_OPEN_EVENT,
  CONSENT_STORAGE_KEY,
  applyConsent,
  readConsent,
  saveConsent,
  type Consent,
} from '@/lib/consent';
import { supabase } from '@/integrations/supabase/client';

async function persistConsentToDb(analytics: boolean, marketing: boolean) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('cookie_consents').insert({
      user_id: user?.id ?? null,
      necessary: true,
      analytics,
      marketing,
    });
  } catch (e) {
    console.error('[consent] DB persist failed', e);
  }
}

/**
 * Lišta a nastavení cookies (deska Dialogy 3 a 4): tmavá karta se zlatým rámečkem,
 * nastavení jako světlá karta se zlatými přepínači. Volby i logika souhlasu beze změny.
 */
export const CookieConsentBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  // Initial mount: re-apply stored consent (loads GTM if previously granted),
  // or show banner if no choice yet.
  useEffect(() => {
    const stored = readConsent();
    if (!stored) {
      setVisible(true);
    } else {
      setAnalytics(!!stored.analytics);
      setMarketing(!!stored.marketing);
      applyConsent(stored);
    }
  }, []);

  // Allow Footer (or anywhere) to reopen the settings dialog.
  useEffect(() => {
    const handler = () => {
      const stored = readConsent();
      if (stored) {
        setAnalytics(!!stored.analytics);
        setMarketing(!!stored.marketing);
      }
      setSettingsOpen(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, handler);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, handler);
  }, []);

  // Sync across tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CONSENT_STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as Consent;
          applyConsent(parsed);
          setAnalytics(!!parsed.analytics);
          setMarketing(!!parsed.marketing);
          setVisible(false);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const acceptAll = () => {
    saveConsent({ essential: true, analytics: true, marketing: true, timestamp: new Date().toISOString() });
    void persistConsentToDb(true, true);
    setVisible(false);
    setSettingsOpen(false);
  };

  const rejectAll = () => {
    saveConsent({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() });
    void persistConsentToDb(false, false);
    setVisible(false);
    setSettingsOpen(false);
  };

  const saveCustom = () => {
    saveConsent({ essential: true, analytics, marketing, timestamp: new Date().toISOString() });
    void persistConsentToDb(analytics, marketing);
    setVisible(false);
    setSettingsOpen(false);
  };

  return (
    <>
      {visible && !settingsOpen && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label="Souhlas s cookies"
          className="fixed bottom-0 left-0 right-0 z-[100] p-3 sm:p-6"
        >
          <div className="om-ck-bar mx-auto max-w-4xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="flex-1">
                <div className="mb-1.5 flex items-center gap-2.5">
                  <span aria-hidden="true" className="om-ck-ico">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E9B949" strokeWidth="2">
                      <path d="M21 12a9 9 0 11-9-9 3 3 0 003 3 3 3 0 003 3 3 3 0 003 3z" />
                      <circle cx="8.5" cy="10.5" r="1" fill="#E9B949" />
                      <circle cx="12" cy="15" r="1" fill="#E9B949" />
                      <circle cx="15.5" cy="12" r="1" fill="#E9B949" />
                    </svg>
                  </span>
                  <strong className="om-ck-title">Cookies</strong>
                </div>
                <p className="om-ck-text">
                  Používáme cookies pro fungování aplikace, analýzu návštěvnosti a personalizaci reklam (Google, Meta).{' '}
                  <Link to="/legal/cookies" className="om-ck-link">
                    Zásady použití cookies
                  </Link>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-shrink-0">
                <button type="button" onClick={() => setSettingsOpen(true)} className="om-ck-ghost">
                  Nastavení
                </button>
                <button type="button" onClick={rejectAll} className="om-ck-ghost">
                  Odmítnout
                </button>
                <button type="button" onClick={acceptAll} className="om-ck-gold col-span-2">
                  Souhlasím
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="om-ck-sheet border-0 text-[#17171B]">
          <DialogHeader className="text-left">
            <DialogTitle className="om-ck-sheet-title">Nastavení cookies</DialogTitle>
            <DialogDescription className="text-[13px] text-[#5E5B57]">
              Vyber, které kategorie cookies chceš povolit.{' '}
              <Link to="/legal/cookies" className="font-bold text-[#8A5A10] hover:underline">
                Zásady použití cookies
              </Link>
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col">
            <div className="om-ck-row">
              <div className="flex-1">
                <p className="text-sm font-bold text-[#17171B]">Nezbytné</p>
                <p className="text-xs text-[#5E5B57]">Nutné pro fungování aplikace. Vždy aktivní.</p>
              </div>
              <Switch checked disabled aria-label="Nezbytné cookies" className="om-ck-switch om-ck-switch-lock" />
            </div>

            <div className="om-ck-row">
              <div className="flex-1">
                <p className="text-sm font-bold text-[#17171B]">Analytické</p>
                <p className="text-xs text-[#5E5B57]">Pomáhají měřit návštěvnost (Google Analytics).</p>
              </div>
              <Switch checked={analytics} onCheckedChange={setAnalytics} aria-label="Analytické cookies" className="om-ck-switch" />
            </div>

            <div className="om-ck-row om-ck-row-last">
              <div className="flex-1">
                <p className="text-sm font-bold text-[#17171B]">Marketingové</p>
                <p className="text-xs text-[#5E5B57]">Personalizace reklam (Google Ads, Meta Pixel).</p>
              </div>
              <Switch checked={marketing} onCheckedChange={setMarketing} aria-label="Marketingové cookies" className="om-ck-switch" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={rejectAll} className="om-ck-light">Odmítnout vše</button>
            <button type="button" onClick={saveCustom} className="om-ck-black">Uložit výběr</button>
            <button type="button" onClick={acceptAll} className="om-ck-gold col-span-2">
              Souhlasím se vším
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CookieConsentBanner;
