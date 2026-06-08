import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, KeyRound, Building2 } from 'lucide-react';

type PageState = 'checking' | 'ready' | 'no_session' | 'success';

export default function PartnerSetPassword() {
  const navigate = useNavigate();
  const [pageState, setPageState] = useState<PageState>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [companyEmail, setCompanyEmail] = useState('');

  useEffect(() => {
    // Check if we have a valid session — either from URL hash (recovery link)
    // or from PASSWORD_RECOVERY event already processed by AppContent.
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCompanyEmail(session.user.email ?? '');
        setPageState('ready');
      } else {
        setPageState('no_session');
      }
    };

    check();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password.trim()) {
      toast.error('Zadejte nové heslo');
      return;
    }
    if (password.length < 8) {
      toast.error('Heslo musí mít alespoň 8 znaků');
      return;
    }
    if (password !== confirm) {
      toast.error('Hesla se neshodují', {
        description: 'Ujistěte se, že obě hesla jsou stejná.',
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setPageState('success');
      toast.success('Heslo bylo nastaveno', {
        description: 'Vítejte v partnerském portálu OneMil!',
        duration: 4000,
      });
      setTimeout(() => navigate('/partner/dashboard', { replace: true }), 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Nepodařilo se nastavit heslo';
      toast.error('Chyba při nastavení hesla', { description: msg });
    } finally {
      setLoading(false);
    }
  };

  // ── Checking state ───────────────────────────────────────────────────────
  if (pageState === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── No session / expired link ────────────────────────────────────────────
  if (pageState === 'no_session') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
            <KeyRound className="w-8 h-8 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Odkaz je neplatný nebo vypršel
            </h1>
            <p className="text-muted-foreground">
              Tento odkaz pro nastavení hesla je jednorázový a jeho platnost je omezená.
              Pokud jste jej již použili nebo vypršel, kontaktujte správce OneMil.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate('/partner/login', { replace: true })}
          >
            Přejít na přihlášení
          </Button>
        </div>
      </div>
    );
  }

  // ── Success state ────────────────────────────────────────────────────────
  if (pageState === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
            <Building2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Heslo nastaveno</h1>
          <p className="text-muted-foreground">Přesměrováváme vás do partnerského portálu…</p>
          <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
        </div>
      </div>
    );
  }

  // ── Main form ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <KeyRound className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Nastavte si heslo</h1>
          <p className="text-muted-foreground">
            Váš partnerský účet byl schválen. Vytvořte si heslo pro přihlášení.
          </p>
          {companyEmail && (
            <p className="text-sm text-muted-foreground">
              Účet: <span className="font-medium text-foreground">{companyEmail}</span>
            </p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="psp-password">
              Nové heslo <span className="text-destructive">*</span>
            </Label>
            <Input
              id="psp-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Alespoň 8 znaků"
              disabled={loading}
              required
              autoFocus
              data-testid="psp-password"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="psp-confirm">
              Potvrďte heslo <span className="text-destructive">*</span>
            </Label>
            <Input
              id="psp-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Zopakujte heslo"
              disabled={loading}
              required
              data-testid="psp-confirm"
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
            data-testid="psp-submit"
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Nastavit heslo a přejít do portálu
          </Button>
        </form>

        <p className="text-xs text-center text-muted-foreground">
          Máte problém? Kontaktujte nás na{' '}
          <a
            href="mailto:podpora@onemil.cz"
            className="underline hover:text-foreground transition-colors"
          >
            podpora@onemil.cz
          </a>
        </p>
      </div>
    </div>
  );
}
