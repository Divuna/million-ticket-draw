import React, { useState, useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import CMSPageLayout from '@/components/cms/CMSPageLayout';
import { transformContentToHtml } from '@/lib/cms-content-utils';

interface ContentPageData {
  id: string;
  title: string;
  slug: string;
  section: string;
  content: string;
  version: string | null;
  is_active: boolean;
}

interface SlugContentPageProps {
  slug: string;
}

/**
 * SlugContentPage - Renders a CMS page resolved by slug only (no section in URL).
 * Used for top-level legal routes like /vop, /gdpr, /pravidla-souteze.
 */
const SlugContentPage: React.FC<SlugContentPageProps> = ({ slug }) => {
  const [page, setPage] = useState<ContentPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const transformedContent = useMemo(() => {
    if (!page?.content) return '';
    return transformContentToHtml(page.content);
  }, [page?.content]);

  useEffect(() => {
    const fetchPage = async () => {
      try {
        const { data, error } = await supabase
          .from('content_pages')
          .select('*')
          .eq('slug', slug)
          .eq('is_active', true)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          setNotFound(true);
        } else {
          setPage(data as ContentPageData);
        }
      } catch (err) {
        console.error('Error fetching slug content page:', err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchPage();
  }, [slug]);

  if (notFound) {
    return <Navigate to="/404" replace />;
  }

  return (
    <CMSPageLayout
      title={page?.title}
      version={page?.version}
      content={transformedContent}
      metaDescription={page?.content?.substring(0, 160)}
      loading={loading}
    />
  );
};

export default SlugContentPage;
