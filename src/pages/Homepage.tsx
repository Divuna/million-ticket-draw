import landingImage from '@/assets/onemil-landing.png';

const Homepage = () => {
  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden">
      <img 
        src={landingImage} 
        alt="OneMil"
        className="w-full h-full object-cover object-center"
      />
    </div>
  );
};

export default Homepage;
