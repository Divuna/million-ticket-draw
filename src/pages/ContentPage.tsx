import React, { useState, useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Skeleton } from '@/components/ui/skeleton';
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

const ContentPage: React.FC = () => {
  const { section, slug } = useParams<{ section: string; slug: string }>();
  const [page, setPage] = useState<ContentPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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
                  
                  /* Headings */
                  prose-headings:font-heading prose-headings:font-semibold
                  prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-5 prose-h2:text-foreground prose-h2:border-b prose-h2:border-border/20 prose-h2:pb-3
                  prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-4 prose-h3:text-foreground/90
                  prose-h4:text-lg prose-h4:mt-6 prose-h4:mb-3 prose-h4:text-foreground/85
                  
                  /* Body text */
                  prose-p:text-muted-foreground prose-p:leading-[1.8] prose-p:mb-5 prose-p:text-base
                  
                  /* Lists */
                  prose-ul:my-5 prose-ul:space-y-2
                  prose-ol:my-5 prose-ol:space-y-2
                  prose-li:text-muted-foreground prose-li:leading-[1.7] prose-li:marker:text-primary/60
                  
                  /* Links */
                  prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-a:font-medium prose-a:transition-colors
                  
                  /* Strong/Bold */
                  prose-strong:text-foreground prose-strong:font-semibold
                  
                  /* Blockquotes */
                  prose-blockquote:border-l-primary/50 prose-blockquote:bg-muted/30 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:italic prose-blockquote:text-muted-foreground
                  
                  /* Tables */
                  prose-table:border-collapse
                  prose-th:bg-muted/40 prose-th:px-4 prose-th:py-3 prose-th:text-left prose-th:font-semibold prose-th:text-foreground/90 prose-th:border-b prose-th:border-border/30
                  prose-td:px-4 prose-td:py-3 prose-td:border-b prose-td:border-border/20 prose-td:text-muted-foreground
                  
                  /* Code */
                  prose-code:bg-muted/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:text-foreground/90
                  
                  /* HR */
                  prose-hr:border-border/30 prose-hr:my-10
                "
                dangerouslySetInnerHTML={{ __html: page.content }}
              />
            </div>
          </article>
        ) : null}
      </main>
    </div>
  );
};

export default ContentPage;
