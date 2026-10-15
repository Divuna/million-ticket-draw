import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { buildLoginRedirectUrl } from '@/lib/loginRedirect';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import avatarMail from '@/assets/redesign/avatar/avatar-telefon-voucher.png';
import avatarThumb from '@/assets/redesign/avatar/avatar-palec.png';

const UnsubscribeMarketing: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleUnsubscribe = async () => {
    if (!user) {
      toast({
        title: "Chyba",
        description: "Pro odhlášení z marketingových sdělení musíš být přihlášený.",
        variant: "destructive"
      });
      navigate(buildLoginRedirectUrl(location.pathname + location.search));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('user_legal_acceptances').insert({
        user_id: user.id,
        document_slug: 'marketing',
        document_version: 'revoked'
      });

      if (error) throw error;

      setSuccess(true);
      toast({
        title: "Odhlášení úspěšné",
        description: "Odhlásili jsme tě z marketingových sdělení."
      });

      // Send notification (non-blocking)
      supabase.functions.invoke('send-marketing-consent-notification', {
        body: { action: 'unsubscribe' }
      }).catch(err => console.error('Notification error:', err));
    } catch (error: any) {
      toast({
        title: "Chyba",
        description: error.message || "Nepodařilo se provést odhlášení.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="om-pc mx-auto flex w-full max-w-md flex-col items-center gap-3 px-6 pb-7 pt-6 text-center">
        {children}
      </div>
    </div>
  );

  if (!user) {
    return shell(
      <>
        <img src={avatarMail} alt="" aria-hidden="true" className="om-float h-[150px] w-auto object-contain" />
        <h1 className="om-pc-title">Přihlášení vyžadováno</h1>
        <p className="text-sm leading-relaxed text-[#5E5B57]">Pro odhlášení z marketingových sdělení se nejdřív přihlas.</p>
        <button
          type="button"
          className="om-ps-gold mt-2"
          onClick={() => navigate(buildLoginRedirectUrl(location.pathname + location.search))}
        >
          Přihlásit se
        </button>
      </>,
    );
  }

  if (success) {
    return shell(
      <>
        <img src={avatarThumb} alt="" aria-hidden="true" className="om-float h-[150px] w-auto object-contain" />
        <h1 className="om-pc-title">Odhlášení dokončeno</h1>
        <p className="text-sm leading-relaxed text-[#5E5B57]">Kdykoli se můžeš znovu přihlásit k odběru v Profilu.</p>
        <button type="button" className="om-ps-gold mt-2" onClick={() => navigate('/')}>
          Zpět na Domů
        </button>
      </>,
    );
  }

  return shell(
    <>
      <img src={avatarMail} alt="" aria-hidden="true" className="om-float h-[150px] w-auto object-contain" />
      <h1 className="om-pc-title text-[24px]">Odhlášení z marketingových sdělení</h1>
      <p className="text-sm leading-relaxed text-[#5E5B57]">
        Už ti nebudeme posílat novinky a nabídky. E-maily k účtu a výhrám ti chodit dál budou.
      </p>
      <p className="text-xs text-[#8E8F98]">
        E-mail: <strong className="text-[#3A3A40]">{user.email}</strong>
      </p>
      <div className="mt-2 flex w-full flex-col gap-2.5">
        <button type="button" className="om-ps-gold" onClick={handleUnsubscribe} disabled={loading}>
          {loading ? 'Zpracovávám...' : 'Odhlásit se'}
        </button>
        <button type="button" className="om-pc-ghost" onClick={() => navigate(-1)} disabled={loading}>
          Zpět
        </button>
      </div>
    </>,
  );
};

export default UnsubscribeMarketing;
