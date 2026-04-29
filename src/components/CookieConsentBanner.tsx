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
    setVisible(false);
    setSettingsOpen(false);
  };

  const rejectAll = () => {
    saveConsent({ essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() });
    setVisible(false);
    setSettingsOpen(false);
  };

  const saveCustom = () => {
    saveConsent({ essential: true, analytics, marketing, timestamp: new Date().toISOString() });
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
          <div className="mx-auto max-w-4xl rounded-2xl border border-[hsl(40_30%_35%/0.5)] bg-gradient-to-b from-[hsl(220_30%_12%)] via-[hsl(220_28%_9%)] to-[hsl(222_35%_7%)] shadow-[0_8px_32px_hsl(222_50%_3%/0.8)] backdrop-blur-xl p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <h2 className="text-heading-gold text-base sm:text-lg font-semibold mb-1">
                  Cookies
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Používáme cookies pro fungování aplikace, analýzu návštěvnosti a personalizaci reklam (Google, Meta).{' '}
                  <Link
                    to="/privacy"
                    className="text-heading-gold hover:underline"
                    onClick={() => setVisible(false)}
                  >
                    Ochrana osobních údajů
                  </Link>
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:flex-shrink-0">
                <Button
                  variant="outline"
                  onClick={() => setSettingsOpen(true)}
                  className="border-[hsl(40_30%_35%/0.4)] hover:border-[hsl(40_40%_45%/0.6)] hover:bg-[hsl(40_30%_20%/0.15)]"
                >
                  Nastavení
                </Button>
                <Button
                  variant="outline"
                  onClick={rejectAll}
                  className="border-[hsl(40_30%_35%/0.4)] hover:border-[hsl(40_40%_45%/0.6)] hover:bg-[hsl(40_30%_20%/0.15)]"
                >
                  Odmítnout
                </Button>
                <Button
                  onClick={acceptAll}
                  className="rounded-xl bg-gradient-to-r from-[hsl(45_80%_45%)] via-[hsl(40_85%_50%)] to-[hsl(35_80%_45%)] text-secondary-foreground shadow-[0_2px_12px_hsl(45_80%_50%/0.25)] hover:shadow-[0_4px_16px_hsl(45_80%_50%/0.35)] hover:brightness-110 transition-all"
                >
                  Souhlasím
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="bg-gradient-to-b from-[hsl(220_30%_12%)] via-[hsl(220_28%_9%)] to-[hsl(222_35%_7%)] border-[hsl(40_30%_35%/0.5)]">
          <DialogHeader>
            <DialogTitle className="text-heading-gold">Nastavení cookies</DialogTitle>
            <DialogDescription>
              Vyberte, které kategorie cookies chcete povolit.{' '}
              <Link to="/privacy" className="text-heading-gold hover:underline" onClick={() => setSettingsOpen(false)}>
                Ochrana osobních údajů
              </Link>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-start justify-between gap-4 rounded-lg border border-[hsl(40_30%_35%/0.3)] p-3">
              <div>
                <p className="font-medium text-sm">Nezbytné</p>
                <p className="text-xs text-muted-foreground">Nutné pro fungování aplikace. Vždy aktivní.</p>
              </div>
              <Switch checked disabled />
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border border-[hsl(40_30%_35%/0.3)] p-3">
              <div>
                <p className="font-medium text-sm">Analytické</p>
                <p className="text-xs text-muted-foreground">Pomáhají měřit návštěvnost (Google Analytics).</p>
              </div>
              <Switch checked={analytics} onCheckedChange={setAnalytics} />
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border border-[hsl(40_30%_35%/0.3)] p-3">
              <div>
                <p className="font-medium text-sm">Marketingové</p>
                <p className="text-xs text-muted-foreground">Personalizace reklam (Google Ads, Meta Pixel).</p>
              </div>
              <Switch checked={marketing} onCheckedChange={setMarketing} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={rejectAll}>Odmítnout vše</Button>
            <Button variant="outline" onClick={saveCustom}>Uložit výběr</Button>
            <Button
              onClick={acceptAll}
              className="rounded-xl bg-gradient-to-r from-[hsl(45_80%_45%)] via-[hsl(40_85%_50%)] to-[hsl(35_80%_45%)] text-secondary-foreground hover:brightness-110"
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
