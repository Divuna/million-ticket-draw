import React, { useMemo, useState } from 'react';
import { Mail, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { buildPublicUrl } from '@/lib/publicAppUrl';

const SUBJECT = 'Zákazník by rád získával MIO za nákupy';

const buildBody = () => `Dobrý den,

nakupuji u vás a napadlo mě, že by bylo skvělé, kdybych u vás mohl získávat MIO do aplikace OneMil.

OneMil je věrnostní aplikace, kde zákazníci mohou za nákupy získávat MIO a využívat je na soutěže, vouchery a další výhody.

Přišlo mi to jako zajímavý nápad, který by mohl být příjemný i pro vaše zákazníky.

Tady je představení OneMil pro e-shopy:
${buildPublicUrl('/pro-eshopy')}

Děkuji a přeji hezký den.`;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Doporučení OneMil obchodu. E-mail vždy odesílá zákazník sám – OneMil nic neodesílá.
 * `mailto:` funguje jen s nastavenou výchozí poštovní aplikací (ve Windows často chybí
 * a prohlížeč pak tiše nic neudělá), proto po kliknutí nabízíme i Gmail, Outlook
 * a zkopírování textu.
 */
const RecommendShopMailtoCard: React.FC = () => {
  const [email, setEmail] = useState('');
  const [preparedFor, setPreparedFor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const body = useMemo(buildBody, []);

  const links = useMemo(() => {
    if (!preparedFor) return null;
    const to = encodeURIComponent(preparedFor);
    const su = encodeURIComponent(SUBJECT);
    const bd = encodeURIComponent(body);
    return {
      gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${su}&body=${bd}`,
      outlook: `https://outlook.live.com/mail/0/deeplink/compose?to=${to}&subject=${su}&body=${bd}`,
      mailto: `mailto:${preparedFor}?subject=${su}&body=${bd}`,
    };
  }, [preparedFor, body]);

  const handlePrepareEmail = () => {
    const trimmedEmail = email.trim();

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      toast({
        title: 'Chyba',
        description: 'Zadej platný e-mail obchodu nebo prodejce.',
        variant: 'destructive',
      });
      setPreparedFor(null);
      return;
    }

    setCopied(false);
    setPreparedFor(trimmedEmail);
  };

  const handleCopy = async () => {
    if (!preparedFor) return;
    try {
      await navigator.clipboard.writeText(`Komu: ${preparedFor}\nPředmět: ${SUBJECT}\n\n${body}`);
      setCopied(true);
      toast({ title: 'Zkopírováno', description: 'Text e-mailu vlož do své pošty a odešli.' });
    } catch {
      toast({ title: 'Chyba', description: 'Text se nepodařilo zkopírovat.', variant: 'destructive' });
    }
  };

  const optionClass =
    'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-primary/30 bg-white px-3 text-sm font-bold text-foreground transition-colors hover:bg-[#FFF6E0]';

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-card/95 via-primary/5 to-card/95 p-5 shadow-[0_0_28px_-10px_rgba(194,144,47,0.22)]">
      <div className="pointer-events-none absolute right-0 top-0 h-20 w-20 rounded-bl-full bg-primary/10" />

      <div className="relative space-y-4">
        <div className="flex items-start gap-4">
          <div className="rounded-xl border border-primary/25 bg-primary/15 p-3 shadow-lg shadow-primary/10">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground">Doporučit OneMil oblíbenému obchodu</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground/80">
              Pošli e-mail svému oblíbenému e-shopu nebo prodejci a dej jim vědět, že bys u nich rád získával MIO za nákupy.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setPreparedFor(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handlePrepareEmail();
              }
            }}
            placeholder="E-mail obchodu nebo prodejce"
            className="premium-input flex-1 border-primary/20 bg-background/50 focus:border-primary/45"
          />
          <Button
            type="button"
            onClick={handlePrepareEmail}
            className="w-full bg-gradient-to-r from-[#C2902F] to-[#E9B949] font-bold text-black transition-all duration-300 hover:from-[#E9B949] hover:to-[#C2902F] hover:shadow-lg hover:shadow-primary/20 sm:w-auto"
          >
            <Mail className="h-4 w-4" />
            Připravit e-mail
          </Button>
        </div>

        {links && (
          <div className="space-y-2.5 rounded-xl border border-primary/20 bg-white/70 p-3.5" role="region" aria-label="Odeslat doporučení">
            <p className="text-sm font-semibold text-foreground">
              E-mail pro <span className="break-all">{preparedFor}</span> je připravený. Otevři ho tam, kde píšeš poštu:
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <a href={links.gmail} target="_blank" rel="noopener noreferrer" className={optionClass}>Gmail</a>
              <a href={links.outlook} target="_blank" rel="noopener noreferrer" className={optionClass}>Outlook</a>
              <a href={links.mailto} className={optionClass}>E-mailová aplikace</a>
              <button type="button" onClick={handleCopy} className={optionClass}>
                {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied ? 'Zkopírováno' : 'Kopírovat text'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Odeslání je jen na tobě – OneMil nic neposílá.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecommendShopMailtoCard;
