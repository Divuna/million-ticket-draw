import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Skeleton } from '@/components/ui/skeleton';
import SupportForm from '@/components/SupportForm';
import ContactForm from '@/components/ContactForm';
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
/**
 * Transforms the "nahlásit-problém" support page content into structured HTML.
 * This page has a specific format with section headings and bullet lists.
 */
const transformSupportPageContent = (content: string): string => {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const result: string[] = [];
  let inList = false;
  
  // Patterns for this specific page
  const sectionHeadings = [
    'Formulář slouží k nahlášení například:',
    'Co se stane po odeslání',
    'Doporučení pro rychlejší vyřešení',
    'Jiný způsob kontaktu',
    'Jaký typ problému řešíte?'
  ];
  
  const listStarters = [
    'Po odeslání formuláře:',
    'Do zprávy uveďte co nejpřesnější informace, například:'
  ];

  const closeList = () => {
    if (inList) {
      result.push('</ul>');
      inList = false;
    }
  };

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    
    if (!trimmedLine) {
      closeList();
      return;
    }

    // Check if it's a section heading
    if (sectionHeadings.includes(trimmedLine)) {
      closeList();
      result.push(`<h3 class="cms-section-heading">${trimmedLine}</h3>`);
      return;
    }

    // Check if it's a list starter (rendered as paragraph followed by list)
    if (listStarters.includes(trimmedLine)) {
      closeList();
      result.push(`<p class="cms-list-intro">${trimmedLine}</p>`);
      return;
    }

    // Check if line looks like a list item (ends with comma or period, starts lowercase or with specific patterns)
    const isListItem = 
      trimmedLine.endsWith(',') || 
      (trimmedLine.match(/^[a-záčďéěíňóřšťúůýž]/) && !trimmedLine.includes('Pokud')) ||
      trimmedLine.startsWith('obdržíte') ||
      trimmedLine.startsWith('váš dotaz') ||
      trimmedLine.startsWith('v případě potřeby') ||
      trimmedLine.startsWith('e-mail,') ||
      trimmedLine.startsWith('popis') ||
      trimmedLine.startsWith('kdy k') ||
      trimmedLine.startsWith('případně');

    if (isListItem) {
      if (!inList) {
        result.push('<ul class="cms-bullet-list">');
        inList = true;
      }
      // Clean up trailing comma for display
      const cleanText = trimmedLine.replace(/,$/, '');
      result.push(`<li>${cleanText}</li>`);
      return;
    }

    // Regular paragraph
    closeList();
    result.push(`<p>${trimmedLine}</p>`);
  });

  closeList();
  return result.join('\n');
};

/**
 * Transforms plain text content into structured HTML for FAQ/legal documents.
 * - Lines starting with "1.", "2.", "1.1", etc. become questions with gold-accented numbers
 * - Text following until the next numbered line becomes the answer
 * - Empty lines split content into paragraphs
 */
const transformContentToHtml = (content: string, section?: string, slug?: string): string => {
  // If content already contains significant HTML tags, return as-is
  if (/<(div|section|article|h[1-6]|ul|ol|table)[^>]*>/i.test(content)) {
    return content;
  }

  // Special handling for the support/nahlásit-problém page
  const normalizedSlug = slug ? slug.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';
  if (section === 'support' && normalizedSlug === 'nahlasit-problem') {
    return transformSupportPageContent(content);
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
  const showContactForm = section === 'support' && normalizedSlug === 'kontakt';

  // Transform content to structured HTML
  const transformedContent = useMemo(() => {
    if (!page?.content) return '';
    return transformContentToHtml(page.content, page.section, page.slug);
  }, [page?.content, page?.section, page?.slug]);

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
    <div className="min-h-screen bg-background">
      {page && (
        <Helmet>
          <title>{page.title} | OneMil</title>
          <meta name="description" content={page.content.substring(0, 160)} />
        </Helmet>
      )}
      
      <Header />

      <div className="container max-w-3xl mx-auto px-4 py-8">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-4 w-32" />
            <Separator className="my-6" />
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        ) : page ? (
          <>
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-foreground">{page.title}</h1>
              {page.version && (
                <p className="mt-2 text-muted-foreground text-sm">
                  Verze: {page.version}
                </p>
              )}
            </div>

            {/* Content */}
            <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
              <div 
                className="
                  /* CMS Question styling - numbered headings */
                  [&_.cms-question]:text-xl [&_.cms-question]:font-semibold
                  [&_.cms-question]:text-foreground [&_.cms-question]:mt-8 [&_.cms-question]:mb-4
                  
                  /* CMS Number prefix - gold accent */
                  [&_.cms-number]:text-primary [&_.cms-number]:font-bold
                  
                  /* CMS Answer styling */
                  [&_.cms-answer]:text-muted-foreground [&_.cms-answer]:mb-4
                  
                  /* CMS Section Heading */
                  [&_.cms-section-heading]:text-xl [&_.cms-section-heading]:font-semibold
                  [&_.cms-section-heading]:text-foreground [&_.cms-section-heading]:mt-8 [&_.cms-section-heading]:mb-4
                  
                  /* CMS List Intro */
                  [&_.cms-list-intro]:text-muted-foreground [&_.cms-list-intro]:mb-4
                  
                  /* CMS Bullet List */
                  [&_.cms-bullet-list]:list-disc [&_.cms-bullet-list]:pl-6 [&_.cms-bullet-list]:space-y-2 [&_.cms-bullet-list]:my-4
                  [&_.cms-bullet-list>li]:text-muted-foreground
                  
                  /* Section headings */
                  [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-8 [&_h2]:mb-4
                  [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-6 [&_h3]:mb-3
                  
                  /* Body text */
                  [&_p]:text-muted-foreground [&_p]:mb-4
                  
                  /* Lists */
                  [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-muted-foreground [&_ul]:space-y-2
                  [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:text-muted-foreground [&_ol]:space-y-2
                  
                  /* Links */
                  [&_a]:text-primary [&_a]:hover:underline
                  
                  /* Strong */
                  [&_strong]:text-foreground [&_strong]:font-semibold
                "
                dangerouslySetInnerHTML={{ __html: transformedContent }}
              />
            </div>
            
            {/* Contact Form - Only on support/kontakt page */}
            {showContactForm && (
              <div className="mt-8">
                <ContactForm />
              </div>
            )}
            
            {/* Support Form - Only on nahlasit-problem page */}
            {showSupportForm && (
              <div className="mt-8">
                <SupportForm />
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};

export default ContentPage;
