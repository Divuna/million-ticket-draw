// Načtení dat soutěže + bonusových výher + peněženky + uživatelských výher
useEffect(() => {
  const fetchData = async () => {
    setLoading(true);

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

    // 🔥 BONUSOVÉ VÝHRY – KOMPLETNÍ OPRAVA
    const { data: bonusData, error: bonusError } = await supabase
      .from("bonus_prizes")
      .select(
        `
        id,
        description,
        ticket_position,
        status,
        amount,
        image_url
      `,
      )
      .eq("contest_id", id)
      .order("ticket_position", { ascending: true });

    if (bonusError) {
      console.error(bonusError);
    }

    // Načtení peněženky uživatele
    const { data: walletData } = await supabase
      .from("wallets")
      .select("balance_coins")
      .eq("user_id", user?.id)
      .single();

    // Načtení výher uživatele
    const { data: userWinData } = await supabase
      .from("user_wins")
      .select("*")
      .eq("user_id", user?.id)
      .eq("contest_id", id);

    setContest(contestData);
    setBonusPrizes(bonusData || []);
    setUserWallet(walletData || { balance_coins: 0 });
    setUserWins(userWinData || []);
    setLoading(false);
  };

  if (id) fetchData();
}, [id, user]);
