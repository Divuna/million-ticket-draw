import heroImage from "@/assets/onemil-hero.png";

const Homepage = () => {
  return (
    <div className="min-h-screen w-full overflow-hidden bg-black">
      <img 
        src={heroImage} 
        alt="OneMil - Tvoje šance právě začíná! Luxus, který můžeš vyhrát. Né koupit." 
        className="w-full h-screen object-cover object-center"
      />
    </div>
  );
};

export default Homepage;
