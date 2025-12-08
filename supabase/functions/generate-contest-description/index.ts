import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'AI API klíč není nakonfigurován' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { title, main_prize, ticket_count, ticket_price } = await req.json();

    if (!title && !main_prize) {
      return new Response(
        JSON.stringify({ error: 'Název soutěže nebo hlavní cena jsou povinné' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating description for contest:', { title, main_prize });

    const systemPrompt = `Jsi marketingový copywriter pro exkluzivní soutěže o luxusní ceny. Píšeš v češtině.
Tvým úkolem je vytvořit krátký, poutavý a vzrušující popis soutěže, který:
- Je napsán v češtině
- Má maximálně 2-3 věty
- Zdůrazňuje exkluzivitu a hodnotu hlavní ceny
- Motivuje uživatele k účasti
- Nezmiňuje konkrétní částky ani technické detaily
- Je pozitivní a energický`;

    const userPrompt = `Vytvoř poutavý marketingový popis pro soutěž:
- Název soutěže: ${title || 'Exkluzivní soutěž'}
- Hlavní výhra: ${main_prize || 'Luxusní cena'}
${ticket_count ? `- Celkem tiketů: ${ticket_count.toLocaleString('cs-CZ')}` : ''}
${ticket_price ? `- Cena tiketu: ${ticket_price} MioCoinů` : ''}

Vrať pouze text popisu, žádné uvozovky ani formátování.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Příliš mnoho požadavků, zkuste to později." }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Nedostatek kreditu pro AI generování." }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Chyba AI služby: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const description = data.choices?.[0]?.message?.content?.trim();

    if (!description) {
      console.error('No description in response:', data);
      return new Response(
        JSON.stringify({ error: 'Nepodařilo se získat vygenerovaný popis' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Description generated successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        description: description,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-contest-description:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Neznámá chyba' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
