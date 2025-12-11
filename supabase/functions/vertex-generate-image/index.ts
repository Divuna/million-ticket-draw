import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ImageLayout = "hero" | "banner" | "bonus";

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

// Generate JWT for Google OAuth
async function generateJWT(serviceAccount: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600; // 1 hour expiry

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://aiplatform.googleapis.com/",
    iat: now,
    exp: exp,
    scope: "https://www.googleapis.com/auth/cloud-platform",
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  // Import the private key and sign
  const privateKey = await importPrivateKey(serviceAccount.private_key);
  const signature = await signData(privateKey, signatureInput);

  return `${signatureInput}.${signature}`;
}

function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  // Remove PEM headers and convert to binary
  const pemContents = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  return await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );
}

async function signData(privateKey: CryptoKey, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    encoder.encode(data)
  );

  const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return base64Signature.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// Get access token from Google OAuth
async function getAccessToken(serviceAccount: ServiceAccountKey): Promise<string> {
  const jwt = await generateJWT(serviceAccount);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OAuth token error:", errorText);
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceAccountKeyStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountKeyStr) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_SERVICE_ACCOUNT_KEY není nastavený" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let serviceAccount: ServiceAccountKey;
    try {
      serviceAccount = JSON.parse(serviceAccountKeyStr);
    } catch (e) {
      console.error("Failed to parse service account key:", e);
      return new Response(
        JSON.stringify({ error: "Neplatný formát GOOGLE_SERVICE_ACCOUNT_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { layout, prize_name } = body as {
      layout: ImageLayout;
      prize_name: string;
    };

    if (!layout) {
      return new Response(
        JSON.stringify({ error: "Chybí layout (hero | banner | bonus)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!prize_name) {
      return new Response(
        JSON.stringify({ error: "Chybí prize_name (název ceny)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Layout-specific prompts for Vertex AI Imagen
    const layoutPrompts: Record<ImageLayout, string> = {
      hero: `Ultra-realistic product photography of ${prize_name}. Position the product on the RIGHT side of the image, leaving empty space on the LEFT for text overlay. Premium dark background with deep navy to black gradient. Soft golden neon glow behind the product. Cinematic rim lighting around edges. Subtle mirror reflection on glossy dark floor. Horizontal 16:9 aspect ratio composition. Luxury brand advertisement quality. Ultra high resolution, photorealistic, 8K quality.`,
      
      banner: `Ultra-realistic product photography of ${prize_name}. Product CENTERED horizontally in a wide banner format. Premium dark background with deep navy to black gradient. Elegant gold and blue neon glow effects behind product. Cinematic professional lighting with rim lights. Subtle ground reflection for depth. Wide horizontal banner composition. Luxury brand marketing quality. Ultra high resolution, photorealistic, 8K quality.`,
      
      bonus: `Ultra-realistic product photography of ${prize_name}. Product CENTERED in a square composition. Premium dark navy to black gradient background. Soft golden or electric blue neon glow behind the product. Cinematic rim lighting highlighting edges. Subtle mirror-like floor reflection. Square 1:1 aspect ratio composition. Luxury premium quality aesthetic. Ultra high resolution, photorealistic, 8K quality.`,
    };

    const prompt = layoutPrompts[layout];

    console.log(`Generating ${layout} image with Vertex AI Imagen for: ${prize_name}`);

    // Get access token
    const accessToken = await getAccessToken(serviceAccount);

    // Call Vertex AI Imagen API
    const location = "us-central1";
    const vertexUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${serviceAccount.project_id}/locations/${location}/publishers/google/models/imagen-3.0-generate-001:predict`;

    const vertexResponse = await fetch(vertexUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [
          {
            prompt: prompt,
          },
        ],
        parameters: {
          sampleCount: 1,
          aspectRatio: layout === "banner" ? "16:9" : layout === "hero" ? "16:9" : "1:1",
          negativePrompt: "blurry, low quality, distorted, text, watermark, logo, signature",
        },
      }),
    });

    if (!vertexResponse.ok) {
      const errorText = await vertexResponse.text();
      console.error("Vertex AI error:", vertexResponse.status, errorText);

      if (vertexResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Překročen limit požadavků Vertex AI, zkuste to později" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (vertexResponse.status === 403) {
        return new Response(
          JSON.stringify({ error: "Přístup k Vertex AI zamítnut. Zkontrolujte oprávnění service accountu." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Vertex AI chyba: ${vertexResponse.status} - ${errorText}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vertexData = await vertexResponse.json();
    console.log("Vertex AI response received");

    // Extract generated image base64
    const imageBase64 = vertexData.predictions?.[0]?.bytesBase64Encoded;
    if (!imageBase64) {
      console.error("No image in Vertex AI response:", JSON.stringify(vertexData).substring(0, 500));
      return new Response(
        JSON.stringify({ error: "Vertex AI nevygeneroval obrázek" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert base64 to bytes
    const imageBytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));

    // Upload to Supabase Storage
    const fileName = `ai-vertex-${layout}-${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("contest-banners")
      .upload(fileName, imageBytes, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: `Chyba při nahrávání: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: urlData } = supabase.storage
      .from("contest-banners")
      .getPublicUrl(fileName);

    console.log(`Successfully generated and uploaded ${layout} image:`, urlData.publicUrl);

    return new Response(
      JSON.stringify({
        success: true,
        url: urlData.publicUrl,
        fileName,
        layout,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error in vertex-generate-image:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Neznámá chyba" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
