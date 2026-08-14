import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import CMSPageLayout from '@/components/cms/CMSPageLayout';
import SupportForm from '@/components/SupportForm';
import ContactForm from '@/components/ContactForm';
import { normalizeSlug, transformContentToHtml } from '@/lib/cms-content-utils';
import { isNativeApp } from '@/lib/nativeApp';

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
 * ContentPage - Dynamic CMS page renderer
 * 
 * Renders CMS content pages from the database using a unified layout.
 * Supports all sections: Info, Support, and Legal.
 * 
 * Special handling:
 * - /support/nahlasit-problem: Shows SupportForm
 * - /support/kontakt: Shows ContactForm
 */
const ContentPage: React.FC = () => {
  const { section, slug } = useParams<{ section: string; slug: string }>();
  const [page, setPage] = useState<ContentPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Check if this is a support form page (normalize slug to handle diacritics)
  const normalizedSlug = slug ? normalizeSlug(slug) : '';
  const showSupportForm = section === 'support' && normalizedSlug === 'nahlasit-problem';
  const showContactForm = section === 'support' && normalizedSlug === 'kontakt';

  // Transform content to structured HTML (unified Legal pages format)
  const transformedContent = useMemo(() => {
    if (!page?.content) return '';

    let content = page.content;

    // Nativní aplikace: skrytí nákupu voucherů na stránce Jak to funguje
    // Důvod: Apple/Google pravidla zakazují odkazovat na externí nákupy digitálního obsahu
    if (isNativeApp() && slug === 'jak-to-funguje') {
      content = content.replace('nákupem digitálních voucherů přímo na platformě OneMil,', '');
    }

    return transformContentToHtml(content);
  }, [page?.content, slug]);

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
    <CMSPageLayout
      title={page?.title}
      version={page?.version}
      content={transformedContent}
      metaDescription={page?.content.substring(0, 160)}
      loading={loading}
    >
      {/* Contact Form - Only on support/kontakt page */}
      {showContactForm && (
        <div className="pt-6">
          <ContactForm />
        </div>
      )}
      
      {/* Support Form - Only on nahlasit-problem page */}
      {showSupportForm && (
        <div className="pt-6">
          <SupportForm />
        </div>
      )}
    </CMSPageLayout>
  );
};

export default ContentPage;
