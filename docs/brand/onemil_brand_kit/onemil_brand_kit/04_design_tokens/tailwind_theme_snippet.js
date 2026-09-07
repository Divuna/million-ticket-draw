// OneMil PUBLIC Tailwind reference — merge into existing config only after review.
// Authoritative visual source: docs/advertising/GRAPHICS_SOURCE_OF_TRUTH.md
// Retired dark-premium colors must not be used as the default public background.
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        heading: ['Poppins', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        om: {
          white: '#FFFFFF',
          cream: '#FAFAF9',
          cloud: '#F7F8FB',
          ink: '#111827',
          slate: '#4B5563',
          border: '#E5E7EB',
          orange: '#FF8A00',
          uiOrange: '#F97316',
          amber: '#FFB547',
          gold: '#D8BA78',
        },
      },
      boxShadow: {
        'om-card': '0 12px 30px rgba(17,24,39,0.08)',
        'om-cta': '0 8px 20px rgba(255,138,0,0.18)',
      },
    },
  },
};
