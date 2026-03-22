-- Add YouTube URL field for homepage video directly to banners table
ALTER TABLE public.banners 
ADD COLUMN homepage_youtube_url TEXT,
ADD COLUMN homepage_video_active BOOLEAN DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN public.banners.homepage_youtube_url IS 'YouTube URL for homepage instructional video';
COMMENT ON COLUMN public.banners.homepage_video_active IS 'Controls visibility of homepage video section';;
