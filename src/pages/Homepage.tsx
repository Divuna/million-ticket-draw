import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import landingImage from "@/assets/onemil-landing.png";

const Homepage = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setErrorMsg("Nesprávný email nebo heslo.");
      return;
    }

    navigate("/domu"); // přesměrování po úspěšném loginu
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background Image */}
      <img src={landingImage} alt="OneMil" className="absolute inset-0 w-full h-full object-cover" />

      {/* Dark overlay for better readability */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Login box */}
      <div className="relative z-10 flex items-center justify-center min-h-screen">
        <div className="bg-black/70 backdrop-blur-xl p-8 rounded-2xl shadow-2xl w-[90%] max-w-[380px]">
          <h2 className="text-white text-2xl font-bold text-center mb-6">Přihlášení</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg bg-white/20 text-white placeholder-white/60 focus:outline-none"
              />
            </div>

            <div>
              <input
                type="password"
                placeholder="Heslo"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg bg-white/20 text-white placeholder-white/60 focus:outline-none"
              />
            </div>

            {errorMsg && <p className="text-red-400 text-sm text-center">{errorMsg}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black font-bold py-3 rounded-lg shadow-lg hover:bg-gray-200 transition-all"
            >
              {loading ? "Přihlašuji…" : "Přihlásit se"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Homepage;
