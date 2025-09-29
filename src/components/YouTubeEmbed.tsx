import React from 'react';

interface YouTubeEmbedProps {
  url: string;
  title?: string;
  className?: string;
}

const YouTubeEmbed: React.FC<YouTubeEmbedProps> = ({ url, title = "YouTube video", className = "" }) => {
  // Extract video ID from various YouTube URL formats
  const getYouTubeVideoId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const videoId = getYouTubeVideoId(url);

  if (!videoId) {
    return (
      <div className={`bg-muted rounded-lg p-8 text-center ${className}`}>
        <p className="text-muted-foreground">Neplatná YouTube URL</p>
      </div>
    );
  }

  const embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&controls=1`;

  return (
    <div className={`relative w-full ${className}`}>
      <div className="relative aspect-video rounded-lg overflow-hidden bg-black/10 backdrop-blur-sm border border-white/10">
        <iframe
          src={embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 w-full h-full rounded-lg"
        />
      </div>
    </div>
  );
};

export default YouTubeEmbed;