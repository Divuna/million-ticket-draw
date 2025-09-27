import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('Starting comprehensive audit...');

    const startTime = Date.now();
    
    // Get all event logs from the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const { data: eventLogs, error } = await supabase
      .from('event_logs')
      .select('*')
      .gte('timestamp', sevenDaysAgo.toISOString())
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error querying event_logs:', error);
      throw error;
    }

    // Analyze event types
    const requiredEventTypes = [
      'user_registered',
      'voucher_purchased', 
      'coin_redeemed',
      'contest_closed',
      'prize_won',
      'notification_sent'
    ] as const;

    const eventTypeCounts: Record<string, number> = {};
    let validJsonCount = 0;
    const invalidJsonEvents: any[] = [];

    eventLogs?.forEach(event => {
      // Count event types
      eventTypeCounts[event.event_name] = (eventTypeCounts[event.event_name] || 0) + 1;
      
      // Validate JSON metadata
      try {
        if (event.metadata && typeof event.metadata === 'object') {
          validJsonCount++;
        } else if (event.metadata === null || event.metadata === undefined) {
          validJsonCount++; // null metadata is considered valid
        } else {
          invalidJsonEvents.push(event);
        }
      } catch (e) {
        invalidJsonEvents.push(event);
      }
    });

    // Check for missing event types
    const missingEventTypes = requiredEventTypes.filter(type => !eventTypeCounts[type]);
    const presentEventTypes = requiredEventTypes.filter(type => eventTypeCounts[type]);

    // Calculate audit score
    const totalEvents = eventLogs?.length || 0;
    const jsonValidationScore = totalEvents > 0 ? (validJsonCount / totalEvents) * 100 : 100;
    const eventTypeScore = (presentEventTypes.length / requiredEventTypes.length) * 100;
    const overallScore = (jsonValidationScore + eventTypeScore) / 2;

    // Create audit summary
    const auditSummary = {
      audit_timestamp: new Date().toISOString(),
      total_events_analyzed: totalEvents,
      json_validation: {
        valid_count: validJsonCount,
        invalid_count: invalidJsonEvents.length,
        score_percentage: Math.round(jsonValidationScore)
      },
      event_types: {
        required_types: requiredEventTypes,
        present_types: presentEventTypes,
        missing_types: missingEventTypes,
        type_counts: eventTypeCounts,
        score_percentage: Math.round(eventTypeScore)
      },
      overall_score_percentage: Math.round(overallScore),
      integration_status: overallScore >= 100 ? 'passed' : overallScore >= 80 ? 'warning' : 'failed'
    };

    // Log audit to audit_logs table
    const { error: auditLogError } = await supabase
      .from('audit_logs')
      .insert({
        event: 'comprehensive_audit_completed',
        user_id: null,
        metadata: auditSummary
      });

    if (auditLogError) {
      console.error('Error logging audit:', auditLogError);
    }

    const executionTime = Date.now() - startTime;

    const response = {
      success: true,
      message: `Audit dokončen: ${Math.round(overallScore)}% úspěšnost (${totalEvents} eventů analyzováno)`,
      validated_count: validJsonCount,
      generated_count: 0, // This function doesn't generate events
      events_summary: eventTypeCounts,
      events_data: eventLogs?.slice(0, 100) || [], // Return first 100 events for display
      audit_details: auditSummary,
      execution_time: executionTime,
      timestamp: new Date().toISOString()
    };

    console.log('Audit completed successfully:', {
      totalEvents,
      overallScore: Math.round(overallScore),
      executionTime
    });

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error in run-audit function:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Audit failed',
        message: `Chyba při auditu: ${errorMessage}`,
        validated_count: 0,
        generated_count: 0,
        events_summary: {},
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})