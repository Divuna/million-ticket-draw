import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Tag, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { UserOffer } from '@/components/OfferCard';

interface OfferDetailModalProps {
  offer: UserOffer | null;
  open: boolean;
  onClose: () => void;
  /** Called with the user_partner_offers.id after a successful hide so the parent can drop it from the list. */
  onHidden: (upoId: string) => void;
}

export const OfferDetailModal: React.FC<OfferDetailModalProps> = ({
  offer,
  open,
  onClose,
  onHidden,
}) => {
  const [hiding, setHiding] = useState(false);

  // ── Write opened_at on first open ─────────────────────────────────────────
  // Only fires when the modal becomes visible and opened_at is still NULL.
  // Non-fatal: a failure here does not close the modal or block the user.
  useEffect(() => {
    if (!open || !offer) return;
    if (offer.opened_at) return; // already written previously

    supabase
      .from('user_partner_offers')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', offer.id)
      .then(({ error }) => {
        if (error) {
          console.warn('OfferDetailModal: opened_at update failed (non-fatal):', error.message);
        }
      });
  }, [open, offer?.id]); // depend on offer.id so effect re-runs if a different offer is opened

  // ── Record click in partner_offer_clicks (fire-and-forget) ─────────────────
  // Fires every time the modal opens — counts impressions/clicks per offer.
  // Never blocks the user; errors are silently swallowed.
  useEffect(() => {
    if (!open || !offer) return;

    supabase
      .from('partner_offer_clicks')
      .insert({ offer_id: offer.offer_id })
      .then(({ error }) => {
        if (error) {
          console.warn('OfferDetailModal: click insert failed (non-fatal):', error.message);
        }
      });
  }, [open, offer?.id]); // re-runs if a different offer is opened

  if (!offer) return null;
  const data = offer.partner_offers;
  if (!data) return null;

  const partnerName = data.partners?.company_name ?? data.partners?.name ?? '';
  const imageUrl = data.banner_url ?? data.logo_url ?? null;

  // ── Hide offer ─────────────────────────────────────────────────────────────
  // Writes hidden_at → DB trigger (Block F) fires the system message to messages.
  // After success the offer is removed from the active list via onHidden callback.
  const handleHide = async () => {
    setHiding(true);
    try {
      const { error } = await supabase
        .from('user_partner_offers')
        .update({ hidden_at: new Date().toISOString() })
        .eq('id', offer.id);

      if (error) throw error;

      onHidden(offer.id);
      onClose();
      toast({
        title: 'Nabídka skryta',
        description: 'Nabídka byla odstraněna z vašeho seznamu.',
      });
    } catch (err: any) {
      console.error('OfferDetailModal: hide failed:', err.message);
      toast({
        title: 'Chyba',
        description: 'Nepodařilo se skrýt nabídku. Zkuste to znovu.',
        variant: 'destructive',
      });
    } finally {
      setHiding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border p-0 overflow-hidden">

        {/* Banner / logo image */}
        {imageUrl && (
          <div className="relative w-full h-56 bg-muted/40">
            <img
              src={imageUrl}
              alt={data.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute top-4 left-4">
              <Badge className="bg-background/80 text-foreground border-0 backdrop-blur-sm">
                <Tag className="h-4 w-4 text-blue-400 mr-1" />
                Nabídka partnera
              </Badge>
            </div>
          </div>
        )}

        <div className="p-6 space-y-5">

          {/* Header */}
          <DialogHeader className="space-y-1">
            {partnerName && (
              <p className="text-sm text-blue-400 font-medium uppercase tracking-wide">
                {partnerName}
              </p>
            )}
            <DialogTitle className="text-xl font-bold text-foreground">
              {data.title}
            </DialogTitle>
          </DialogHeader>

          {/* Short text */}
          {data.short_text && (
            <p className="text-sm text-muted-foreground leading-relaxed">{data.short_text}</p>
          )}

          {/* Dates */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 shrink-0" />
              <span>Získáno: {new Date(offer.obtained_at).toLocaleDateString('cs-CZ')}</span>
            </div>
            {data.valid_to && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 shrink-0" />
                <span>Platí do: {new Date(data.valid_to).toLocaleDateString('cs-CZ')}</span>
              </div>
            )}
          </div>

          {/* Code / link block */}
          {data.link_or_code && (
            <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">
                Kód / odkaz nabídky
              </p>
              <p className="text-sm font-mono text-foreground break-all select-all">
                {data.link_or_code}
              </p>
            </div>
          )}

          {/* Info note */}
          <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
            <p className="text-sm text-muted-foreground">
              Tato nabídka byla přidělena automaticky k vašemu tiketu. Pro uplatnění kontaktujte
              partnera nebo využijte kód výše.
            </p>
          </div>

          {/* Hide button */}
          <Button
            onClick={handleHide}
            disabled={hiding}
            variant="outline"
            className="w-full text-muted-foreground border-border/50 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
          >
            <EyeOff className="w-4 h-4 mr-2" />
            {hiding ? 'Skrývám…' : 'Skrýt nabídku'}
          </Button>

        </div>
      </DialogContent>
    </Dialog>
  );
};
