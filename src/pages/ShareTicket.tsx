import React from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Facebook } from 'lucide-react';
import logoOnemil from '@/assets/logo-onemil.png';
import { supabaseUrl } from '@/integrations/supabase/client';

const OPAQUE_SHARE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ShareTicket: React.FC = () => {
  const { ticketId } = useParams<{ ticketId: string }>();
  const isOpaqueShareId = OPAQUE_SHARE_ID.test(ticketId ?? '');

  const ogImage = isOpaqueShareId
    ? `${supabaseUrl}/functions/v1/og-ticket-share?id=${encodeURIComponent(ticketId!)}`
    : '';
  const pageUrl = isOpaqueShareId ? `https://onemil.cz/share/ticket/${ticketId}` : 'https://onemil.cz';
  
  const shareUrl = ogImage;
  const ogTitle = 'Zkusil jsem štěstí na OneMil!';
  const ogDescription = 'Zkus štěstí taky na onemil.cz';

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

      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col items-center justify-center p-4">
        {/* Logo */}
        <img 
          src={logoOnemil} 
          alt="OneMil" 
          className="h-12 mb-6"
        />

        {/* Title */}
        <h1 className="text-2xl font-bold text-center mb-2">
          {ogTitle}
        </h1>
        <p className="text-muted-foreground text-center mb-6">
          {ogDescription}
        </p>

        {/* Ticket Image Preview */}
        <div className="w-full max-w-md mb-8">
          {ogImage ? (
            <img 
              src={ogImage}
              alt="Náhled výherní karty"
              className="w-full rounded-lg shadow-lg border border-border/30"
            />
          ) : (
            <div className="aspect-[1200/630] bg-muted/30 rounded-lg flex items-center justify-center">
              <div className="text-sm text-muted-foreground text-center p-4">
                Náhled tiketu není k dispozici
              </div>
            </div>
          )}
        </div>

        {/* Share Buttons */}
        <div className="flex gap-4 mb-8">
          <Button
            variant="outline"
            size="lg"
            className="gap-2"
            onClick={handleShareFacebook}
          >
            <Facebook className="h-5 w-5 text-[#1877F2]" />
            Sdílet na Facebook
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="gap-2"
            onClick={handleShareX}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            Sdílet na X
          </Button>
        </div>

        {/* CTA */}
        <div className="text-center">
          <p className="text-muted-foreground mb-4">
            Chceš taky zkusit štěstí?
          </p>
          <Button 
            size="lg"
            onClick={() => window.location.href = 'https://onemil.cz'}
          >
            Hrát na OneMil
          </Button>
        </div>
      </div>
    </>
  );
};

export default ShareTicket;
