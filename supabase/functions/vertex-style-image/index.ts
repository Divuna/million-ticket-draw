import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  const exp = now + 3600;

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: exp,
    scope: "https://www.googleapis.com/auth/cloud-platform",
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const privateKey = await importPrivateKey(serviceAccount.private_key);
  const signature = await signData(privateKey, signatureInput);

  return `${signatureInput}.${signature}`;
}

function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  const pemContents = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  return await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
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

async function getAccessToken(serviceAccount: ServiceAccountKey): Promise<string> {
  const jwt = await generateJWT(serviceAccount);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
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

// OneMil luxury style prompts for image editing
function getStylePrompt(layout: ImageLayout): string {
  const baseStyle = `Premium luxury advertisement style. Dark navy (#0a0a1a) to pure black gradient background. Elegant gold and electric cyan neon rim-lighting around the product edges. Cinematic spotlight from above. Glossy dark reflective floor with subtle mirror reflection. No text, no watermarks, no logos. Keep the original product completely intact and unmodified. Only replace and enhance the background.`;

  const layoutSpecifics: Record<ImageLayout, string> = {
    hero: `${baseStyle} Position the product on the RIGHT side of the frame, leaving clean empty space on the LEFT for text overlay. Horizontal 16:9 composition. Ultra high resolution marketing quality.`,
    banner: `${baseStyle} Center the product horizontally in a wide banner format. Wide horizontal 3:1 or 16:9 composition. Balanced symmetrical layout. Ultra high resolution marketing quality.`,
    bonus: `${baseStyle} Center the product in a perfect square 1:1 composition. Balanced centered layout. Ultra high resolution marketing quality.`,
  };

  return layoutSpecifics[layout];
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
    const { layout, image_base64 } = body as {
      layout: ImageLayout;
      image_base64: string;
    };

    if (!layout) {
      return new Response(
        JSON.stringify({ error: "Chybí layout (hero | banner | bonus)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!image_base64) {
      return new Response(
        JSON.stringify({ error: "Chybí image_base64 (zdrojový obrázek)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean base64 string (remove data URL prefix if present)
    let cleanBase64 = image_base64;
    if (image_base64.includes(",")) {
      cleanBase64 = image_base64.split(",")[1];
    }

    console.log(`Styling ${layout} image with Vertex AI Imagen 3.0 (image-to-image)`);

    const accessToken = await getAccessToken(serviceAccount);

    const location = "us-central1";
    const stylePrompt = getStylePrompt(layout);

    // Imagen 3.0 generate with image input
    const imagen3Url = `https://${location}-aiplatform.googleapis.com/v1/projects/${serviceAccount.project_id}/locations/${location}/publishers/google/models/imagen-3.0-generate-002:predict`;

    const aspectRatio = layout === "bonus" ? "1:1" : "16:9";

    const vertexResponse = await fetch(imagen3Url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [
          {
            prompt: `${stylePrompt} The product in the image must appear exactly as shown, only enhance the background.`,
            image: {
              bytesBase64Encoded: cleanBase64,
            },
          },
        ],
        parameters: {
          sampleCount: 1,
          aspectRatio: aspectRatio,
          negativePrompt: "blurry, low quality, distorted, text, watermark, logo, signature",
          safetyFilterLevel: "block_some",
        },
      }),
    });

    if (!vertexResponse.ok) {
      const errorText = await vertexResponse.text();
      console.error("Vertex AI Imagen 3.0 error:", vertexResponse.status, errorText);

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
    console.log("Vertex AI Imagen 3.0 response received");

    const imageBase64Result = vertexData.predictions?.[0]?.bytesBase64Encoded;
    if (!imageBase64Result) {
      console.error("No image in Vertex AI response:", JSON.stringify(vertexData).substring(0, 500));
      return new Response(
        JSON.stringify({ error: "Vertex AI nevygeneroval obrázek" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const imageBytes = Uint8Array.from(atob(imageBase64Result), (c) => c.charCodeAt(0));

    const fileName = `ai-styled-${layout}-${Date.now()}.png`;
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

    console.log(`Successfully styled and uploaded ${layout} image:`, urlData.publicUrl);

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
    console.error("Error in vertex-style-image:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Neznámá chyba" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
