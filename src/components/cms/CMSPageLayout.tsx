import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Header } from '@/components/Header';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

interface CMSPageLayoutProps {
  title?: string;
  version?: string | null;
  content?: string;
  metaDescription?: string;
  loading?: boolean;
  children?: React.ReactNode;
}

/**
 * Unified CMS Page Layout
 * 
 * Provides consistent styling for all CMS pages (Info, Support, Legal).
 * Features:
 * - 950px max-width centered container
 * - Glass-morphism card with gradient background
 * - Gold-accented headings with proper typography
 * - Consistent spacing and prose styling
 */
const CMSPageLayout: React.FC<CMSPageLayoutProps> = ({
  title,
  version,
  content,
  metaDescription,
  loading = false,
  children,
}) => {
  return (
    <div className="min-h-screen bg-background pb-24">
      {title && (
        <Helmet>
          <title>{title} | OneMil</title>
          {metaDescription && <meta name="description" content={metaDescription} />}
        </Helmet>
      )}
      
      <Header />

      <main className="max-w-[950px] mx-auto px-6 py-12 md:py-16">
        {loading ? (
          <div className="rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm p-8 md:p-12">
            <Skeleton className="h-10 w-72 mb-4" />
            <Skeleton className="h-4 w-32 mb-8" />
            <Separator className="mb-8 bg-border/20" />
            <div className="space-y-5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        ) : (
          <article className="rounded-2xl border border-border/30 bg-gradient-to-b from-card/60 to-card/40 backdrop-blur-sm shadow-[0_8px_32px_hsl(222_50%_3%/0.4)]">
            {/* Header Section */}
            <header className="px-8 md:px-12 pt-10 md:pt-14 pb-8">
              <h1 className="text-3xl md:text-4xl font-heading font-bold bg-gradient-to-r from-[hsl(var(--heading-gold))] via-[hsl(45_85%_60%)] to-[hsl(var(--heading-gold))] bg-clip-text text-transparent leading-tight">
                {title}
              </h1>
              {version && (
                <p className="mt-3 text-sm text-muted-foreground/80 font-medium">
                  Verze: {version}
                </p>
              )}
            </header>
            
            <Separator className="mx-8 md:mx-12 bg-gradient-to-r from-transparent via-border/40 to-transparent" />
            
            {/* Content Section */}
            <div className="px-8 md:px-12 py-10 md:py-12">
              {content && (
                <div 
                  className="
                    prose prose-lg dark:prose-invert max-w-none
                    
                    /* CMS Question styling - numbered headings with gold accent */
                    [&_.cms-question]:font-heading [&_.cms-question]:font-semibold
                    [&_.cms-question]:text-lg [&_.cms-question]:md:text-xl
                    [&_.cms-question]:mt-10 [&_.cms-question]:mb-4
                    [&_.cms-question]:text-foreground
                    [&_.cms-question]:flex [&_.cms-question]:items-baseline [&_.cms-question]:gap-3
                    [&_.cms-question]:pb-3 [&_.cms-question]:border-b [&_.cms-question]:border-border/20
                    
                    /* CMS Number prefix - gold accent */
                    [&_.cms-number]:text-[hsl(var(--heading-gold))]
                    [&_.cms-number]:font-bold
                    [&_.cms-number]:text-lg [&_.cms-number]:md:text-xl
                    [&_.cms-number]:min-w-[2.5rem]
                    [&_.cms-number]:shrink-0
                    
                    /* CMS Answer styling */
                    [&_.cms-answer]:text-muted-foreground
                    [&_.cms-answer]:leading-[1.85]
                    [&_.cms-answer]:mb-6
                    [&_.cms-answer]:text-[15px] [&_.cms-answer]:md:text-base
                    [&_.cms-answer]:pl-0 [&_.cms-answer]:md:pl-[2.75rem]
                    
                    /* CMS Section Heading - for support page sections */
                    [&_.cms-section-heading]:font-heading [&_.cms-section-heading]:font-semibold
                    [&_.cms-section-heading]:text-lg [&_.cms-section-heading]:md:text-xl
                    [&_.cms-section-heading]:mt-10 [&_.cms-section-heading]:first:mt-0 [&_.cms-section-heading]:mb-4
                    [&_.cms-section-heading]:text-foreground
                    [&_.cms-section-heading]:pb-3 [&_.cms-section-heading]:border-b [&_.cms-section-heading]:border-border/20
                    
                    /* CMS List Intro - paragraph before bullet list */
                    [&_.cms-list-intro]:text-muted-foreground
                    [&_.cms-list-intro]:leading-[1.85] [&_.cms-list-intro]:mb-4
                    [&_.cms-list-intro]:text-[15px] [&_.cms-list-intro]:md:text-base
                    
                    /* CMS Bullet List - for support page lists */
                    [&_.cms-bullet-list]:my-4 [&_.cms-bullet-list]:mb-8 [&_.cms-bullet-list]:space-y-2 [&_.cms-bullet-list]:pl-6
                    [&_.cms-bullet-list]:list-disc
                    [&_.cms-bullet-list>li]:text-muted-foreground [&_.cms-bullet-list>li]:leading-[1.75]
                    [&_.cms-bullet-list>li]:text-[15px] [&_.cms-bullet-list>li]:md:text-base
                    [&_.cms-bullet-list>li::marker]:text-[hsl(var(--heading-gold))]
                    
                    /* Regular Headings - Section titles (for HTML content) */
                    prose-headings:font-heading prose-headings:font-semibold
                    prose-h2:text-xl prose-h2:md:text-2xl prose-h2:mt-12 prose-h2:mb-5 prose-h2:text-foreground 
                    prose-h2:border-b prose-h2:border-border/25 prose-h2:pb-4
                    prose-h2:bg-muted/20 prose-h2:-mx-4 prose-h2:px-4 prose-h2:pt-4 prose-h2:rounded-t-lg
                    prose-h3:text-lg prose-h3:md:text-xl prose-h3:mt-10 prose-h3:mb-4 prose-h3:text-foreground/90
                    prose-h4:text-base prose-h4:md:text-lg prose-h4:mt-8 prose-h4:mb-3 prose-h4:text-foreground/85 prose-h4:font-medium
                    
                    /* Body text - Readable paragraphs */
                    prose-p:text-muted-foreground prose-p:leading-[1.85] prose-p:mb-6 prose-p:text-[15px] prose-p:md:text-base
                    
                    /* Ordered lists - Numbered sections as blocks */
                    prose-ol:my-8 prose-ol:space-y-4 prose-ol:list-decimal prose-ol:pl-0
                    [&_ol>li]:bg-muted/15 [&_ol>li]:rounded-lg [&_ol>li]:p-5 [&_ol>li]:border [&_ol>li]:border-border/20
                    [&_ol>li]:list-inside [&_ol>li::marker]:font-bold [&_ol>li::marker]:text-primary/80
                    
                    /* Nested ordered lists (1.1, 1.2 etc) */
                    [&_ol_ol]:mt-4 [&_ol_ol]:mb-2 [&_ol_ol]:ml-4 [&_ol_ol]:space-y-2 [&_ol_ol]:border-l-2 [&_ol_ol]:border-border/30 [&_ol_ol]:pl-4
                    [&_ol_ol>li]:bg-transparent [&_ol_ol>li]:p-0 [&_ol_ol>li]:border-0 [&_ol_ol>li]:rounded-none
                    
                    /* Unordered lists */
                    prose-ul:my-6 prose-ul:space-y-3 prose-ul:pl-5
                    prose-li:text-muted-foreground prose-li:leading-[1.75] prose-li:text-[15px]
                    [&_ul>li]:pl-2 [&_ul>li::marker]:text-primary/50
                    
                    /* Links */
                    prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-a:font-medium prose-a:transition-colors
                    
                    /* Strong/Bold - Emphasis */
                    prose-strong:text-foreground prose-strong:font-semibold
                    
                    /* Blockquotes - Highlighted blocks */
                    prose-blockquote:border-l-4 prose-blockquote:border-primary/40 
                    prose-blockquote:bg-muted/25 prose-blockquote:py-4 prose-blockquote:px-6 
                    prose-blockquote:rounded-r-xl prose-blockquote:not-italic prose-blockquote:text-muted-foreground
                    prose-blockquote:my-8 prose-blockquote:shadow-sm
                    
                    /* Tables */
                    prose-table:border-collapse prose-table:w-full prose-table:my-8
                    prose-th:bg-muted/40 prose-th:px-4 prose-th:py-3 prose-th:text-left prose-th:font-semibold prose-th:text-foreground/90 prose-th:border-b prose-th:border-border/30
                    prose-td:px-4 prose-td:py-3 prose-td:border-b prose-td:border-border/20 prose-td:text-muted-foreground
                    
                    /* Code */
                    prose-code:bg-muted/50 prose-code:px-2 prose-code:py-1 prose-code:rounded-md prose-code:text-sm prose-code:text-foreground/90 prose-code:font-mono
                    
                    /* Horizontal rules - Section breaks */
                    prose-hr:border-border/30 prose-hr:my-12

                    /* Images */
                    prose-img:rounded-xl prose-img:shadow-lg prose-img:my-8
                  "
                  dangerouslySetInnerHTML={{ __html: content }}
                />
              )}
              
              {/* Additional content (forms, etc.) */}
              {children}
            </div>
          </article>
        )}
      </main>
    </div>
  );
};

export default CMSPageLayout;
