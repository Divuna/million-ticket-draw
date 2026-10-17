import React, { useMemo, useState } from 'react';
import { Mail, Copy, Check, Store } from 'lucide-react';
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

  const optionClass = 'om-pf-btn om-pf-outline';

  return (
    <section className="om-pf-lc">
      <div className="om-pf-head">
        <span className="om-pf-ic"><Store aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 className="om-pf-tt">Doporučit OneMil obchodu</h2>
          <p className="om-pf-st">
            Dej svému oblíbenému e-shopu vědět, že bys u nich rád získával MIO za nákupy.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex-1 block">
          <span className="sr-only">E-mail obchodu nebo prodejce</span>
          <input
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
            className="om-pf-input"
          />
        </label>
        <button type="button" onClick={handlePrepareEmail} className="om-pf-btn om-pf-black shrink-0">
          <Mail className="h-4 w-4" aria-hidden="true" />
          Připravit e-mail
        </button>
      </div>

      {links && (
        <div
          className="mt-3 space-y-2.5 rounded-[14px] bg-[#FFF8EA] p-3.5 shadow-[inset_0_0_0_1px_rgba(194,144,47,0.3)]"
          role="region"
          aria-label="Odeslat doporučení"
        >
          <p className="m-0 text-[13.5px] font-semibold text-[#17171B]">
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
          <p className="om-pf-note">Odeslání je jen na tobě – OneMil nic neposílá.</p>
        </div>
      )}
    </section>
  );
};

export default RecommendShopMailtoCard;
