import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import avatarShrug from "@/assets/redesign/avatar/avatar-krci-rameny.png";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="om-notfound flex min-h-screen items-start justify-center px-5 pb-28 pt-8 sm:items-center">
      <div className="flex w-full max-w-md flex-col items-center gap-3 text-center">
        <div className="relative flex h-[330px] w-full items-end justify-center">
          <strong aria-hidden="true" className="om-notfound-code om-float">
            404
          </strong>
          <img
            src={avatarShrug}
            alt="Avatar krčí rameny"
            className="om-notfound-avatar relative h-[250px] w-auto object-contain"
          />
        </div>
        <h1 className="om-notfound-title">Tahle stránka neexistuje</h1>
        <p className="text-sm leading-relaxed text-[#5E5B57]">
          Možná byla přesunuta, nebo je v adrese překlep. Pojď zpátky tam, kde se vyhrává.
        </p>
        <Link to="/" className="om-notfound-btn mt-1.5">
          Zpět na Domů
        </Link>
        <Link to="/games" className="flex min-h-[44px] items-center text-sm font-bold text-[#B5122B] hover:underline">
          Prohlédnout soutěže
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
