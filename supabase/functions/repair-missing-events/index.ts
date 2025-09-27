import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RepairRequest {
  days?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { days = 7 }: RepairRequest = await req.json().catch(() => ({}));
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    console.log(`Repairing missing events for the last ${days} days from ${startDate.toISOString()}`);

    let generatedCount = 0;

    // Get all users registered in the time period
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, created_at')
      .gte('created_at', startDate.toISOString());

    if (usersError) {
      console.error('Error fetching users:', usersError);
    } else {
      for (const user of users || []) {
        // Check if user_registered event exists
        const { data: existingEvent } = await supabase
          .from('event_logs')
          .select('id')
          .eq('event_name', 'user_registered')
          .eq('user_id', user.id)
          .single();

        if (!existingEvent) {
          const { error: insertError } = await supabase
            .from('event_logs')
            .insert({
              event_name: 'user_registered',
              user_id: user.id,
              metadata: {
                email: user.email,
                generated_by_repair: true,
                original_timestamp: user.created_at
              },
              timestamp: user.created_at
            });

          if (!insertError) {
            generatedCount++;
            console.log(`Generated user_registered event for user ${user.id}`);
          }
        }
      }
    }

    // Get all vouchers claimed in the time period
    const { data: vouchers, error: vouchersError } = await supabase
      .from('vouchers')
      .select('id, user_id, name, created_at')
      .not('user_id', 'is', null)
      .gte('created_at', startDate.toISOString());

    if (vouchersError) {
      console.error('Error fetching vouchers:', vouchersError);
    } else {
      for (const voucher of vouchers || []) {
        // Check if voucher_purchased event exists
        const { data: existingEvent } = await supabase
          .from('event_logs')
          .select('id')
          .eq('event_name', 'voucher_purchased')
          .eq('user_id', voucher.user_id)
          .single();

        if (!existingEvent) {
          const { error: insertError } = await supabase
            .from('event_logs')
            .insert({
              event_name: 'voucher_purchased',
              user_id: voucher.user_id,
              metadata: {
                voucher_id: voucher.id,
                voucher_name: voucher.name,
                generated_by_repair: true,
                original_timestamp: voucher.created_at
              },
              timestamp: voucher.created_at
            });

          if (!insertError) {
            generatedCount++;
            console.log(`Generated voucher_purchased event for voucher ${voucher.id}`);
          }
        }
      }
    }

    // Get all tickets from the time period (for coin_redeemed events)
    const { data: tickets, error: ticketsError } = await supabase
      .from('tickets')
      .select('id, user_id, contest_id, number, created_at')
      .gte('created_at', startDate.toISOString());

    if (ticketsError) {
      console.error('Error fetching tickets:', ticketsError);
    } else {
      for (const ticket of tickets || []) {
        // Check if coin_redeemed event exists
        const { data: existingEvent } = await supabase
          .from('event_logs')
          .select('id')
          .eq('event_name', 'coin_redeemed')
          .eq('user_id', ticket.user_id)
          .eq('contest_id', ticket.contest_id)
          .single();

        if (!existingEvent) {
          const { error: insertError } = await supabase
            .from('event_logs')
            .insert({
              event_name: 'coin_redeemed',
              user_id: ticket.user_id,
              contest_id: ticket.contest_id,
              metadata: {
                ticket_id: ticket.id,
                ticket_number: ticket.number,
                generated_by_repair: true,
                original_timestamp: ticket.created_at
              },
              timestamp: ticket.created_at
            });

          if (!insertError) {
            generatedCount++;
            console.log(`Generated coin_redeemed event for ticket ${ticket.id}`);
          }
        }
      }
    }

    // Get all closed contests in the time period
    const { data: contests, error: contestsError } = await supabase
      .from('contests')
      .select('id, title, status, updated_at')
      .eq('status', 'closed')
      .gte('updated_at', startDate.toISOString());

    if (contestsError) {
      console.error('Error fetching contests:', contestsError);
    } else {
      for (const contest of contests || []) {
        // Check if contest_closed event exists
        const { data: existingEvent } = await supabase
          .from('event_logs')
          .select('id')
          .eq('event_name', 'contest_closed')
          .eq('contest_id', contest.id)
          .single();

        if (!existingEvent) {
          const { error: insertError } = await supabase
            .from('event_logs')
            .insert({
              event_name: 'contest_closed',
              contest_id: contest.id,
              metadata: {
                contest_title: contest.title,
                generated_by_repair: true,
                original_timestamp: contest.updated_at
              },
              timestamp: contest.updated_at
            });

          if (!insertError) {
            generatedCount++;
            console.log(`Generated contest_closed event for contest ${contest.id}`);
          }
        }
      }
    }

    // Get all winners in the time period (for prize_won events)
    const { data: winners, error: winnersError } = await supabase
      .from('winners')
      .select('id, user_id, contest_id, type, created_at')
      .gte('created_at', startDate.toISOString());

    if (winnersError) {
      console.error('Error fetching winners:', winnersError);
    } else {
      for (const winner of winners || []) {
        // Check if prize_won event exists
        const { data: existingEvent } = await supabase
          .from('event_logs')
          .select('id')
          .eq('event_name', 'prize_won')
          .eq('user_id', winner.user_id)
          .eq('contest_id', winner.contest_id)
          .single();

        if (!existingEvent) {
          const { error: insertError } = await supabase
            .from('event_logs')
            .insert({
              event_name: 'prize_won',
              user_id: winner.user_id,
              contest_id: winner.contest_id,
              metadata: {
                winner_id: winner.id,
                prize_type: winner.type,
                generated_by_repair: true,
                original_timestamp: winner.created_at
              },
              timestamp: winner.created_at
            });

          if (!insertError) {
            generatedCount++;
            console.log(`Generated prize_won event for winner ${winner.id}`);
          }
        }
      }
    }

    // Get all notifications in the time period
    const { data: notifications, error: notificationsError } = await supabase
      .from('notifications')
      .select('id, user_id, type, sent_at')
      .not('sent_at', 'is', null)
      .gte('sent_at', startDate.toISOString());

    if (notificationsError) {
      console.error('Error fetching notifications:', notificationsError);
    } else {
      for (const notification of notifications || []) {
        // Check if notification_sent event exists
        const { data: existingEvent } = await supabase
          .from('event_logs')
          .select('id')
          .eq('event_name', 'notification_sent')
          .eq('user_id', notification.user_id)
          .single();

        if (!existingEvent) {
          const { error: insertError } = await supabase
            .from('event_logs')
            .insert({
              event_name: 'notification_sent',
              user_id: notification.user_id,
              metadata: {
                notification_id: notification.id,
                notification_type: notification.type,
                generated_by_repair: true,
                original_timestamp: notification.sent_at
              },
              timestamp: notification.sent_at
            });

          if (!insertError) {
            generatedCount++;
            console.log(`Generated notification_sent event for notification ${notification.id}`);
          }
        }
      }
    }

    const response = {
      success: true,
      message: `Successfully generated ${generatedCount} missing events for the last ${days} days`,
      generated_count: generatedCount,
      time_period: {
        days,
        from: startDate.toISOString(),
        to: new Date().toISOString()
      }
    };

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error in repair-missing-events function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        message: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})