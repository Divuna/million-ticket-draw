import landingImage from '@/assets/onemil-landing.png';

const Homepage = () => {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <img 
        src={landingImage} 
        alt="OneMil"
        className="w-full h-auto max-h-screen object-contain"
      />
    </div>
  );
};

export default Homepage;
