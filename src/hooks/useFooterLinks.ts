import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface FooterLink {
  id: string;
  title: string;
  slug: string;
  section: string;
  order: number | null;
}

interface FooterLinks {
  info: FooterLink[];
  support: FooterLink[];
  legal: FooterLink[];
}

export const useFooterLinks = () => {
  const [links, setLinks] = useState<FooterLinks>({
    info: [],
    support: [],
    legal: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLinks = async () => {
      try {
        const { data, error } = await supabase
          .from('content_pages')
          .select('id, title, slug, section, order')
          .eq('is_active', true)
          .is('deleted_at', null)
          .in('section', ['info', 'support', 'legal'])
          .order('order', { ascending: true })
          .order('title', { ascending: true });

        if (error) throw error;

        const grouped: FooterLinks = {
          info: [],
          support: [],
          legal: [],
        };

        (data || []).forEach((page) => {
          if (page.section === 'info') {
            grouped.info.push(page);
          } else if (page.section === 'support') {
            grouped.support.push(page);
          } else if (page.section === 'legal') {
            grouped.legal.push(page);
          }
        });

        setLinks(grouped);
      } catch (error) {
        console.error('Error fetching footer links:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLinks();
  }, []);

  return { links, loading };
};
