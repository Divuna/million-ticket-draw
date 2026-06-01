import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';

const SUBJECT = 'Zákazník by rád získával MioCoiny za nákupy';

const BODY = `Dobrý den,

nakupuji u vás a napadlo mě, že by bylo skvělé, kdybych u vás mohl získávat MioCoiny do aplikace OneMil.

OneMil je věrnostní aplikace, kde zákazníci mohou za nákupy získávat MioCoiny a využívat je na soutěže, vouchery a další výhody.

Přišlo mi to jako zajímavý nápad, který by mohl být příjemný i pro vaše zákazníky.

Tady je odkaz na představení OneMil:
[DOPLNIT ODKAZ NA PREZENTACI / VIDEO]

Děkuji a přeji hezký den.`;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RecommendShopMailtoCard: React.FC = () => {
  const [email, setEmail] = useState('');

  const handlePrepareEmail = () => {
    const trimmedEmail = email.trim();

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      toast({
        title: 'Chyba',
        description: 'Zadejte platný e-mail obchodu nebo prodejce.',
        variant: 'destructive',
      });
      return;
    }

    const mailtoUrl = `mailto:${trimmedEmail}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(BODY)}`;
    window.location.href = mailtoUrl;

    toast({
      title: 'E-mail připraven',
      description: 'E-mail jsme připravili ve vaší e-mailové aplikaci. Odeslání je jen na vás.',
    });
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-card/95 via-primary/5 to-card/95 p-5 shadow-[0_0_28px_-10px_rgba(255,138,0,0.22)]">
      <div className="pointer-events-none absolute right-0 top-0 h-20 w-20 rounded-bl-full bg-primary/10" />

      <div className="relative space-y-4">
        <div className="flex items-start gap-4">
          <div className="rounded-xl border border-primary/25 bg-primary/15 p-3 shadow-lg shadow-primary/10">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground">Doporučit OneMil oblíbenému obchodu</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground/80">
              Pošlete e-mail svému oblíbenému e-shopu nebo prodejci a dejte jim vědět, že byste u nich rádi získávali MioCoiny za nákupy.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
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
            className="w-full bg-gradient-to-r from-[#FF8A00] to-[#FFB547] font-bold text-black transition-all duration-300 hover:from-[#FFB547] hover:to-[#FF8A00] hover:shadow-lg hover:shadow-primary/20 sm:w-auto"
          >
            <Mail className="h-4 w-4" />
            Připravit e-mail
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RecommendShopMailtoCard;
