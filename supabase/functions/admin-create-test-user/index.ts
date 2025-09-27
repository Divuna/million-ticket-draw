import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Database } from '../_shared/database.types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Use existing admin user for testing
    const testEmail = 'divispavel2@gmail.com'
    
    console.log('Finding existing admin user...')
    
    // Find the existing user by email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = existingUsers.users.find(u => u.email === testEmail)
    
    if (!existingUser) {
      throw new Error('Admin user with email divispavel2@gmail.com not found')
    }
    
    const userId = existingUser.id

    console.log(`Using user ID: ${userId}`)

    // Check if public.users record exists
    const { data: existingPublicUser } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (!existingPublicUser) {
      console.log('Creating public.users record...')
      // Create public.users record
      const { error: publicUserError } = await supabaseAdmin
        .from('users')
        .insert({
          id: userId,
          email: testEmail,
          name: 'CRUD Test User',
          role: 'user'
        })

      if (publicUserError) {
        console.error('Error creating public user:', publicUserError)
        throw publicUserError
      }
    }

    // Create wallet if it doesn't exist
    const { data: existingWallet } = await supabaseAdmin
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!existingWallet) {
      console.log('Creating wallet...')
      const { error: walletError } = await supabaseAdmin
        .from('wallets')
        .insert({
          user_id: userId,
          balance_coins: 1000,
          balance_vouchers: 500
        })

      if (walletError) {
        console.error('Error creating wallet:', walletError)
        throw walletError
      }
    }

    // Create test records
    console.log('Creating test records...')
    
    // Create test notification
    const { error: notificationError } = await supabaseAdmin
      .from('notifications')
      .upsert({
        user_id: userId,
        type: 'info',
        title: 'CRUD Test Notification',
        message: 'This is a test notification for CRUD operations',
        status: 'sent'
      }, { onConflict: 'user_id,title' })

    if (notificationError) {
      console.error('Error creating notification:', notificationError)
    }

    // Create test payment
    const { error: paymentError } = await supabaseAdmin
      .from('payments')
      .upsert({
        user_id: userId,
        amount: 999.99,
        method: 'test',
        status: 'completed',
        stripe_session_id: 'test_session_crud'
      }, { onConflict: 'stripe_session_id' })

    if (paymentError) {
      console.error('Error creating payment:', paymentError)
    }

    // Create test voucher
    const { error: voucherError } = await supabaseAdmin
      .from('vouchers')
      .upsert({
        user_id: userId,
        code: `CRUD-TEST-${Date.now()}`,
        value: 100,
        redeemed: false
      }, { onConflict: 'code' })

    if (voucherError) {
      console.error('Error creating voucher:', voucherError)
    }

    // Create audit log
    const { error: auditError } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        event: 'crud_test_setup',
        user_id: userId,
        metadata: {
          test_setup: true,
          timestamp: new Date().toISOString(),
          records_created: ['user', 'wallet', 'notification', 'payment', 'voucher']
        }
      })

    if (auditError) {
      console.error('Error creating audit log:', auditError)
    }

    console.log('Test user and records created successfully')

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Test user a testovací data byla úspěšně vytvořena',
        user_id: userId,
        email: testEmail
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Error in admin-create-test-user function:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return new Response(
      JSON.stringify({
        success: false,
        message: `Chyba při vytváření test uživatele: ${errorMessage}`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})