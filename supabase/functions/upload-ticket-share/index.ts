import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Internal authorization guard
  const internalToken = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
  if (req.headers.get("x-internal-token") !== internalToken) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  try {
    const { ticketId, imageBase64 } = await req.json();

    if (!ticketId || !imageBase64) {
      console.error('Missing required fields:', { ticketId: !!ticketId, imageBase64: !!imageBase64 });
      return new Response(
        JSON.stringify({ error: 'Missing ticketId or imageBase64' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with SERVICE ROLE key (required for storage upload)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Clean base64 string (remove data URL prefix if present)
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    
    // Convert base64 to Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Generate unique filename
    const filename = `ticket-${ticketId}-${Date.now()}.png`;
    
    console.log(`Uploading ticket share image: ${filename}`);

    // Upload to storage bucket
    const { data, error: uploadError } = await supabase.storage
      .from('ticket-shares')
      .upload(filename, bytes, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to upload image', details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('ticket-shares')
      .getPublicUrl(filename);

    console.log(`Upload successful. Public URL: ${urlData.publicUrl}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        publicUrl: urlData.publicUrl,
        filename 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
