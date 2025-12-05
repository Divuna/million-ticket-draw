import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Loading from "@/components/Loading";

export default function ContestDetail() {
  const { id } = useParams();
  const [contest, setContest] = useState(null);
  const [bonusPrizes, setBonusPrizes] = useState([]);
  const [userPrizes, setUserPrizes] = useState([]);
  const [ticketsCount, setTicketsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // 🔥 1) Načtení jedné konkrétní soutěže
      const { data: contestData, error: contestError } = await supabase
        .from("contests")
        .select("*")
        .eq("id", id)
        .single();

      if (contestError) {
        setError("Nepodařilo se načíst soutěž.");
        setLoading(false);
        return;
      }

      // 🔥 2) OPRAVA – pouze věcné bonusové výhry patřící k této soutěži
      const { data: bonusData, error: bonusError } = await supabase
        .from("bonus_prizes")
        .select("*")
        .eq("contest_id", id)
        .eq("bonus_type", "physical");

      if (bonusError) {
        setError("Nepodařilo se načíst bonusové výhry.");
        setLoading(false);
        return;
      }

      // 🔥 3) Uživatelské výhry (beze změny)
      const { data: userPrizeData } = await supabase.from("winners").select("*").eq("contest_id", id);

      // 🔥 4) Počet odehraných ticketů
      const { data: ticketsData } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("contest_id", id);

      setContest(contestData);
      setBonusPrizes(bonusData || []);
      setUserPrizes(userPrizeData || []);
      setTicketsCount(ticketsData?.count || 0);
      setLoading(false);
    };

    fetchData();
  }, [id]);

  if (loading) return <Loading />;
  if (error) return <p className="text-center mt-8">{error}</p>;
  if (!contest) return <p className="text-center mt-8">Soutěž nenalezena.</p>;

  return (
    <div className="contest-detail">
      {/* 🔥 Zachovaný design – nic se nemění */}
      <div className="banner">
        <img src={contest.banner_image} alt={contest.title} className="banner-image" />
      </div>

      <div className="content">
        <h1 className="title">{contest.title}</h1>
        <p className="description">{contest.description}</p>

        {/* 🔥 Bonusové věcné výhry */}
        {bonusPrizes.length > 0 && (
          <div className="bonus-section">
            <h2>Bonusové věcné výhry</h2>
            <div className="bonus-list">
              {bonusPrizes.map((bonus) => (
                <div key={bonus.id} className="bonus-item">
                  <p>{bonus.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 🔥 Progres soutěže */}
        <div className="progress-section">
          <h2>Průběh soutěže</h2>
          <p>{ticketsCount} / 1 000 000 ticketů odehráno</p>
        </div>

        {/* 🔥 Uživatelské výhry */}
        {userPrizes.length > 0 && (
          <div className="user-prizes-section">
            <h2>Výhry v této soutěži</h2>
            <ul>
              {userPrizes.map((prize) => (
                <li key={prize.id}>{prize.notes}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
