import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Skeleton } from '@/components/ui/skeleton';
import SupportForm from '@/components/SupportForm';
import { Separator } from '@/components/ui/separator';

interface ContentPageData {
  id: string;
  title: string;
  slug: string;
  section: string;
  content: string;
  version: string | null;
  is_active: boolean;
}

/**
 * Transforms plain text content into structured HTML for FAQ/legal documents.
 * - Lines starting with "1.", "2.", "1.1", etc. become questions with gold-accented numbers
 * - Text following until the next numbered line becomes the answer
 * - Empty lines split content into paragraphs
 */
const transformContentToHtml = (content: string): string => {
  // If content already contains significant HTML tags, return as-is
  if (/<(div|section|article|h[1-6]|ul|ol|table)[^>]*>/i.test(content)) {
    return content;
  }

  // Normalize line endings and split into lines
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  
  // Pattern for numbered questions: "1.", "2.", "1.1", "1.1.1", etc.
  const numberedPattern = /^((\d+\.)+)\s+(.+)$/;
  
  const result: string[] = [];
  let currentAnswer: string[] = [];
  let inQuestion = false;

  const flushAnswer = () => {
    if (currentAnswer.length > 0) {
      const answerText = currentAnswer.join('\n').trim();
      if (answerText) {
        // Split answer by empty lines into paragraphs
        const paragraphs = answerText.split(/\n\s*\n/);
        paragraphs.forEach((para) => {
          const trimmedPara = para.trim();
          if (trimmedPara) {
            // Replace single newlines with <br />
            const formattedPara = trimmedPara.replace(/\n/g, '<br />');
            result.push(`<p class="cms-answer">${formattedPara}</p>`);
          }
        });
      }
      currentAnswer = [];
    }
  };

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    const match = trimmedLine.match(numberedPattern);

    if (match) {
      // Flush any pending answer content
      flushAnswer();
      
      // Extract number prefix and question text
      const numberPrefix = match[1]; // e.g., "1." or "1.1."
      const questionText = match[3]; // The actual question text
      
      // Create question heading with separated number
      result.push(
        `<h3 class="cms-question"><span class="cms-number">${numberPrefix}</span> ${questionText}</h3>`
      );
      inQuestion = true;
    } else if (trimmedLine === '') {
      // Empty line - add to current answer for paragraph separation
      if (inQuestion) {
        currentAnswer.push('');
      }
    } else {
      // Regular text line - add to current answer
      currentAnswer.push(trimmedLine);
      inQuestion = true;
    }
  });

  // Flush any remaining answer content
  flushAnswer();

  return result.join('\n');
};

/**
 * Normalizes a string by removing diacritics (accents) for comparison.
 * e.g., "nahlásit-problém" → "nahlasit-problem"
 */
const normalizeSlug = (str: string): string => {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

const ContentPage: React.FC = () => {
  const { section, slug } = useParams<{ section: string; slug: string }>();
  const [page, setPage] = useState<ContentPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Check if this is the support form page (normalize slug to handle diacritics)
  const normalizedSlug = slug ? normalizeSlug(slug) : '';
  const showSupportForm = section === 'support' && normalizedSlug === 'nahlasit-problem';

  // Transform content to structured HTML
  const transformedContent = useMemo(() => {
    if (!page?.content) return '';
    return transformContentToHtml(page.content);
  }, [page?.content]);

  useEffect(() => {
    const fetchPage = async () => {
      if (!section || !slug) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('content_pages')
          .select('*')
          .eq('section', section)
          .eq('slug', slug)
          .eq('is_active', true)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          setNotFound(true);
        } else {
          setPage(data);
        }
      } catch (error) {
        console.error('Error fetching content page:', error);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchPage();
  }, [section, slug]);

  if (notFound) {
    return <Navigate to="/404" replace />;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {page && (
        <Helmet>
          <title>{page.title} | OneMil</title>
          <meta name="description" content={page.content.substring(0, 160)} />
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
        ) : page ? (
          <article className="rounded-2xl border border-border/30 bg-gradient-to-b from-card/60 to-card/40 backdrop-blur-sm shadow-[0_8px_32px_hsl(222_50%_3%/0.4)]">
            {/* Header Section */}
            <header className="px-8 md:px-12 pt-10 md:pt-14 pb-8">
              <h1 className="text-3xl md:text-4xl font-heading font-bold bg-gradient-to-r from-[hsl(var(--heading-gold))] via-[hsl(45_85%_60%)] to-[hsl(var(--heading-gold))] bg-clip-text text-transparent leading-tight">
                {page.title}
              </h1>
              {page.version && (
                <p className="mt-3 text-sm text-muted-foreground/80 font-medium">
                  Verze: {page.version}
                </p>
              )}
            </header>
            
            <Separator className="mx-8 md:mx-12 bg-gradient-to-r from-transparent via-border/40 to-transparent" />
            
            {/* Content Section */}
            <div className="px-8 md:px-12 py-10 md:py-12">
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
                dangerouslySetInnerHTML={{ __html: transformedContent }}
              />
            </div>
            
            {/* Support Form - Only on nahlasit-problem page (handles diacritics) */}
            {showSupportForm && (
              <div className="px-8 md:px-12 pb-10 md:pb-12 pt-4">
                <Separator className="mb-8 bg-border/30" />
                <SupportForm />
              </div>
            )}
          </article>
        ) : null}
      </main>
    </div>
  );
};

export default ContentPage;
