import React from 'react';

interface YouTubeEmbedProps {
  url: string;
  className?: string;
}

const YouTubeEmbed: React.FC<YouTubeEmbedProps> = ({ url, className = "" }) => {
  // Extract video ID from YouTube URL
  const getVideoId = (url: string) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const videoId = getVideoId(url);
  
  if (!videoId) {
    return (
      <div className="w-full h-64 bg-muted/30 rounded-lg flex items-center justify-center">
        <p className="text-muted-foreground">Neplatná YouTube URL</p>
      </div>
    );
  }

  const embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&showinfo=0`;

  return (
    <div className={`relative w-full ${className}`}>
      <div className="aspect-video rounded-lg overflow-hidden shadow-lg">
        <iframe
          src={embedUrl}
          title="YouTube video"
          className="w-full h-full"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
};

export default YouTubeEmbed;