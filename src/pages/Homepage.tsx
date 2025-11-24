import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast({
        title: "Chyba",
        description: "Nesprávný email nebo heslo",
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  return (
    <div className="relative min-h-screen bg-cover bg-center" style={{ backgroundImage: "url(/bg.jpg)" }}>
      <div className="absolute top-6 left-6 bg-black/80 p-8 rounded-xl w-full max-w-sm backdrop-blur-md shadow-2xl">
        <h1 className="text-white text-2xl font-bold mb-6 text-center">Přihlášení</h1>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-white/10 text-white placeholder-white/60 border border-white/20 focus:outline-none"
          />

          <input
            type="password"
            placeholder="Heslo"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-white/10 text-white placeholder-white/60 border border-white/20 focus:outline-none"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-white text-black font-semibold rounded-md hover:bg-white/90 transition"
          >
            {loading ? "Přihlašování…" : "Přihlásit se"}
          </button>
        </form>
      </div>
    </div>
  );
}
