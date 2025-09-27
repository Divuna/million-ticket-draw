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
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)

    console.log('Generating comprehensive OneMil/Sofinity audit report...');

    const startTime = Date.now();

    // 1. Pages and UI Components Analysis
    const pagesAnalysis = {
      audit_pages: [
        {
          page: '/admin/audit-repair',
          component: 'AdminAuditRepair.tsx',
          buttons: [
            {
              name: 'Test spojení (blue)',
              function_called: 'test-connection',
              parameters: 'none',
              updates: 'events table with connection test result'
            },
            {
              name: 'Opravit chybějící eventy (orange)',
              function_called: 'repair-missing-events',
              parameters: '{ days: 7 }',
              updates: 'events table with generated events'
            },
            {
              name: 'Spustit audit (green)',
              function_called: 'run-audit',
              parameters: 'none',
              updates: 'events table with audit results'
            }
          ]
        },
        {
          page: '/admin/dashboard',
          component: 'AdminDashboard.tsx',
          buttons: [
            {
              name: 'Vytvořit soutěž',
              function_called: 'create-contest',
              parameters: 'contest form data',
              updates: 'contests table, triggers Sofinity events'
            },
            {
              name: 'Přidat bonusovou výhru',
              function_called: 'add-bonus-prize',
              parameters: 'contest_id, description, ticket_position',
              updates: 'bonus_prizes table'
            },
            {
              name: 'Distribuovat bonusy',
              function_called: 'distribute-bonus-prizes',
              parameters: 'contest_id, bonus_type, total_value',
              updates: 'bonus_prizes table with user assignments'
            },
            {
              name: 'Aktualizovat logy',
              function_called: 'analytics-query',
              parameters: 'SQL query for edge function logs',
              updates: 'display only'
            },
            {
              name: 'Otestovat integraci',
              function_called: 'sofinity-integration-test',
              parameters: 'none',
              updates: 'display only'
            }
          ]
        },
        {
          page: '/admin/vouchers',
          component: 'AdminVouchers.tsx',
          buttons: [
            {
              name: 'Test Voucher Trigger',
              function_called: 'test-voucher-trigger',
              parameters: '{ testUserId }',
              updates: 'triggers voucher purchase event'
            }
          ]
        },
        {
          page: '/contest/:id',
          component: 'ContestDetail.tsx',
          buttons: [
            {
              name: 'Redeem Coin',
              function_called: 'send_event_to_sofinity',
              parameters: 'coin_redeemed event data',
              updates: 'sends event to Sofinity'
            }
          ]
        },
        {
          page: '/games',
          component: 'Games.tsx',
          buttons: [
            {
              name: 'Redeem Coin (Games)',
              function_called: 'send_event_to_sofinity',
              parameters: 'coin_redeemed event data',
              updates: 'sends event to Sofinity'
            }
          ]
        },
        {
          page: '/profile',
          component: 'Profile.tsx',
          buttons: [
            {
              name: 'Pokračovat k platbě',
              function_called: 'create-stripe-checkout',
              parameters: '{ amount }',
              updates: 'creates Stripe payment session'
            }
          ]
        },
        {
          page: '/audit',
          component: 'OneMilAudit.tsx',
          buttons: [
            {
              name: 'Fix Missing Events',
              function_called: 'repair-missing-events',
              parameters: '{ days: 7 }',
              updates: 'repairs missing event logs'
            }
          ]
        }
      ]
    };

    // 2. Edge Functions Analysis
    const edgeFunctionsAnalysis = {
      audit_functions: [
        {
          name: 'test-connection',
          purpose: 'Tests database connectivity',
          input: 'none',
          output: '{ success, message, count, timestamp, connection_status, table_accessible }',
          tables_read: ['event_logs'],
          tables_written: 'none',
          modifies_event_logs: false
        },
        {
          name: 'repair-missing-events',
          purpose: 'Generates missing event logs based on analysis',
          input: '{ days?: number }',
          output: '{ success, message, generated_count, events_summary, generated_events }',
          tables_read: ['event_logs', 'users', 'vouchers', 'contests', 'tickets', 'notifications'],
          tables_written: ['event_logs', 'audit_logs'],
          modifies_event_logs: true
        },
        {
          name: 'run-audit',
          purpose: 'Comprehensive audit of event logs integrity',
          input: 'none',
          output: '{ success, message, validated_count, events_summary, events_data, audit_details }',
          tables_read: ['event_logs'],
          tables_written: ['audit_logs'],
          modifies_event_logs: false
        },
        {
          name: 'send_event_to_sofinity',
          purpose: 'Sends events to Sofinity integration',
          input: '{ event_name, user_id, contest_id, metadata }',
          output: '{ success, message }',
          tables_read: 'none',
          tables_written: ['event_logs'],
          modifies_event_logs: true
        },
        {
          name: 'sofinity-integration-test',
          purpose: 'Tests Sofinity integration connectivity',
          input: 'none',
          output: '{ success, message, test_results }',
          tables_read: ['event_logs'],
          tables_written: 'none',
          modifies_event_logs: false
        }
      ]
    };

    // 3. Event Logs and Data Integrity Analysis
    const { data: eventStats, error: eventStatsError } = await supabase
      .from('event_logs')
      .select(`
        event_name,
        user_id,
        contest_id,
        metadata,
        timestamp
      `);

    if (eventStatsError) {
      console.error('Error fetching event stats:', eventStatsError);
      throw eventStatsError;
    }

    // Analyze event types and counts
    const eventTypeCounts: Record<string, number> = {};
    const requiredEventTypes = [
      'user_registered',
      'voucher_purchased', 
      'coin_redeemed',
      'contest_closed',
      'prize_won',
      'notification_sent'
    ];

    let totalEvents = 0;
    let validMetadataCount = 0;
    let nullUserIdCount = 0;
    let nullContestIdCount = 0;
    const duplicateChecks: Record<string, Set<string>> = {};
    const timestampIssues: any[] = [];

    eventStats?.forEach(event => {
      totalEvents++;
      
      // Count by event type
      eventTypeCounts[event.event_name] = (eventTypeCounts[event.event_name] || 0) + 1;
      
      // Validate metadata
      if (event.metadata && typeof event.metadata === 'object') {
        validMetadataCount++;
      }
      
      // Check for null user_id and contest_id
      if (!event.user_id) nullUserIdCount++;
      if (!event.contest_id) nullContestIdCount++;
      
      // Check for potential duplicates (same user, same event, same timestamp)
      const duplicateKey = `${event.event_name}_${event.user_id}_${event.timestamp}`;
      if (!duplicateChecks[duplicateKey]) {
        duplicateChecks[duplicateKey] = new Set();
      }
      duplicateChecks[duplicateKey].add(event.user_id || 'null');
      
      // Check timestamp validity
      const eventTime = new Date(event.timestamp);
      const now = new Date();
      if (eventTime > now) {
        timestampIssues.push({
          event_name: event.event_name,
          timestamp: event.timestamp,
          issue: 'Future timestamp'
        });
      }
    });

    // Find potential duplicates
    const potentialDuplicates = Object.entries(duplicateChecks)
      .filter(([_, userSet]) => userSet.size > 1)
      .length;

    // Check for missing event types
    const missingEventTypes = requiredEventTypes.filter(type => !eventTypeCounts[type]);
    const presentEventTypes = requiredEventTypes.filter(type => eventTypeCounts[type]);

    // Data integrity summary
    const dataIntegrityAnalysis = {
      total_events: totalEvents,
      event_type_counts: eventTypeCounts,
      required_event_types: requiredEventTypes,
      present_event_types: presentEventTypes,
      missing_event_types: missingEventTypes,
      validation_results: {
        valid_metadata_percentage: totalEvents > 0 ? Math.round((validMetadataCount / totalEvents) * 100) : 0,
        null_user_id_count: nullUserIdCount,
        null_contest_id_count: nullContestIdCount,
        potential_duplicates: potentialDuplicates,
        timestamp_issues: timestampIssues.length,
        overall_health_score: totalEvents > 0 ? Math.round(((validMetadataCount + (totalEvents - nullUserIdCount - potentialDuplicates)) / (totalEvents * 2)) * 100) : 0
      },
      warnings: [
        ...(missingEventTypes.length > 0 ? [`Missing event types: ${missingEventTypes.join(', ')}`] : []),
        ...(nullUserIdCount > 10 ? [`High number of events with null user_id: ${nullUserIdCount}`] : []),
        ...(potentialDuplicates > 0 ? [`Potential duplicate events: ${potentialDuplicates}`] : []),
        ...(timestampIssues.length > 0 ? [`Events with timestamp issues: ${timestampIssues.length}`] : [])
      ]
    };

    const executionTime = Date.now() - startTime;

    // Generate final report
    const auditReport = {
      report_metadata: {
        generated_at: new Date().toISOString(),
        execution_time_ms: executionTime,
        report_version: '1.0.0',
        system: 'OneMil/Sofinity Integration Audit'
      },
      pages_and_ui_components: pagesAnalysis,
      edge_functions_analysis: edgeFunctionsAnalysis,
      event_logs_and_data_integrity: dataIntegrityAnalysis,
      summary: {
        total_pages_analyzed: pagesAnalysis.audit_pages.length,
        total_buttons_mapped: pagesAnalysis.audit_pages.reduce((sum, page) => sum + page.buttons.length, 0),
        total_edge_functions: edgeFunctionsAnalysis.audit_functions.length,
        total_events_analyzed: totalEvents,
        overall_integration_health: dataIntegrityAnalysis.validation_results.overall_health_score,
        critical_issues: dataIntegrityAnalysis.warnings.length
      }
    };

    console.log('Audit report generated successfully:', {
      pages: auditReport.summary.total_pages_analyzed,
      functions: auditReport.summary.total_edge_functions,
      events: auditReport.summary.total_events_analyzed,
      health_score: auditReport.summary.overall_integration_health
    });

    return new Response(
      JSON.stringify(auditReport),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error generating audit report:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Audit report generation failed',
        message: `Chyba při generování audit reportu: ${errorMessage}`,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
})