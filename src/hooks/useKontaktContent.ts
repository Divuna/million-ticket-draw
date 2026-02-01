import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface KontaktData {
  provozovatel: string;
  ico: string;
  sidlo: string;
  obchodniRejstrik: string;
  jednatel: string;
  email: string;
  telefon: string;
}

interface KontaktPage {
  title: string;
  description: string;
  data: KontaktData;
}

/**
 * Parses CMS content for the Kontakt page.
 * Expected format in CMS:
 * Provozovatel: iCONIC POINT s.r.o.
 * IČO: 177 95 851
 * Sídlo: Na Folimance 2155/15, Vinohrady, 120 00 Praha 2
 * Obchodní rejstřík: Zapsáno v obchodním rejstříku vedeném Městským soudem v Praze, oddíl C, vložka 376856
 * Jednatel: Pavel Diviš
 * E-mail: podpora@onemil.cz
 * Telefon: +420 776 532 562
 */
const parseKontaktContent = (content: string): KontaktData => {
  const lines = content.split('\n');
  const data: KontaktData = {
    provozovatel: '',
    ico: '',
    sidlo: '',
    obchodniRejstrik: '',
    jednatel: '',
    email: '',
    telefon: '',
  };

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return;

    // Match pattern "Label: Value"
    const colonIndex = trimmedLine.indexOf(':');
    if (colonIndex === -1) return;

    const label = trimmedLine.substring(0, colonIndex).trim().toLowerCase();
    const value = trimmedLine.substring(colonIndex + 1).trim();

    // Normalize label for matching (remove diacritics)
    const normalizedLabel = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (normalizedLabel === 'provozovatel') {
      data.provozovatel = value;
    } else if (normalizedLabel === 'ico') {
      data.ico = value;
    } else if (normalizedLabel === 'sidlo') {
      data.sidlo = value;
    } else if (normalizedLabel.includes('obchodni rejstrik') || normalizedLabel.includes('zapis')) {
      data.obchodniRejstrik = value;
    } else if (normalizedLabel === 'jednatel') {
      data.jednatel = value;
    } else if (normalizedLabel === 'e-mail' || normalizedLabel === 'email') {
      data.email = value;
    } else if (normalizedLabel === 'telefon' || normalizedLabel === 'tel') {
      data.telefon = value;
    }
  });

  return data;
};

export const useKontaktContent = () => {
  const [page, setPage] = useState<KontaktPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchKontakt = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('content_pages')
          .select('title, content')
          .eq('section', 'info')
          .eq('slug', 'kontakt')
          .eq('is_active', true)
          .is('deleted_at', null)
          .maybeSingle();

        if (fetchError) throw fetchError;

        if (data) {
          setPage({
            title: data.title,
            description: 'Kontaktní informace a údaje o provozovateli aplikace OneMil',
            data: parseKontaktContent(data.content),
          });
        } else {
          setError('Kontakt page not found in CMS');
        }
      } catch (err) {
        console.error('Error fetching kontakt page:', err);
        setError('Failed to load contact information');
      } finally {
        setLoading(false);
      }
    };

    fetchKontakt();
  }, []);

  return { page, loading, error };
};

export const useLegalLinks = () => {
  const [links, setLinks] = useState<{ terms: string; privacy: string }>({
    terms: '/legal/obchodni-podminky',
    privacy: '/legal/ochrana-osobnich-udaju',
  });

  useEffect(() => {
    const fetchLegalLinks = async () => {
      try {
        const { data, error } = await supabase
          .from('content_pages')
          .select('slug, title')
          .eq('section', 'legal')
          .eq('is_active', true)
          .is('deleted_at', null);

        if (error) throw error;

        if (data) {
          data.forEach((page) => {
            const normalizedSlug = page.slug.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            if (normalizedSlug.includes('obchodni-podminky') || normalizedSlug.includes('vseobecne')) {
              setLinks((prev) => ({ ...prev, terms: `/legal/${page.slug}` }));
            } else if (normalizedSlug.includes('ochrana') || normalizedSlug.includes('privacy') || normalizedSlug.includes('osobnich-udaju')) {
              setLinks((prev) => ({ ...prev, privacy: `/legal/${page.slug}` }));
            }
          });
        }
      } catch (err) {
        console.error('Error fetching legal links:', err);
      }
    };

    fetchLegalLinks();
  }, []);

  return links;
};
