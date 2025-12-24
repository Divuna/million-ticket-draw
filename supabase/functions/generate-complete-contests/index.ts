import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 10 themed contest templates in Czech
const CONTEST_THEMES = [
  {
    theme: "luxury_cars",
    name: "Luxusní Vozy Snů",
    title: "Vyhrajte luxusní automobil vašich snů",
    mainPrize: "Mercedes-Benz AMG GT 63 v hodnotě 4 500 000 Kč",
    description: "Exkluzivní soutěž o prémiový sportovní vůz Mercedes-Benz AMG GT 63. Staňte se majitelem jednoho z nejluxusnějších automobilů na světě. Soutěž je určena pro všechny plnoleté účastníky s trvalým pobytem v ČR.",
    bonusPrizes: [
      { title: "Luxusní kožené rukavice", desc: "Prémiové řidičské rukavice z italské kůže" },
      { title: "Designový klíčenka", desc: "Exkluzivní klíčenka s logem Mercedes" },
      { title: "Prémiové sluneční brýle", desc: "Ray-Ban Aviator limitovaná edice" },
      { title: "Kožená peněženka", desc: "Handmade peněženka z pravé kůže" },
      { title: "Cestovní taška", desc: "Luxusní víkendová taška z italské kůže" },
      { title: "Parfém pro muže", desc: "Exkluzivní vůně Tom Ford Noir" },
      { title: "Hodinky Tissot", desc: "Elegantní švýcarské hodinky" },
      { title: "Kožený opasek", desc: "Prémiový pásek Hugo Boss" },
      { title: "Manžetové knoflíčky", desc: "Stříbrné manžetové knoflíčky" },
      { title: "Pouzdro na dokumenty", desc: "Luxusní kožené pouzdro" },
      { title: "Cestovní organizér", desc: "Prémiový organizér na cesty" },
      { title: "Kravata Armani", desc: "Hedvábná kravata Giorgio Armani" },
      { title: "Kapesníček do saka", desc: "Set hedvábných kapesníčků" },
      { title: "Kožené pouzdro na telefon", desc: "Handmade pouzdro z italské kůže" },
      { title: "Luxusní zápisník", desc: "Moleskine limitovaná edice" },
      { title: "Elegantní pero", desc: "Parker Sonnet plnicí pero" },
      { title: "Pashmina šála", desc: "Prémiová kašmírová šála" },
      { title: "Kožený držák na karty", desc: "Minimalistický card holder" },
      { title: "Luxusní svíčka", desc: "Diptyque vonná svíčka" },
      { title: "Whisky set", desc: "Křišťálové sklenice na whisky" },
    ],
    imagePrompts: {
      hero: "Photorealistic image of a sleek silver Mercedes-Benz AMG GT 63 sports car, dramatic studio lighting, black background, luxury automotive photography, ultra high resolution, 16:9 aspect ratio",
      banner: "Luxury marketing banner with Mercedes-Benz AMG GT 63, dark dramatic lighting, gold and black color scheme, premium automotive aesthetic, no text, 16:9 aspect ratio",
    },
  },
  {
    theme: "electronics",
    name: "Technologický Festival",
    title: "Získejte nejnovější technologie roku 2025",
    mainPrize: "Apple Vision Pro + MacBook Pro 16\" + iPhone 16 Pro Max v hodnotě 250 000 Kč",
    description: "Velká technologická soutěž o kompletní Apple ekosystém. Vyhrajte Apple Vision Pro, MacBook Pro a nejnovější iPhone. Soutěž probíhá v souladu se zákonem o spotřebitelských soutěžích.",
    bonusPrizes: [
      { title: "AirPods Pro", desc: "Bezdrátová sluchátka s aktivním potlačením hluku" },
      { title: "Apple Watch Ultra", desc: "Prémiové sportovní hodinky" },
      { title: "iPad Air", desc: "Výkonný tablet pro práci i zábavu" },
      { title: "HomePod mini", desc: "Inteligentní reproduktor Apple" },
      { title: "Magic Keyboard", desc: "Bezdrátová klávesnice s Touch ID" },
      { title: "Magic Mouse", desc: "Elegantní bezdrátová myš" },
      { title: "Apple TV 4K", desc: "Streamovací zařízení nové generace" },
      { title: "MagSafe nabíječka", desc: "Bezdrátová magnetická nabíječka" },
      { title: "AirTag 4-pack", desc: "Chytré lokalizační přívěsky" },
      { title: "Lightning kabel", desc: "Prémiový nabíjecí kabel 2m" },
      { title: "Silikonový obal iPhone", desc: "Originální Apple obal" },
      { title: "Apple Pencil Pro", desc: "Profesionální stylus pro iPad" },
      { title: "Studio Display stojan", desc: "Ergonomický stojan pro monitor" },
      { title: "USB-C hub", desc: "Multiportový adaptér Satechi" },
      { title: "Kožené pouzdro AirPods", desc: "Prémiové ochranné pouzdro" },
      { title: "Bezdrátová nabíječka 3v1", desc: "Nabíjecí stanice pro všechna zařízení" },
      { title: "Ochranné sklo iPhone", desc: "Prémiové tvrzené sklo" },
      { title: "MacBook sleeve", desc: "Kožené pouzdro na notebook" },
      { title: "Powerbank 10000mAh", desc: "Přenosná baterie Anker" },
      { title: "Bluetooth reproduktor", desc: "Přenosný JBL reproduktor" },
    ],
    imagePrompts: {
      hero: "Photorealistic product shot of Apple Vision Pro headset, MacBook Pro and iPhone 16 Pro arranged elegantly, studio lighting, white minimalist background, premium tech photography, ultra high resolution, 16:9 aspect ratio",
      banner: "Modern tech marketing banner with Apple products floating, gradient blue and purple background, futuristic glow effects, premium aesthetic, no text, 16:9 aspect ratio",
    },
  },
  {
    theme: "travel",
    name: "Cesta Kolem Světa",
    title: "Vyhrajte zájezd snů kamkoliv na světě",
    mainPrize: "Luxusní dovolená pro 2 osoby na Maledivy v hodnotě 350 000 Kč",
    description: "Romantická soutěž o exkluzivní pobyt na Maledivách v pětihvězdičkovém resortu. 14 dní v ráji s all-inclusive službami. Soutěž je transparentní a losování proběhne za přítomnosti notáře.",
    bonusPrizes: [
      { title: "Cestovní kufr Samsonite", desc: "Prémiový kufr na kolečkách" },
      { title: "Cestovní polštář", desc: "Ergonomický polštář na cesty" },
      { title: "Pláštěnka North Face", desc: "Voděodolná outdoorová bunda" },
      { title: "Polaroid fotoaparát", desc: "Instantní fotoaparát Fujifilm" },
      { title: "Cestovní adaptér", desc: "Univerzální adaptér pro 150 zemí" },
      { title: "Plážový ručník", desc: "Luxusní rychleschnoucí ručník" },
      { title: "Sluneční brýle Maui Jim", desc: "Polarizované sluneční brýle" },
      { title: "Snorkel set", desc: "Profesionální potápěčská maska" },
      { title: "Vodotěsné pouzdro", desc: "Pouzdro na telefon do vody" },
      { title: "Cestovní deník", desc: "Kožený zápisník Leuchtturm" },
      { title: "Kompaktní dalekohled", desc: "Lehký turistický dalekohled" },
      { title: "Opalovací krém set", desc: "Prémiová sluneční kosmetika" },
      { title: "Plážová taška", desc: "Designová taška z přírodních materiálů" },
      { title: "Hamaka", desc: "Ultralehká cestovní houpací síť" },
      { title: "Čelovka Petzl", desc: "Profesionální LED čelovka" },
      { title: "Cestovní lahev", desc: "Termoláhev Hydro Flask" },
      { title: "Kompas", desc: "Profesionální turistický kompas" },
      { title: "First aid kit", desc: "Cestovní lékárnička" },
      { title: "Sarong", desc: "Tradiční plážový šátek" },
      { title: "Plážové žabky", desc: "Prémiové sandály Havaianas" },
    ],
    imagePrompts: {
      hero: "Photorealistic image of luxury Maldives overwater bungalow resort, crystal clear turquoise water, tropical paradise, sunset lighting, travel photography, ultra high resolution, 16:9 aspect ratio",
      banner: "Luxury travel marketing banner with Maldives resort aerial view, golden sunset, palm trees, premium vacation aesthetic, no text, 16:9 aspect ratio",
    },
  },
  {
    theme: "fashion",
    name: "Módní Ikona",
    title: "Staňte se módní ikonou s exkluzivní kolekcí",
    mainPrize: "Kompletní designerská kolekce Gucci v hodnotě 500 000 Kč",
    description: "Exkluzivní módní soutěž o kompletní kolekci od světoznámého domu Gucci. Oblečení, doplňky a obuv přímo z milánského ateliéru. Soutěž je určena pro milovníky luxusní módy.",
    bonusPrizes: [
      { title: "Hedvábný šátek Hermès", desc: "Ikonický carré šátek" },
      { title: "Kožená kabelka", desc: "Designerská crossbody kabelka" },
      { title: "Designové boty", desc: "Italské kožené lodičky" },
      { title: "Slunečníbrýle Prada", desc: "Módní sluneční brýle" },
      { title: "Kožený pásek Gucci", desc: "Ikonický pásek s logem GG" },
      { title: "Parfém Chanel", desc: "Chanel No. 5 Eau de Parfum" },
      { title: "Kašmírový svetr", desc: "Luxusní pletený svetr" },
      { title: "Hedvábná halenka", desc: "Elegantní italská halenka" },
      { title: "Designové hodinky", desc: "Michael Kors chronograf" },
      { title: "Kosmetická taštička", desc: "Luxusní pouzdro na kosmetiku" },
      { title: "Náušnice Swarovski", desc: "Křišťálové náušnice" },
      { title: "Kožené rukavice", desc: "Elegantní zimní rukavice" },
      { title: "Hedvábná kravata", desc: "Luxusní pánská kravata" },
      { title: "Módní deštník", desc: "Designový skládací deštník" },
      { title: "Peněženka Coach", desc: "Kožená dámská peněženka" },
      { title: "Náramek Pandora", desc: "Stříbrný charm náramek" },
      { title: "Sluneční brýle Tom Ford", desc: "Unisex designové brýle" },
      { title: "Kožený diář", desc: "Smythson luxusní diář" },
      { title: "Hedvábný kapesníček", desc: "Set do náprsní kapsy" },
      { title: "Módní brož", desc: "Vintage designová brož" },
    ],
    imagePrompts: {
      hero: "Photorealistic image of Gucci luxury fashion collection displayed elegantly, designer handbag, shoes, clothing, high fashion photography, studio lighting, neutral background, ultra high resolution, 16:9 aspect ratio",
      banner: "Luxury fashion marketing banner with Gucci products, gold and cream color scheme, elegant minimalist design, premium fashion aesthetic, no text, 16:9 aspect ratio",
    },
  },
  {
    theme: "sports",
    name: "Sportovní Šampion",
    title: "Vybavte se jako profesionální sportovec",
    mainPrize: "Kompletní fitness studio domů + roční členství ve wellness v hodnotě 300 000 Kč",
    description: "Sportovní soutěž o profesionální domácí posilovnu a roční vstup do prémiového wellness centra. Staňte se fit s nejlepším vybavením na trhu. Soutěž podporuje zdravý životní styl.",
    bonusPrizes: [
      { title: "Nike běžecké boty", desc: "Profesionální běžecká obuv Air Zoom" },
      { title: "Garmin GPS hodinky", desc: "Sportovní hodinky Fenix 7" },
      { title: "Yoga podložka", desc: "Prémiová protiskluzová podložka" },
      { title: "Resistance band set", desc: "Sada odporových gum" },
      { title: "Proteinový shake set", desc: "Prémiový shaker a proteiny" },
      { title: "Sportovní taška", desc: "Under Armour sportovní taška" },
      { title: "Bezdrátová sluchátka", desc: "Beats Fit Pro sportovní sluchátka" },
      { title: "Fitness tracker", desc: "Fitbit Charge 6" },
      { title: "Sportovní láhev", desc: "Nerezová termoláhev 1L" },
      { title: "Kompresní oblečení", desc: "Set kompresního prádla" },
      { title: "Masážní pistole", desc: "Theragun masážní přístroj" },
      { title: "Foam roller", desc: "Profesionální masážní válec" },
      { title: "Skakanka", desc: "Profesionální rychlostní skakanka" },
      { title: "Kettlebell", desc: "Kvalitní kettlebell 16kg" },
      { title: "Činky set", desc: "Nastavitelné činky 2-20kg" },
      { title: "Ab roller", desc: "Posilovací kolečko na břicho" },
      { title: "Sportovní ručník", desc: "Rychleschnoucí ručník" },
      { title: "Sportovní brýle", desc: "Oakley sportovní brýle" },
      { title: "Čepice Nike", desc: "Běžecká čepice Dri-FIT" },
      { title: "Sportovní ponožky", desc: "Set prémiových sportovních ponožek" },
    ],
    imagePrompts: {
      hero: "Photorealistic image of modern home gym setup with professional equipment, Technogym machines, free weights, premium fitness photography, bright clean space, ultra high resolution, 16:9 aspect ratio",
      banner: "Dynamic sports marketing banner with fitness equipment, energetic lighting, blue and orange color scheme, motivational premium aesthetic, no text, 16:9 aspect ratio",
    },
  },
  {
    theme: "gaming",
    name: "Gaming Království",
    title: "Získejte ultimátní herní setup",
    mainPrize: "Kompletní gaming setup: PS5 Pro + RTX 5090 PC + 4K monitor v hodnotě 400 000 Kč",
    description: "Herní soutěž o profesionální gaming sestavu. PlayStation 5 Pro, výkonné herní PC s RTX 5090 a 4K 240Hz monitor. Pro všechny vášnivé hráče v České republice.",
    bonusPrizes: [
      { title: "Gaming headset", desc: "SteelSeries Arctis Nova Pro" },
      { title: "Mechanická klávesnice", desc: "Razer Huntsman V3 Pro" },
      { title: "Gaming myš", desc: "Logitech G Pro X Superlight" },
      { title: "RGB mousepad", desc: "SteelSeries QcK Prism XL" },
      { title: "Gaming židle", desc: "Secretlab Titan Evo" },
      { title: "Herní ovladač", desc: "Xbox Elite Controller Series 2" },
      { title: "Webkamera", desc: "Elgato Facecam Pro 4K" },
      { title: "Stream deck", desc: "Elgato Stream Deck+" },
      { title: "Mikrofon", desc: "Shure SM7B profesionální mikrofon" },
      { title: "Gaming brýle", desc: "Gunnar Optiks herní brýle" },
      { title: "Herní sluchátka", desc: "HyperX Cloud III Wireless" },
      { title: "LED osvětlení", desc: "Philips Hue Play Bar set" },
      { title: "Capture card", desc: "Elgato HD60 X" },
      { title: "Gaming stůl", desc: "Secretlab Magnus Pro" },
      { title: "Herní podložka", desc: "Artisan Hayate Otsu XL" },
      { title: "VR headset", desc: "Meta Quest 3 128GB" },
      { title: "Herní notebook pouzdro", desc: "Prémiové ochranné pouzdro" },
      { title: "Gaming rukavice", desc: "Profesionální gaming rukavice" },
      { title: "USB hub", desc: "Powered USB 3.0 hub" },
      { title: "Herní soundtrack vinyl", desc: "Kolekce herních soundtracků" },
    ],
    imagePrompts: {
      hero: "Photorealistic image of ultimate gaming setup with RGB lighting, high-end PC, PS5, curved ultrawide monitor, gaming chair, professional esports photography, dark room with neon glow, ultra high resolution, 16:9 aspect ratio",
      banner: "Gaming marketing banner with RGB gaming equipment, neon purple and cyan colors, futuristic cyberpunk aesthetic, premium esports vibe, no text, 16:9 aspect ratio",
    },
  },
  {
    theme: "home",
    name: "Domov Snů",
    title: "Proměňte svůj domov v luxusní rezidenci",
    mainPrize: "Kompletní renovace interiéru od designéra v hodnotě 600 000 Kč",
    description: "Soutěž o kompletní redesign interiéru vašeho bytu nebo domu. Profesionální interiérový designér vytvoří váš vysněný domov. Zahrnuje nábytek, dekorace i realizaci.",
    bonusPrizes: [
      { title: "Designová lampa", desc: "Artemide Tolomeo stolní lampa" },
      { title: "Kávový stolek", desc: "Designový mramorový stolek" },
      { title: "Luxusní povlečení", desc: "Egyptská bavlna 1000TC" },
      { title: "Designová váza", desc: "Murano skleněná váza" },
      { title: "Aromatický difuzér", desc: "Jo Malone bytový difuzér" },
      { title: "Designový polštář", desc: "Prémiový dekorativní polštář" },
      { title: "Luxusní deka", desc: "Kašmírová deka" },
      { title: "Rámeček na fotky", desc: "Stříbrný designový rámeček" },
      { title: "Designové hodiny", desc: "Nástěnné hodiny Georg Jensen" },
      { title: "Stolní fontána", desc: "Relaxační kamenná fontána" },
      { title: "Sada svíček", desc: "Luxusní vonné svíčky Diptyque" },
      { title: "Dekorativní mísa", desc: "Designová mísa na ovoce" },
      { title: "Rostlina s květináčem", desc: "Prémiová pokojová rostlina" },
      { title: "Koberec", desc: "Ručně tkaný vlněný koberec" },
      { title: "Závěsy", desc: "Luxusní zatemňovací závěsy" },
      { title: "Sada ručníků", desc: "Egyptská bavlna set" },
      { title: "Designový koš", desc: "Handmade proutěný koš" },
      { title: "Umělecký tisk", desc: "Limitovaná edice grafiky" },
      { title: "Stolní organizér", desc: "Luxusní kožený organizér" },
      { title: "Designový věšák", desc: "Nástěnný věšák z ořechu" },
    ],
    imagePrompts: {
      hero: "Photorealistic image of luxurious modern living room interior, designer furniture, marble accents, natural light, premium interior photography, Scandinavian minimalist style, ultra high resolution, 16:9 aspect ratio",
      banner: "Home interior marketing banner with luxury living space, warm neutral tones, elegant furniture, premium real estate aesthetic, no text, 16:9 aspect ratio",
    },
  },
  {
    theme: "lifestyle",
    name: "Životní Styl VIP",
    title: "Žijte jako celebritna celý rok",
    mainPrize: "VIP zážitkový balíček na rok v hodnotě 450 000 Kč",
    description: "Exkluzivní soutěž o roční VIP členství zahrnující luxusní restaurace, wellness pobyty, koncerty a sportovní události. Zažijte to nejlepší, co život nabízí.",
    bonusPrizes: [
      { title: "Spa voucher", desc: "Celodenní wellness procedury" },
      { title: "Fine dining voucher", desc: "Degustační menu pro 2" },
      { title: "Wine tasting", desc: "Vinařský zážitek v Burgundsku" },
      { title: "Masáž voucher", desc: "90min luxusní masáž" },
      { title: "Koncert VIP lístky", desc: "2 VIP vstupenky na koncert" },
      { title: "Helikoptéra vyhlídka", desc: "30min vyhlídkový let" },
      { title: "Jízdna koni", desc: "Privátní jezdecká lekce" },
      { title: "Golf voucher", desc: "Green fee na prémiové hřiště" },
      { title: "Tenis lekce", desc: "Privátní lekce s trenérem" },
      { title: "Fotosession", desc: "Profesionální fotografování" },
      { title: "Make-up kurz", desc: "Lekce s vizážistou" },
      { title: "Osobní stylista", desc: "2h konzultace s módním stylistou" },
      { title: "Kadeřník voucher", desc: "Kompletní péče v salonu" },
      { title: "Manikúra & pedikúra", desc: "Luxusní ošetření nehtů" },
      { title: "Aroma terapie", desc: "Relaxační aromaterapie" },
      { title: "Jóga retreat", desc: "Víkendový jóga pobyt" },
      { title: "Cooking class", desc: "Kurz vaření s šéfkuchařem" },
      { title: "Čokoládový workshop", desc: "Výroba čokolády" },
      { title: "Escape room", desc: "Privátní úniková hra pro 6" },
      { title: "Kino VIP", desc: "10 VIP vstupenek do kina" },
    ],
    imagePrompts: {
      hero: "Photorealistic image of luxury lifestyle scene, champagne, elegant setting, VIP experience, premium lifestyle photography, golden hour lighting, sophisticated ambiance, ultra high resolution, 16:9 aspect ratio",
      banner: "Luxury lifestyle marketing banner with VIP experiences montage, champagne, spa, fine dining, gold and black elegant design, premium aesthetic, no text, 16:9 aspect ratio",
    },
  },
  {
    theme: "tech",
    name: "Smart Home Budoucnosti",
    title: "Proměňte svůj domov v inteligentní rezidenci",
    mainPrize: "Kompletní smart home systém v hodnotě 350 000 Kč",
    description: "Technologická soutěž o kompletní chytrou domácnost. Automatizace osvětlení, vytápění, zabezpečení a multimédií. Váš domov bude reagovat na každé vaše přání.",
    bonusPrizes: [
      { title: "Google Nest Hub", desc: "Chytrý displej s asistentem" },
      { title: "Philips Hue starter kit", desc: "Chytré osvětlení" },
      { title: "Ring Video Doorbell", desc: "Chytrý video zvonek" },
      { title: "Netatmo termostat", desc: "Inteligentní termostat" },
      { title: "iRobot Roomba", desc: "Robotický vysavač" },
      { title: "Dyson Pure Cool", desc: "Čistička vzduchu a ventilátor" },
      { title: "Sonos One", desc: "Chytrý reproduktor" },
      { title: "Aqara smart lock", desc: "Chytrý zámek dveří" },
      { title: "Eve Motion", desc: "Pohybový senzor HomeKit" },
      { title: "Nanoleaf Shapes", desc: "Dekorativní LED panely" },
      { title: "Withings Body+", desc: "Chytrá váha s analýzou těla" },
      { title: "Nespresso Expert", desc: "Chytrý kávovar" },
      { title: "Smart blinds", desc: "Motorizované žaluzie" },
      { title: "Eufy Security cam", desc: "Bezdrátová bezpečnostní kamera" },
      { title: "Amazon Echo Show", desc: "Chytrý displej Alexa" },
      { title: "Meross smart plug", desc: "Chytrá zásuvka set" },
      { title: "Logitech Harmony", desc: "Univerzální dálkový ovladač" },
      { title: "WeMo switch", desc: "Chytrý vypínač světel" },
      { title: "Smart garden", desc: "Automatický indoor zahradník" },
      { title: "Smart mirror", desc: "Interaktivní chytré zrcadlo" },
    ],
    imagePrompts: {
      hero: "Photorealistic image of modern smart home interior, voice assistant, automated lighting, futuristic living room, premium tech photography, clean minimalist design, ultra high resolution, 16:9 aspect ratio",
      banner: "Smart home marketing banner with connected devices, IoT concept, blue tech glow, modern minimalist home, futuristic premium aesthetic, no text, 16:9 aspect ratio",
    },
  },
  {
    theme: "premium_brands",
    name: "Svět Prémiových Značek",
    title: "Získejte kolekci nejprestižnějších značek světa",
    mainPrize: "Exkluzivní kolekce prémiových značek v hodnotě 750 000 Kč",
    description: "Nejvýznamnější soutěž roku o produkty od nejprestižnějších světových značek. Louis Vuitton, Rolex, Cartier a další legendární jména v jednom balíčku. Pro skutečné znalce luxusu.",
    bonusPrizes: [
      { title: "Montblanc pero", desc: "Meisterstück plnicí pero" },
      { title: "Cartier náramek", desc: "Love Bracelet růžové zlato" },
      { title: "Burberry šála", desc: "Ikonická kostkovaná šála" },
      { title: "Tiffany přívěsek", desc: "Return to Tiffany náhrdelník" },
      { title: "Dior rtěnka set", desc: "Rouge Dior kolekce" },
      { title: "Bvlgari parfém", desc: "Omnia Crystalline EDP" },
      { title: "Dolce & Gabbana brýle", desc: "Designové sluneční brýle" },
      { title: "Versace peněženka", desc: "Medusa kožená peněženka" },
      { title: "Fendi klíčenka", desc: "Monster charm přívěsek" },
      { title: "Prada pouzdro", desc: "Saffiano kožené pouzdro" },
      { title: "Bottega Veneta peněženka", desc: "Intrecciato card holder" },
      { title: "Saint Laurent pásek", desc: "YSL logo kožený pásek" },
      { title: "Balenciaga čepice", desc: "Logo baseball cap" },
      { title: "Givenchy šátek", desc: "Hedvábný šátek" },
      { title: "Valentino brož", desc: "Rockstud brož" },
      { title: "Loewe přívěsek", desc: "Kožený přívěsek na tašku" },
      { title: "Celine pouzdro", desc: "Triomphe card holder" },
      { title: "Chloé parfém", desc: "Signature EDP" },
      { title: "Jimmy Choo klíčenka", desc: "Krystalová klíčenka" },
      { title: "Miu Miu peněženka", desc: "Matelassé peněženka" },
    ],
    imagePrompts: {
      hero: "Photorealistic image of luxury brand products collection, Louis Vuitton bag, Rolex watch, Cartier jewelry, premium product photography, elegant black velvet background, ultra high resolution, 16:9 aspect ratio",
      banner: "Premium brands marketing banner with luxury logos and products, gold and black sophisticated design, exclusive high-end aesthetic, no text, 16:9 aspect ratio",
    },
  },
];

// Helper function to generate random MioCoin amount
function getRandomMiocoinBonus(): number {
  return Math.floor(Math.random() * (65000 - 40000 + 1)) + 40000;
}

// Helper function to generate image using Lovable AI
async function generateImage(prompt: string, apiKey: string): Promise<string | null> {
  try {
    console.log("Generating image with prompt:", prompt.substring(0, 100) + "...");
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Image generation failed:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!imageUrl) {
      console.error("No image in response");
      return null;
    }

    return imageUrl;
  } catch (error) {
    console.error("Error generating image:", error);
    return null;
  }
}

// Helper function to upload base64 image to Supabase storage
async function uploadImageToStorage(
  supabase: any,
  base64Data: string,
  fileName: string,
  bucket: string = "contest-banners"
): Promise<string | null> {
  try {
    // Remove data:image/png;base64, prefix if present
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const imageBytes = Uint8Array.from(atob(base64Content), (c) => c.charCodeAt(0));
    
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, imageBytes, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return null;
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return urlData.publicUrl;
  } catch (error) {
    console.error("Error uploading image:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < CONTEST_THEMES.length; i++) {
      const theme = CONTEST_THEMES[i];
      console.log(`\n=== Processing contest ${i + 1}/${CONTEST_THEMES.length}: ${theme.name} ===`);
      
      try {
        const miocoinBonus = getRandomMiocoinBonus();
        const timestamp = Date.now();
        
        // Generate hero image
        console.log("Generating hero image...");
        const heroBase64 = await generateImage(theme.imagePrompts.hero, LOVABLE_API_KEY);
        let heroUrl: string | null = null;
        
        if (heroBase64) {
          heroUrl = await uploadImageToStorage(
            supabase,
            heroBase64,
            `hero-${theme.theme}-${timestamp}.png`
          );
          console.log("Hero image uploaded:", heroUrl ? "success" : "failed");
        }

        // Generate banner image
        console.log("Generating banner image...");
        const bannerBase64 = await generateImage(theme.imagePrompts.banner, LOVABLE_API_KEY);
        let bannerUrl: string | null = null;
        
        if (bannerBase64) {
          bannerUrl = await uploadImageToStorage(
            supabase,
            bannerBase64,
            `banner-${theme.theme}-${timestamp}.png`
          );
          console.log("Banner image uploaded:", bannerUrl ? "success" : "failed");
        }

        // Create contest
        console.log("Creating contest...");
        const { data: contest, error: contestError } = await supabase
          .from("contests")
          .insert({
            title: theme.title,
            name: theme.name,
            description: theme.description,
            main_prize: theme.mainPrize,
            main_image: heroUrl,
            banner_image: bannerUrl,
            total_miocoin_bonus: miocoinBonus,
            ticket_count: 1000000,
            ticket_price: 1,
            status: "draft",
          })
          .select()
          .single();

        if (contestError) {
          console.error("Contest creation error:", contestError);
          errors.push(`Failed to create contest ${theme.name}: ${contestError.message}`);
          continue;
        }

        console.log("Contest created:", contest.id);

        // Create 20 physical bonus prizes
        console.log("Creating 20 bonus prizes...");
        const bonusPrizesData = [];
        
        for (let j = 0; j < theme.bonusPrizes.length; j++) {
          const prize = theme.bonusPrizes[j];
          const position = j + 1; // Positions start from 1
          
          // Generate prize image
          const prizePrompt = `Photorealistic product photo of ${prize.title}, ${prize.desc}, premium product photography, clean white background, professional lighting, ultra high resolution`;
          const prizeBase64 = await generateImage(prizePrompt, LOVABLE_API_KEY);
          let prizeImageUrl: string | null = null;
          
          if (prizeBase64) {
            prizeImageUrl = await uploadImageToStorage(
              supabase,
              prizeBase64,
              `prize-${theme.theme}-${position}-${timestamp}.png`
            );
          }
          
          bonusPrizesData.push({
            contest_id: contest.id,
            title: prize.title,
            description: prize.desc,
            ticket_position: position,
            amount: 0, // Physical prizes have 0 amount
            status: "pending",
            image_url: prizeImageUrl,
          });
          
          console.log(`Prize ${j + 1}/20 prepared: ${prize.title}`);
        }

        // Insert all bonus prizes
        const { error: prizesError } = await supabase
          .from("bonus_prizes")
          .insert(bonusPrizesData);

        if (prizesError) {
          console.error("Bonus prizes error:", prizesError);
          errors.push(`Failed to create bonus prizes for ${theme.name}: ${prizesError.message}`);
        }

        results.push({
          contestId: contest.id,
          name: theme.name,
          miocoinBonus,
          heroImage: heroUrl,
          bannerImage: bannerUrl,
          bonusPrizesCount: bonusPrizesData.length,
        });

        console.log(`Contest ${theme.name} completed successfully!`);
        
      } catch (error) {
        console.error(`Error processing ${theme.name}:`, error);
        errors.push(`Error processing ${theme.name}: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Generated ${results.length} contests`,
        results,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
