import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface Banner {
  id: string;
  title: string;
  image_url: string;
  active: boolean;
  target_page: string;
  start_date: string | null;
  end_date: string | null;
}

interface BannerCarouselProps {
  targetPage?: string;
  autoplay?: boolean;
  autoplayInterval?: number;
  className?: string;
}

export const BannerCarousel: React.FC<BannerCarouselProps> = ({ 
  targetPage = 'homepage_customer',
  autoplay = true,
  autoplayInterval = 5000,
  className = ''
}) => {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveBanners();
  }, [targetPage]);

  useEffect(() => {
    if (!autoplay || banners.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, autoplayInterval);

    return () => clearInterval(interval);
  }, [autoplay, autoplayInterval, banners.length]);

  const fetchActiveBanners = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('banners')
        .select('id, title, image_url, active, target_page, start_date, end_date')
        .eq('active', true)
        .eq('target_page', targetPage)
        .or(`start_date.is.null,start_date.lte.${today}`)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBanners(data || []);
    } catch (error: any) {
      console.error('Error fetching banners:', error);
      toast.error('Chyba při načítání bannerů');
    } finally {
      setLoading(false);
    }
  };

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  if (loading) {
    return (
      <div className={`relative overflow-hidden rounded-lg ${className}`}>
        <div className="h-48 md:h-64 bg-gradient-to-br from-primary/10 to-secondary/10 animate-pulse flex items-center justify-center">
          <div className="text-muted-foreground">Načítání bannerů...</div>
        </div>
      </div>
    );
  }

  if (banners.length === 0) {
    return null; // Don't show anything if no banners
  }

  if (banners.length === 1) {
    // Single banner - no carousel controls needed
    const banner = banners[0];
    return (
      <div className={`relative overflow-hidden rounded-lg ${className}`}>
        <div className="relative h-48 md:h-64">
          <img
            src={banner.image_url}
            alt={banner.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end p-6">
            <h2 className="text-white text-xl md:text-2xl font-bold">
              {banner.title}
            </h2>
          </div>
        </div>
      </div>
    );
  }

  // Multiple banners - full carousel
  const currentBanner = banners[currentIndex];

  return (
    <div className={`relative overflow-hidden rounded-lg ${className}`}>
      <div className="relative h-48 md:h-64">
        <img
          src={currentBanner.image_url}
          alt={currentBanner.title}
          className="w-full h-full object-cover transition-opacity duration-500"
        />
        
        {/* Overlay with title */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent flex items-end p-6">
          <h2 className="text-white text-xl md:text-2xl font-bold drop-shadow-lg">
            {currentBanner.title}
          </h2>
        </div>

        {/* Navigation arrows */}
        <Button
          variant="outline"
          size="sm"
          className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-white/20 border-white/30 text-white hover:bg-white/30 backdrop-blur-sm"
          onClick={goToPrevious}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-white/20 border-white/30 text-white hover:bg-white/30 backdrop-blur-sm"
          onClick={goToNext}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {/* Dot indicators */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
          {banners.map((_, index) => (
            <button
              key={index}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentIndex 
                  ? 'bg-white scale-125' 
                  : 'bg-white/50 hover:bg-white/75'
              }`}
              onClick={() => setCurrentIndex(index)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};