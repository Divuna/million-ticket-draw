import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { toast } from '@/hooks/use-toast';
import { isNativeApp } from '@/lib/nativeApp';
import avatarShrug from '@/assets/redesign/avatar/avatar-krci-rameny.png';

const CANCEL_TEXT = 'Dobití MIO jsme zrušili. Žádné peníze ti nebyly strženy.';

const PaymentCancel: React.FC = () => {
  const navigate = useNavigate();
  // Nativní aplikace: platební stránky nejsou dostupné — okamžitý redirect.
  const nativeApp = isNativeApp();

  useEffect(() => {
    if (nativeApp) {
      navigate('/games', { replace: true });
      return;
    }
    // Show cancel toast
    toast({
      title: "Platba byla zrušena",
      description: CANCEL_TEXT,
      variant: "destructive"
    });
  }, [nativeApp, navigate]);

  if (nativeApp) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto px-4 py-8">
        <div className="om-pc mx-auto flex max-w-md flex-col items-center gap-3 px-6 pb-7 pt-6 text-center">
          <img
            src={avatarShrug}
            alt=""
            aria-hidden="true"
            className="om-float h-[170px] w-auto object-contain"
            style={{ filter: 'drop-shadow(0 12px 18px rgba(60,40,10,0.3))' }}
          />
          <h1 className="om-pc-title">Platba zrušena</h1>
          <p className="text-sm leading-relaxed text-[#5E5B57]">{CANCEL_TEXT}</p>
          <div className="mt-2 flex w-full flex-col gap-2.5">
            <button type="button" onClick={() => navigate('/top-up')} className="om-ps-gold">
              Zkusit znovu
            </button>
            <button type="button" onClick={() => navigate('/profile')} className="om-pc-ghost">
              Zpět do profilu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentCancel;
