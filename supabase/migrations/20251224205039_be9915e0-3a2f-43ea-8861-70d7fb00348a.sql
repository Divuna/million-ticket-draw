-- Insert the contest with 'pending' status
INSERT INTO public.contests (
  title,
  name,
  description,
  main_prize,
  main_image,
  banner_image,
  status,
  ticket_count,
  ticket_price,
  total_miocoin_bonus
) VALUES (
  'Svět luxusních ikon',
  'Svět luxusních ikon',
  'Vstupte do světa nejprestižnějších módních značek. Soutěž o exkluzivní kolekci luxusních produktů Dior, Louis Vuitton a Gucci, které symbolizují eleganci, kvalitu a výjimečnost.',
  'Luxusní módní balíček značek Dior, Louis Vuitton a Gucci v celkové hodnotě přibližně 750 000 Kč.',
  'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/luxury-icons-hero.jpg',
  'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/luxury-icons-banner.jpg',
  'pending',
  1000000,
  1,
  60000
);

-- Get the contest ID and insert bonus prizes
DO $$
DECLARE
  v_contest_id uuid;
BEGIN
  SELECT id INTO v_contest_id FROM public.contests WHERE title = 'Svět luxusních ikon' ORDER BY created_at DESC LIMIT 1;
  
  INSERT INTO public.bonus_prizes (contest_id, title, description, amount, ticket_position, status, image_url) VALUES
  (v_contest_id, 'Parfém Dior Sauvage', 'Luxusní pánská vůně Dior Sauvage v elegantním flakonu. Ikonická kompozice s tóny bergamotu, pepře a ambry.', 0, 1, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-01-dior-perfume.jpg'),
  (v_contest_id, 'Peněženka Gucci', 'Kožená peněženka Gucci z prémiové italské kůže s ikonickým GG logem. Nadčasový design a špičkové zpracování.', 0, 2, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-02-gucci-wallet.jpg'),
  (v_contest_id, 'Hedvábný šátek Louis Vuitton', 'Elegantní hedvábný šátek s ikonickým monogramem Louis Vuitton. Ručně šitý ve Francii z nejjemnějšího hedvábí.', 0, 3, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-03-lv-scarf.jpg'),
  (v_contest_id, 'Sluneční brýle Prada', 'Designové sluneční brýle Prada s UV ochranou a polarizovanými skly. Moderní italský styl pro každou příležitost.', 0, 4, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-04-prada-sunglasses.jpg'),
  (v_contest_id, 'Luxusní kosmetická sada', 'Prémiová sada luxusní kosmetiky obsahující produkty pro pleť a tělo od světoznámých značek.', 0, 5, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-05-cosmetic-set.jpg'),
  (v_contest_id, 'Designové módní doplňky', 'Exkluzivní kolekce designových módních doplňků od prémiových značek. Zahrnuje šperky a módní doplňky.', 0, 6, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-06-designer-accessories.jpg'),
  (v_contest_id, 'Parfém Chanel N°5', 'Ikonická dámská vůně Chanel N°5 - legenda mezi parfémy. Květinová aldehydová kompozice v luxusním balení.', 0, 7, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-07-chanel-perfume.jpg'),
  (v_contest_id, 'Pásek Hermès', 'Kožený pásek Hermès s ikonickou H přezkou ve zlaté barvě. Ruční výroba z nejkvalitnější francouzské kůže.', 0, 8, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-08-hermes-belt.jpg'),
  (v_contest_id, 'Mini kabelka Dior Lady', 'Elegantní mini kabelka Dior Lady z prémiové kůže s charakteristickým prošíváním Cannage. Symbol francouzské elegance.', 0, 9, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-09-dior-bag.jpg'),
  (v_contest_id, 'Hodinky Cartier', 'Elegantní dámské hodinky Cartier s růžovým zlatem a diamantovým pouzdrem. Švýcarská přesnost a pařížská elegance.', 0, 10, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-10-cartier-watch.jpg'),
  (v_contest_id, 'Náramek Tiffany & Co.', 'Stříbrný náramek Tiffany & Co. z kolekce Return to Tiffany. Ikonický design americké klenotnické legendy.', 0, 11, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-11-tiffany-bracelet.jpg'),
  (v_contest_id, 'Kašmírová šála Burberry', 'Luxusní kašmírová šála Burberry s ikonickým kostkovaným vzorem. Ručně tkaná ve Skotsku z nejjemnějšího kašmíru.', 0, 12, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-12-burberry-scarf.jpg'),
  (v_contest_id, 'Sluneční brýle Tom Ford', 'Luxusní sluneční brýle Tom Ford s charakteristickým T detailem. Hollywoodská elegance a italské řemeslo.', 0, 13, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-13-tomford-glasses.jpg'),
  (v_contest_id, 'Parfém Versace Eros', 'Luxusní pánská vůně Versace Eros v ikonickém modrém flakonu. Svěží orientální kompozice plná síly a vášně.', 0, 14, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-14-versace-perfume.jpg'),
  (v_contest_id, 'Psaníčko Bottega Veneta', 'Kožené psaníčko Bottega Veneta s charakteristickým proplétáním Intrecciato. Mistrovské italské řemeslo.', 0, 15, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-15-bottega-clutch.jpg'),
  (v_contest_id, 'Náhrdelník Bulgari', 'Elegantní náhrdelník Bulgari z růžového zlata s diamanty. Římská klenotnická tradice a moderní design.', 0, 16, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-16-bulgari-necklace.jpg'),
  (v_contest_id, 'Pouzdro na karty Louis Vuitton', 'Elegantní pouzdro na karty Louis Vuitton z monogramované kůže. Praktický luxus pro každodenní použití.', 0, 17, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-17-lv-cardholder.jpg'),
  (v_contest_id, 'Hedvábná kravata Valentino', 'Prémiová hedvábná kravata Valentino s elegantním vzorem. Ručně vyrobeno v Itálii z nejkvalitnějšího hedvábí.', 0, 18, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-18-valentino-tie.jpg'),
  (v_contest_id, 'Manžetové knoflíčky Montblanc', 'Prémiové manžetové knoflíčky Montblanc s onyxem a ocelovým pouzdrem. Symbol úspěchu a vybraného vkusu.', 0, 19, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-19-montblanc-cufflinks.jpg'),
  (v_contest_id, 'Přívěsek na klíče Fendi', 'Luxusní přívěsek na klíče Fendi s charakteristickým FF logem. Pozlacený kov a prémiové zpracování.', 0, 20, 'pending', 'https://xkzhjldrojjlrkezorey.supabase.co/storage/v1/object/public/contest-banners/bonus-20-fendi-keychain.jpg');
END $$;