import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'OpenAI API klíč není nakonfigurován' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { title, main_prize } = await req.json();

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

Vrať pouze text popisu, žádné uvozovky ani formátování.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini-2025-04-14',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Příliš mnoho požadavků, zkuste to později.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Chyba OpenAI služby: ${response.status}` }),
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

    console.log('Description generated successfully via OpenAI');

    return new Response(
      JSON.stringify({ 
        success: true,
        description: description,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-contest-description-openai:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Neznámá chyba' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
