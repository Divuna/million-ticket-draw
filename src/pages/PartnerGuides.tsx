import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { BookOpen, Download, Rocket, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SHOPTET_GUIDE_INTRO,
  SHOPTET_GUIDE_PDF_PATH,
  SHOPTET_GUIDE_RESULTS,
  SHOPTET_GUIDE_RESULT_TITLE,
  SHOPTET_GUIDE_STEPS,
  SHOPTET_GUIDE_TITLE,
  type GuideFieldMapping,
  type GuideShot,
  type GuideSubstep,
} from '@/content/partnerGuides/shoptetGuide';

/**
 * Partner portal → Návody.
 *
 * Both this page and the downloadable PDF render the same module
 * (src/content/partnerGuides/shoptetGuide.ts), so the two versions cannot drift.
 * This page renders content only — it reads no partner data beyond the session
 * check and changes nothing.
 */

/** Renders `**bold**` segments; the guide marks what to click or type that way. */
function renderEmphasis(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

interface ShotProps {
  shot: GuideShot;
  onOpen: (shot: GuideShot) => void;
}

function Shot({ shot, onOpen }: ShotProps) {
  return (
    <figure className="space-y-2">
      <button
        type="button"
        onClick={() => onOpen(shot)}
        className="group relative block w-full overflow-hidden rounded-lg border border-border/60 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--neon-gold))]"
        aria-label={`Zvětšit obrázek: ${shot.alt}`}
      >
        <img
          src={shot.src}
          alt={shot.alt}
          loading="lazy"
          className="block w-full h-auto"
        />
        <span className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/65 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <ZoomIn className="h-3 w-3" />
          Zvětšit
        </span>
      </button>
      {shot.note && (
        <figcaption className="text-xs leading-relaxed text-muted-foreground">{shot.note}</figcaption>
      )}
    </figure>
  );
}

function ExportFieldsTable({ fields }: { fields: GuideFieldMapping[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border/60 bg-background">
      <table className="min-w-[46rem] w-full border-collapse text-left text-sm">
        <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Zákaznická skupina</th>
            <th scope="col" className="px-3 py-2 font-semibold">Zaškrtnout</th>
            <th scope="col" className="px-3 py-2 font-semibold">Exportovat jako</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((mapping) => (
            <tr key={`${mapping.group}-${mapping.field}`} className="border-t border-border/60 align-top">
              <td className="px-3 py-2 font-medium text-foreground">{mapping.group}</td>
              <td className="px-3 py-2 text-muted-foreground">{mapping.field}</td>
              <td className="px-3 py-2 font-mono text-[13px] font-semibold text-foreground">{mapping.exportAs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GuideSubstepCard({ substep, onOpen }: { substep: GuideSubstep; onOpen: (shot: GuideShot) => void }) {
  return (
    <section className="space-y-4 rounded-xl border border-[hsl(var(--neon-gold)/0.4)] bg-[hsl(var(--neon-gold)/0.05)] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-[hsl(var(--neon-gold))] px-1 text-sm font-bold text-black">
          {substep.number}
        </span>
        <div>
          <p className="text-[11px] font-bold tracking-wider text-[hsl(var(--neon-gold))]">KROK {substep.number}</p>
          <h3 className="mt-0.5 text-lg font-semibold text-[hsl(var(--text-silver))] sm:text-xl">{substep.title}</h3>
        </div>
      </div>

      <div className="space-y-2">
        {substep.body.map((paragraph, index) => (
          <p key={index} className="text-sm leading-relaxed text-muted-foreground">
            {renderEmphasis(paragraph)}
          </p>
        ))}
      </div>

      {substep.shots.map((shot) => (
        <Shot key={shot.src} shot={shot} onOpen={onOpen} />
      ))}

      <ExportFieldsTable fields={substep.fields} />

      <p className="rounded-lg border border-[hsl(var(--neon-gold)/0.45)] bg-[hsl(var(--neon-gold)/0.12)] p-3 text-sm font-bold leading-relaxed text-[hsl(var(--text-silver))]">
        {substep.important}
      </p>

      {substep.next && (
        <p className="rounded-lg border border-[hsl(var(--neon-gold)/0.3)] bg-background/70 p-3 text-sm font-medium leading-relaxed text-[hsl(var(--text-silver))]">
          {substep.next}
        </p>
      )}
    </section>
  );
}

const PartnerGuides: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [zoomed, setZoomed] = useState<GuideShot | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (!data?.user) {
        navigate('/partner/login');
        return;
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  if (loading) {
    return (
      <div>
        <div className="max-w-4xl mx-auto space-y-4 px-4 py-6 sm:px-6 lg:px-8">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4 text-[hsl(var(--neon-gold))]" />
          Návody
        </div>

        {/* Guide header + PDF download */}
        <Card className="border-[hsl(var(--neon-gold)/0.15)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-2xl text-[hsl(var(--text-silver))] sm:text-3xl">
              <Rocket className="h-6 w-6 flex-shrink-0 text-[hsl(var(--neon-gold))]" />
              {SHOPTET_GUIDE_TITLE}
            </CardTitle>
            <CardDescription className="text-base">{SHOPTET_GUIDE_INTRO}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="gap-2">
              <a href={SHOPTET_GUIDE_PDF_PATH} download>
                <Download className="h-4 w-4" />
                Stáhnout PDF návod
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* Steps */}
        {SHOPTET_GUIDE_STEPS.map((step) => (
          <Card
            key={step.number}
            data-testid={`guide-step-${step.number}`}
            className="border-[hsl(var(--neon-gold)/0.15)] transition-colors hover:border-[hsl(var(--neon-gold)/0.25)]"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start gap-4">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[hsl(var(--neon-gold))] text-lg font-bold text-black">
                  {step.number}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold tracking-wider text-[hsl(var(--neon-gold))]">
                    KROK {step.number}
                  </p>
                  <CardTitle className="mt-0.5 text-xl text-[hsl(var(--text-silver))] sm:text-2xl">
                    {step.title}
                  </CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {step.body.map((paragraph, i) => (
                  <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                    {renderEmphasis(paragraph)}
                  </p>
                ))}
              </div>

              <div className="space-y-4">
                {step.shots.slice(0, step.substepAfterFirstShot ? 1 : step.shots.length).map((shot) => (
                  <Shot key={shot.src + shot.alt} shot={shot} onOpen={setZoomed} />
                ))}

                {step.substepAfterFirstShot && (
                  <GuideSubstepCard substep={step.substepAfterFirstShot} onOpen={setZoomed} />
                )}

                {step.substepAfterFirstShot &&
                  step.shots.slice(1).map((shot) => (
                    <Shot key={shot.src + shot.alt} shot={shot} onOpen={setZoomed} />
                  ))}
              </div>

              {step.next && (
                <p className="rounded-lg border border-[hsl(var(--neon-gold)/0.3)] bg-[hsl(var(--neon-gold)/0.07)] p-3 text-sm font-medium leading-relaxed text-[hsl(var(--text-silver))]">
                  {step.next}
                </p>
              )}
            </CardContent>
          </Card>
        ))}

        {/* What the customer sees */}
        <Card data-testid="guide-results" className="border-[hsl(var(--neon-gold)/0.15)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl text-[hsl(var(--text-silver))] sm:text-2xl">
              {SHOPTET_GUIDE_RESULT_TITLE}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {SHOPTET_GUIDE_RESULTS.map((shot) => (
              <Shot key={shot.src} shot={shot} onOpen={setZoomed} />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Full-size preview */}
      <Dialog open={zoomed !== null} onOpenChange={(open) => !open && setZoomed(null)}>
        <DialogContent className="max-w-[95vw] p-2 sm:max-w-5xl">
          <DialogTitle className="sr-only">{zoomed?.alt ?? 'Náhled obrázku'}</DialogTitle>
          {zoomed && (
            <div className="max-h-[85vh] overflow-auto rounded-md bg-white">
              <img src={zoomed.src} alt={zoomed.alt} className="block h-auto w-full" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PartnerGuides;
