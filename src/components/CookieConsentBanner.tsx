import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
      {visible && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label="Souhlas s cookies"
          className="fixed bottom-0 left-0 right-0 z-[100] p-4 sm:p-6"
        >
          <div className="mx-auto max-w-4xl rounded-2xl border border-[#F4D6AD] bg-[#FFF9F0] shadow-[0_8px_32px_rgba(81,49,10,0.18)] backdrop-blur-xl p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <h2 className="text-[#111827] text-base sm:text-lg font-semibold mb-1">
                  Cookies
                </h2>
                <p className="text-sm text-[#4B5563] leading-relaxed">
                  Používáme cookies pro fungování aplikace, analýzu návštěvnosti a personalizaci reklam (Google, Meta).{' '}
                  <Link
                    to="/legal/cookies"
                    className="text-[#F97316] hover:underline"
                  >
                    Zásady použití cookies
                  </Link>
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:flex-shrink-0">
                <Button
                  variant="outline"
                  onClick={() => setSettingsOpen(true)}
                  className="border-[#F4D6AD] bg-white text-[#111827] hover:bg-[#FFF4E8]"
                >
                  Nastavení
                </Button>
                <Button
                  variant="outline"
                  onClick={rejectAll}
                  className="border-[#F4D6AD] bg-white text-[#111827] hover:bg-[#FFF4E8]"
                >
                  Odmítnout
                </Button>
                <Button
                  onClick={acceptAll}
                  className="rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-black shadow-[0_2px_12px_rgba(255,138,0,0.25)] hover:shadow-[0_4px_16px_rgba(255,138,0,0.35)] hover:brightness-110 transition-all"
                >
                  Souhlasím
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="bg-[#FFF9F0] border-[#F4D6AD] text-[#111827]">
          <DialogHeader>
            <DialogTitle className="text-[#111827]">Nastavení cookies</DialogTitle>
            <DialogDescription className="text-[#4B5563]">
              Vyberte, které kategorie cookies chcete povolit.{' '}
              <Link to="/legal/cookies" className="text-[#F97316] hover:underline">
                Zásady použití cookies
              </Link>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-start justify-between gap-4 rounded-lg border border-[#F4D6AD] bg-white/60 p-3">
              <div>
                <p className="font-medium text-sm text-[#111827]">Nezbytné</p>
                <p className="text-xs text-[#6B7280]">Nutné pro fungování aplikace. Vždy aktivní.</p>
              </div>
              <Switch checked disabled />
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border border-[#F4D6AD] bg-white/60 p-3">
              <div>
                <p className="font-medium text-sm text-[#111827]">Analytické</p>
                <p className="text-xs text-[#6B7280]">Pomáhají měřit návštěvnost (Google Analytics).</p>
              </div>
              <Switch checked={analytics} onCheckedChange={setAnalytics} />
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border border-[#F4D6AD] bg-white/60 p-3">
              <div>
                <p className="font-medium text-sm text-[#111827]">Marketingové</p>
                <p className="text-xs text-[#6B7280]">Personalizace reklam (Google Ads, Meta Pixel).</p>
              </div>
              <Switch checked={marketing} onCheckedChange={setMarketing} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={rejectAll} className="border-[#F4D6AD] bg-white text-[#111827] hover:bg-[#FFF4E8]">Odmítnout vše</Button>
            <Button variant="outline" onClick={saveCustom} className="border-[#F4D6AD] bg-white text-[#111827] hover:bg-[#FFF4E8]">Uložit výběr</Button>
            <Button
              onClick={acceptAll}
              className="rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#FFB547] text-black hover:brightness-110"
            >
              Souhlasím se vším
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CookieConsentBanner;
