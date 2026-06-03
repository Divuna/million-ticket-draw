import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PendingRegistration {
  id: string;
  email: string;
  company_name: string;
  website_url: string;
  contact_phone: string | null;
  ico: string | null;
  dic: string | null;
  affiliate_via_code: string | null;
  created_at: string;
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

    // Fetch all auth users
    const { data: authUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    
    if (listError) {
      console.error('Error listing users:', listError)
      throw listError
    }

    console.log(`Total auth users: ${authUsers.users.length}`)

    // Get all existing partner auth_user_ids
    const { data: existingPartners } = await supabaseAdmin
      .from('partners')
      .select('auth_user_id')

    const existingAuthUserIds = new Set((existingPartners || []).map(p => p.auth_user_id))
    console.log(`Existing partners count: ${existingAuthUserIds.size}`)

    // Filter users with partner_registration metadata who don't have a partner record yet
    const usersWithPartnerFlag = authUsers.users.filter(u => u.user_metadata?.partner_registration === true)
    console.log(`Users with partner_registration=true: ${usersWithPartnerFlag.length}`)

    const pendingRegistrations: PendingRegistration[] = usersWithPartnerFlag
      .filter(u => !existingAuthUserIds.has(u.id))
      .map(u => ({
        id: u.id,
        email: u.email || '',
        company_name: u.user_metadata?.company_name || '',
        website_url: u.user_metadata?.website_url || '',
        contact_phone: u.user_metadata?.contact_phone || null,
        ico: u.user_metadata?.ico || null,
        dic: u.user_metadata?.dic || null,
        affiliate_via_code: u.user_metadata?.affiliate_via_code || null,
        created_at: u.created_at,
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return new Response(
      JSON.stringify({
        success: true,
        registrations: pendingRegistrations,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Error in get-pending-partner-registrations:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Neznámá chyba'
    
    return new Response(
      JSON.stringify({
        success: false,
        message: errorMessage,
        registrations: [],
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
