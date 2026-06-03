import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-token',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify caller is admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Chybí autorizační hlavička')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    
    if (userError || !user) {
      throw new Error('Neplatný token')
    }

    // Check if user is admin
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'superadmin'])
      .single()

    if (!roleData) {
      throw new Error('Přístup odepřen - pouze pro administrátory')
    }

    // Get request body
    const { auth_user_id, action } = await req.json()

    if (!auth_user_id || !action) {
      throw new Error('Chybí povinné parametry auth_user_id a action')
    }

    if (action !== 'approve' && action !== 'reject') {
      throw new Error('Neplatná akce - povoleno pouze approve nebo reject')
    }

    // Get auth user details
    const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(auth_user_id)
    
    if (authUserError || !authUserData.user) {
      throw new Error('Uživatel nenalezen')
    }

    const authUser = authUserData.user
    const metadata = authUser.user_metadata

    if (!metadata?.partner_registration) {
      throw new Error('Tento uživatel není partnerská registrace')
    }

    // Check if partner record already exists
    const { data: existingPartner } = await supabaseAdmin
      .from('partners')
      .select('id')
      .eq('auth_user_id', auth_user_id)
      .single()

    if (existingPartner) {
      throw new Error('Partner již existuje')
    }

    if (action === 'approve') {
      // Create partner record with approved status
      const { error: insertError } = await supabaseAdmin
        .from('partners')
        .insert({
          auth_user_id: auth_user_id,
          name: metadata.company_name || 'Partner',
          company_name: metadata.company_name || null,
          website_url: metadata.website_url || 'https://example.com',
          contact_email: authUser.email || null,
          contact_phone: metadata.contact_phone || null,
          ico: metadata.ico || null,
          dic: metadata.dic || null,
          logo_url: 'https://placehold.co/200x200/1a1a2e/gold?text=Logo',
          status: 'approved',
          approved_at: new Date().toISOString(),
        })

      if (insertError) {
        console.error('Insert error:', insertError)
        throw new Error('Nepodařilo se vytvořit partnerský záznam')
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Partner byl úspěšně schválen',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    } else {
      // Rejection - just return success, auth user stays, no partner record created
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Registrace byla zamítnuta',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

  } catch (error) {
    console.error('Error in approve-partner-registration:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Neznámá chyba'
    
    return new Response(
      JSON.stringify({
        success: false,
        message: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
