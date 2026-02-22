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

  // Internal authorization guard
  const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
  if (req.headers.get("x-internal-token") !== internalToken) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
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

    const { contest_id } = await req.json();

    if (!contest_id) {
      return new Response(
        JSON.stringify({ error: 'contest_id je povinný parametr' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching contest data for:', contest_id);

    // Fetch contest data
    const { data: contest, error: contestError } = await supabase
      .from('contests')
      .select('title, description, main_prize, ticket_count, ticket_price')
      .eq('id', contest_id)
      .single();

    if (contestError || !contest) {
      console.error('Contest fetch error:', contestError);
      return new Response(
        JSON.stringify({ error: 'Soutěž nebyla nalezena' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch bonus summary
    const { data: bonuses } = await supabase
      .from('bonus_prizes')
      .select('description, amount')
      .eq('contest_id', contest_id)
      .limit(10);

    const bonusSummary = bonuses?.length 
      ? bonuses.map(b => b.description).join(', ')
      : '';

    console.log('Generating poster for contest:', { title: contest.title, main_prize: contest.main_prize });

    // Build a detailed prompt for the poster
    const prompt = `Create a stunning vertical promotional poster for a contest/sweepstakes with the following details:
- Contest Title: "${contest.title}"
- Main Prize: "${contest.main_prize}"
${contest.description ? `- Description: "${contest.description}"` : ''}
${contest.ticket_count ? `- Total tickets: ${contest.ticket_count.toLocaleString()}` : ''}
${contest.ticket_price ? `- Ticket price: ${contest.ticket_price} MioCoins` : ''}
${bonusSummary ? `- Bonus prizes: ${bonusSummary}` : ''}

Style requirements:
- Vertical poster format (portrait orientation)
- Modern, eye-catching design with vibrant colors
- Professional quality suitable for marketing
- Include visual representation of the main prize
- Exciting, luxurious feel that conveys value
- DO NOT include any text in the image - just visuals
- High contrast and appealing color scheme
- Dramatic lighting and composition`;

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
        size: '1024x1536',
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
    const sanitizedTitle = contest.title.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 30);
    const fileName = `ai-poster-${sanitizedTitle}-${timestamp}.png`;

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

    const posterUrl = publicUrlData.publicUrl;

    // Update contest with the generated poster URL
    const { error: updateError } = await supabase
      .from('contests')
      .update({ generated_poster_url: posterUrl })
      .eq('id', contest_id);

    if (updateError) {
      console.error('Contest update error:', updateError);
      // Still return success since the image was generated
    }

    console.log('Poster generated and uploaded successfully:', posterUrl);

    return new Response(
      JSON.stringify({ 
        success: true,
        url: posterUrl,
        fileName: fileName
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-poster:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Neznámá chyba' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
