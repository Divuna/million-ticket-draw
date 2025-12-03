import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      console.error('OPENAI_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'OpenAI API key není nakonfigurován' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { title, description, main_prize, ticket_count, ticket_price, bonus_summary } = await req.json();

    if (!title || !main_prize) {
      return new Response(
        JSON.stringify({ error: 'Název soutěže a hlavní cena jsou povinné' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating banner for contest:', { title, main_prize, ticket_count });

    // Build a detailed prompt for the banner
    const prompt = `Create a stunning promotional banner for a contest/sweepstakes with the following details:
- Contest Title: "${title}"
- Main Prize: "${main_prize}"
${description ? `- Description: "${description}"` : ''}
${ticket_count ? `- Total tickets: ${ticket_count.toLocaleString()}` : ''}
${ticket_price ? `- Ticket price: ${ticket_price} MioCoins` : ''}
${bonus_summary ? `- Bonus prizes: ${bonus_summary}` : ''}

Style requirements:
- Modern, eye-catching design with vibrant colors
- Professional quality suitable for marketing
- Include visual representation of the main prize
- Exciting, luxurious feel that conveys value
- DO NOT include any text in the image - just visuals
- Wide banner format (landscape orientation)
- High contrast and appealing color scheme`;

    console.log('Calling OpenAI Image Generation API...');

    // Generate image using OpenAI gpt-image-1
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: prompt,
        n: 1,
        size: '1536x1024',
        quality: 'high',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Chyba při generování obrázku: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('OpenAI response received');

    // gpt-image-1 returns base64 directly
    const imageBase64 = data.data?.[0]?.b64_json;
    if (!imageBase64) {
      console.error('No image data in response:', data);
      return new Response(
        JSON.stringify({ error: 'Nepodařilo se získat vygenerovaný obrázek' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert base64 to buffer
    const imageBuffer = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 30);
    const fileName = `ai-banner-${sanitizedTitle}-${timestamp}.png`;

    console.log('Uploading to storage:', fileName);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('contest-banners')
      .upload(fileName, imageBuffer, {
        contentType: 'image/png',
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: `Chyba při nahrávání obrázku: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('contest-banners')
      .getPublicUrl(fileName);

    console.log('Banner generated and uploaded successfully:', publicUrlData.publicUrl);

    return new Response(
      JSON.stringify({ 
        success: true,
        url: publicUrlData.publicUrl,
        fileName: fileName
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-contest-banner:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Neznámá chyba' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
