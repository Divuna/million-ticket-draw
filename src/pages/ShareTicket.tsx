import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Facebook } from 'lucide-react';
import logoOnemil from '@/assets/redesign/onemil-logo.png';
import { supabaseUrl } from '@/integrations/supabase/client';

const ShareTicket: React.FC = () => {
  const { ticketId } = useParams<{ ticketId: string }>();

  const publicTicketImageUrl = useMemo(() => {
    if (!ticketId) return null;
    return `${supabaseUrl}/storage/v1/object/public/ticket-shares/${ticketId}.png`;
  }, [ticketId]);

  const [imageUrl, setImageUrl] = useState<string | null>(publicTicketImageUrl);
  const [isLoading, setIsLoading] = useState(true);

  const ogImage = `${supabaseUrl}/functions/v1/og-ticket-share?id=${encodeURIComponent(ticketId)}`;
  const pageUrl = `https://onemil.cz/share/ticket/${ticketId}`;
  
  // Keep UI loading state, but compute image URL synchronously for OG crawlers.
  useEffect(() => {
    setImageUrl(publicTicketImageUrl);
    setIsLoading(false);
  }, [publicTicketImageUrl]);

  const shareUrl = ogImage;
  const ogTitle = 'Zkusil jsem štěstí na OneMil!';
  // Bez čísla tiketu – sdílí se jen soutěž a výhra (rozhodnutí Pavla, deska 26).
  const ogDescription = 'Zkus to taky na onemil.cz';

  const handleShareFacebook = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      '_blank',
      'width=600,height=400'
    );
  };

  const handleShareX = () => {
    const text = `${ogTitle} ${ogDescription}`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`,
      '_blank',
      'width=600,height=400'
    );
  };

  return (
    <>
      <Helmet>
        <title>{ogTitle}</title>
        <meta name="description" content={ogDescription} />
        
        {/* Open Graph / Facebook */}
        <meta property="og:title" content="Zkusil jsem štěstí na OneMil!" />
        <meta property="og:description" content={ogDescription} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={ogImage} />
        <meta name="twitter:url" content={pageUrl} />
        <meta name="twitter:title" content={ogTitle} />
        <meta name="twitter:description" content={ogDescription} />
      </Helmet>

      <div className="om-share min-h-screen flex flex-col items-center justify-center p-4">
        <img src={logoOnemil} alt="OneMil" className="mb-6 h-14 w-auto" />

        <h1 className="om-share-title">{ogTitle}</h1>
        <p className="mb-6 text-center text-[15px] text-[#5E5B57]">{ogDescription}</p>

        {/* Náhled sdíleného tiketu */}
        <div className="mb-8 w-full max-w-md">
          {isLoading ? (
            <div className="om-share-frame flex aspect-[1200/630] items-center justify-center">
              <div className="text-sm text-[#A9AAB3]">Načítám...</div>
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt="Náhled tiketu"
              className="om-share-frame w-full"
              onError={() => setImageUrl(null)}
            />
          ) : (
            <div className="om-share-frame flex aspect-[1200/630] items-center justify-center">
              <div className="p-4 text-center text-sm text-[#A9AAB3]">Náhled tiketu není k dispozici</div>
            </div>
          )}
        </div>

        {/* Sdílení */}
        <div className="mb-8 flex w-full max-w-md flex-col gap-2.5 sm:flex-row">
          <Button variant="outline" size="lg" className="om-share-btn flex-1 gap-2" onClick={handleShareFacebook}>
            <Facebook className="h-5 w-5 text-[#1877F2]" />
            Sdílet na Facebook
          </Button>
          <Button variant="outline" size="lg" className="om-share-btn flex-1 gap-2" onClick={handleShareX}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            Sdílet na X
          </Button>
        </div>

        {/* Pozvánka pro kamaráda (✦ NAVÍC) */}
        <div className="w-full max-w-md text-center">
          <p className="mb-3 text-[#5E5B57]">Chceš taky zkusit štěstí?</p>
          <button type="button" className="om-ps-gold" onClick={() => (window.location.href = 'https://onemil.cz')}>
            Vyzkoušet OneMil
          </button>
        </div>
      </div>
    </>
  );
};

export default ShareTicket;
