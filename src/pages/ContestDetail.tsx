import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// UNIVERSÁLNÍ FALLBACK OBRÁZEK – Corvette
const FALLBACK_IMAGE = "https://raw.githubusercontent.com/cars-data/corvette-c8/main/blue-corvette.png";

export default function ContestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [contest, setContest] = useState<any>(null);
  const [bonusPrizes, setBonusPrizes] = useState<any[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // -----------------------------
  // LOAD CONTEST
  // -----------------------------
  useEffect(() => {
    const fetchContest = async () => {
      setLoading(true);

      // contest
      const { data: contestData } = await supabase.from("contests").select("*").eq("id", id).single();

      setContest(contestData);

      // bonus prizes
      const { data: prizesData } = await supabase.from("bonus_prizes").select("*").eq("contest_id", id);

      setBonusPrizes(prizesData || []);

      // user balance
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase.from("profiles").select("miocoin_balance").eq("id", user.id).single();

        setBalance(profile?.miocoin_balance ?? 0);
      }

      setLoading(false);
    };

    fetchContest();
  }, [id]);

  // -----------------------------
  // BUILD IMAGE URL
  // -----------------------------
  const resolveImage = (fileName: string | null) => {
    if (!fileName) return FALLBACK_IMAGE;

    return `https://${
      import.meta.env.VITE_SUPABASE_PROJECT_ID
    }.supabase.co/storage/v1/object/public/contest-banners/${fileName}`;
  };

  if (loading) return <div style={{ padding: 40 }}>Načítání…</div>;
  if (!contest) return <div style={{ padding: 40 }}>Soutěž nebyla nalezena.</div>;

  const bannerUrl = resolveImage(contest.banner_image);
  const mainImageUrl = resolveImage(contest.main_prize_secondary_image);

  const bonusPhysical = bonusPrizes.filter((b) => !b.amount);
  const bonusMio = bonusPrizes.filter((b) => b.amount);

  // Progress
  const checkpoints = [10000, 50000, 100000, 250000, 500000, 750000, 1000000];

  return (
    <div className="pb-20">
      {/* ---------------------------------------- */}
      {/* HORNÍ BAREVNA SE SE STÍNEM */}
      {/* ---------------------------------------- */}
      <div
        className="w-full"
        style={{
          height: 360,
          background: `linear-gradient(90deg, rgba(0,0,0,0.85), rgba(0,0,0,0.3)), url(${bannerUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
        }}
      ></div>

      {/* ---------------------------------------- */}
      {/* OBSAH */}
      {/* ---------------------------------------- */}
      <div className="max-w-5xl mx-auto -mt-40 px-4 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-4xl font-bold mb-4">{contest.title}</h1>
            <p className="text-gray-300 mb-4">{contest.description}</p>

            {/* CTA */}
            <div className="flex gap-3 mb-2">
              <Button className="bg-blue-600 hover:bg-blue-700">Uplatnit {contest.ticket_price} MioCoinů</Button>
              <Button className="bg-yellow-500 hover:bg-yellow-600 text-black">Dobít MioCoiny</Button>
            </div>

            <div className="text-sm text-gray-300">
              Zůstatek: <span className="font-semibold">{balance}</span> MioCoinů
            </div>
          </div>

          <div className="flex justify-center">
            <img
              src={mainImageUrl}
              alt={contest.title}
              className="w-full max-w-md rounded-xl shadow-lg object-contain"
            />
          </div>
        </div>

        {/* ---------------------------------------- */}
        {/* CESTA K HLAVNÍ VÝHŘE */}
        {/* ---------------------------------------- */}
        <div className="mt-16 p-6 bg-black/30 rounded-xl border border-white/10">
          <h2 className="text-xl font-bold mb-4">Cesta k hlavní výhře</h2>

          <div className="h-3 bg-gray-700 rounded-full relative overflow-hidden mb-6">
            <div
              className="h-3 bg-yellow-400 rounded-full transition-all"
              style={{
                width: `${((contest.tickets_sold ?? 0) / contest.ticket_count) * 100}%`,
              }}
            ></div>
          </div>

          {/* Checkpointy */}
          <div className="flex justify-between text-xs text-gray-300">
            {checkpoints.map((c) => (
              <div key={c} className="text-center w-full">
                <div className="h-3 w-3 bg-yellow-300 rounded-full mx-auto mb-1"></div>
                {c.toLocaleString("cs-CZ")}
              </div>
            ))}
          </div>
        </div>

        {/* ---------------------------------------- */}
        {/* BONUSOVÉ VĚCNÉ VÝHRY */}
        {/* ---------------------------------------- */}
        <div className="mt-12 p-6 bg-black/30 rounded-xl border border-white/10">
          <h2 className="text-xl font-bold mb-4">Bonusové věcné výhry</h2>

          {bonusPhysical.length === 0 && <div className="text-gray-400 text-sm">Žádné věcné bonusy.</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bonusPhysical.map((p) => (
              <div key={p.id} className="p-4 bg-black/50 border border-white/10 rounded-lg">
                <div className="font-bold">{p.description}</div>
                <div className="text-xs text-gray-400">Výherní ticket: {p.ticket_position}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ---------------------------------------- */}
        {/* BONUSOVÉ MIOCOINY */}
        {/* ---------------------------------------- */}
        <div className="mt-12 p-6 bg-black/30 rounded-xl border border-white/10">
          <h2 className="text-xl font-bold mb-4">Bonusové MioCoiny</h2>

          {bonusMio.length === 0 && <div className="text-gray-400 text-sm">Žádné bonusové MioCoiny.</div>}

          <div className="space-y-3">
            {bonusMio.map((p) => (
              <div key={p.id} className="p-4 bg-black/50 border border-white/10 rounded-lg flex justify-between">
                <div>
                  <div className="font-bold">{p.amount} MioCoinů</div>
                  <div className="text-xs text-gray-400">Výherní ticket: {p.ticket_position}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ---------------------------------------- */}
        {/* MOJE VÝHRY */}
        {/* ---------------------------------------- */}
        <div className="mt-12 p-6 bg-black/30 rounded-xl border border-white/10">
          <h2 className="text-xl font-bold mb-4">Moje výhry</h2>
          <div className="text-gray-400 text-sm">Nemáš žádné výhry.</div>
        </div>
      </div>
    </div>
  );
}
