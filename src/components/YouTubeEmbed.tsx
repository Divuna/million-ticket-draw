import React, { useState, useCallback } from 'react';

interface YouTubeEmbedProps {
  url: string;
  className?: string;
  autoActivate?: boolean;
}

const YouTubeEmbed: React.FC<YouTubeEmbedProps> = ({ url, className = "", autoActivate = false }) => {
  const getVideoId = useCallback((url: string) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }, []);

  const videoId = getVideoId(url);
  const [activated, setActivated] = useState(autoActivate);

  if (!videoId) return null;

  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1&autoplay=1`;

  return (
    <div className={`relative w-full ${className}`}>
      <div className="aspect-video rounded-lg overflow-hidden shadow-lg">
        {activated ? (
          <iframe
            src={embedUrl}
            title="YouTube video"
            className="w-full h-full"
            frameBorder="0"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setActivated(true)}
            className="relative w-full h-full group cursor-pointer bg-black"
            aria-label="Přehrát video"
          >
            <img
              src={thumbnailUrl}
              alt="Video thumbnail"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                // Fall back to medium quality thumbnail
                e.currentTarget.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
              }}
            />
            {/* Dark overlay */}
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors duration-300" />
            {/* Play button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-red-600 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform duration-300">
                <svg
                  viewBox="0 0 24 24"
                  fill="white"
                  className="w-7 h-7 md:w-9 md:h-9 ml-1"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
};

export default React.memo(YouTubeEmbed);
