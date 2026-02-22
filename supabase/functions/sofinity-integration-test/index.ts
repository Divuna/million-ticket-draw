import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import type { Database } from '../_shared/database.types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestPayload {
  project_id: string;
  event_name: string;
  metadata: any;
  user_id?: string;
}

const handler = async (req: Request): Promise<Response> => {
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
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get test payload or use default
    const body = await req.json().catch(() => ({}));
    const testPayload: TestPayload = {
      project_id: body.project_id || 'defababe-004b-4c63-9ff1-311540b0a3c9',
      event_name: body.event_name || 'sofinity_integration_test',
      metadata: body.metadata || {
        note: 'Edge Function test from OneMil'
      },
      user_id: body.user_id || 'bbc1d329-fe8d-449e-9960-6633a647b65a'
    };

    console.log('Starting Sofinity integration test with payload:', testPayload);

    // Step 1: Call our own send_event_to_sofinity function
    const currentUrl = Deno.env.get('SUPABASE_URL');
    const sofinityUrl = Deno.env.get('SOFINITY_URL');
    const sofinityServiceKey = Deno.env.get('SOFINITY_SERVICE_KEY');

    if (!currentUrl || !sofinityUrl || !sofinityServiceKey) {
      console.error('Missing environment variables:', {
        SUPABASE_URL: !!currentUrl,
        SOFINITY_URL: !!sofinityUrl,
        SOFINITY_SERVICE_KEY: !!sofinityServiceKey
      });
      throw new Error('Missing required environment variables');
    }

    console.log('Calling our own send_event_to_sofinity function');
    console.log('Request payload:', JSON.stringify(testPayload, null, 2));

    const functionResponse = await fetch(`${currentUrl}/functions/v1/send_event_to_sofinity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify(testPayload)
    });

    console.log('Function response status:', functionResponse.status, functionResponse.statusText);

    const functionData = await functionResponse.json().catch((e) => {
      console.error('Failed to parse function response as JSON:', e);
      return null;
    });

    if (!functionResponse.ok) {
      console.error('Function error details:', {
        status: functionResponse.status,
        statusText: functionResponse.statusText,
        data: functionData
      });
      throw new Error(`Function error: ${functionResponse.status} ${functionResponse.statusText}`);
    }

    console.log('✅ Send event function call successful!');
    console.log('Function response data:', JSON.stringify(functionData, null, 2));

    // Step 2: Wait a moment for event processing
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 3: Verify event in Sofinity EventLogs table
    console.log('Verifying event in Sofinity EventLogs...');
    let eventLogsCheck: any;
    try {
      const eventLogsResponse = await fetch(`${sofinityUrl}/rest/v1/EventLogs`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sofinityServiceKey}`,
          'apikey': sofinityServiceKey,
          'select': '*'
        }
      });

      if (eventLogsResponse.ok) {
        const eventLogs = await eventLogsResponse.json();
        const matchingEvent = eventLogs.find((log: any) => 
          log.project_id === testPayload.project_id && 
          log.event_name === testPayload.event_name &&
          log.user_id === testPayload.user_id
        );
        
        eventLogsCheck = {
          found: !!matchingEvent,
          status: 'verified',
          event_data: matchingEvent || null,
          total_events: eventLogs.length
        };
        
        console.log('EventLogs verification:', eventLogsCheck.found ? 'SUCCESS' : 'NOT FOUND');
      } else {
        eventLogsCheck = {
          found: false,
          error: `Failed to query EventLogs: ${eventLogsResponse.status}`,
          status: 'error'
        };
        console.log('EventLogs query failed:', eventLogsResponse.status);
      }
    } catch (error: any) {
      eventLogsCheck = {
        found: false,
        error: error.message,
        status: 'error'
      };
      console.error('EventLogs verification error:', error);
    }

    // Step 4: Verify AIRequests table for automatic record creation
    console.log('Verifying AIRequests for auto-creation...');
    let aiRequestsCheck: any;
    try {
      const aiRequestsResponse = await fetch(`${sofinityUrl}/rest/v1/AIRequests`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sofinityServiceKey}`,
          'apikey': sofinityServiceKey,
          'select': '*'
        }
      });

      if (aiRequestsResponse.ok) {
        const aiRequests = await aiRequestsResponse.json();
        const matchingRequest = aiRequests.find((req: any) => 
          req.type === 'event_forward' && 
          req.project_id === testPayload.project_id
        );
        
        aiRequestsCheck = {
          found: !!matchingRequest,
          status: 'verified',
          request_data: matchingRequest || null,
          total_requests: aiRequests.length
        };
        
        console.log('AIRequests verification:', aiRequestsCheck.found ? 'SUCCESS' : 'NOT FOUND');
      } else {
        aiRequestsCheck = {
          found: false,
          error: `Failed to query AIRequests: ${aiRequestsResponse.status}`,
          status: 'error'
        };
        console.log('AIRequests query failed:', aiRequestsResponse.status);
      }
    } catch (error: any) {
      aiRequestsCheck = {
        found: false,
        error: error.message,
        status: 'error'
      };
      console.error('AIRequests verification error:', error);
    }

    // Step 5: Check local audit_logs table
    const { data: localAuditLog, error: auditError } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('event', testPayload.event_name)
      .order('created_at', { ascending: false })
      .limit(1);

    if (auditError) {
      console.error('Error querying local audit logs:', auditError);
    }

    // Auto-adjustment logic - if verification fails, try different approaches
    let adjustmentAttempts = [];
    if (!eventLogsCheck.found || !aiRequestsCheck.found) {
      console.log('🔧 Some verifications failed, attempting auto-adjustment...');
      
      // Try with different header combinations
      for (let i = 0; i < 3 && !eventLogsCheck.found; i++) {
        try {
          console.log(`Trying alternative headers set ${i + 1}...`);
          
          let headers: Record<string, string>;
          if (i === 0) {
            headers = {
              'Authorization': `Bearer ${sofinityServiceKey}`,
              'apikey': sofinityServiceKey,
              'Content-Type': 'application/json',
              'select': '*'
            };
          } else if (i === 1) {
            headers = {
              'x-api-key': sofinityServiceKey,
              'Content-Type': 'application/json',
              'select': '*'
            };
          } else {
            headers = {
              'Authorization': `Bearer ${sofinityServiceKey}`,
              'Content-Type': 'application/json',
              'select': '*'
            };
          }
          
          const testResponse = await fetch(`${sofinityUrl}/rest/v1/EventLogs`, {
            method: 'GET',
            headers
          });
          
          if (testResponse.ok) {
            adjustmentAttempts.push({
              attempt: i + 1,
              headers,
              status: 'success',
              message: 'Alternative headers worked'
            });
            break;
          } else {
            adjustmentAttempts.push({
              attempt: i + 1,
              headers,
              status: 'failed',
              error: `Status: ${testResponse.status}`
            });
          }
        } catch (error: any) {
          adjustmentAttempts.push({
            attempt: i + 1,
            headers: {},
            status: 'error',
            error: error.message
          });
        }
      }
    }

    // Compile test results
    const testResults = {
      success: eventLogsCheck.found && functionResponse.ok,
      test_payload: testPayload,
      function_response: {
        status: functionResponse.status,
        data: functionData
      },
      verification: {
        sofinity_event_logs: eventLogsCheck,
        sofinity_ai_requests: aiRequestsCheck,
        local_audit_logs: {
          found: localAuditLog && localAuditLog.length > 0,
          latest_entry: localAuditLog?.[0] || null
        }
      },
      auto_adjustments: adjustmentAttempts,
      timestamp: new Date().toISOString()
    };

    console.log('✅ INTEGRATION TEST COMPLETED! ✅');
    console.log('📊 Test Results Summary:');
    console.log(`- Project ID: ${testPayload.project_id}`);
    console.log(`- Event Name: ${testPayload.event_name}`);
    console.log(`- Function Response Status: ${functionResponse.status}`);
    console.log(`- Sofinity EventLogs Found: ${eventLogsCheck.found ? 'YES' : 'NO'}`);
    console.log(`- Sofinity AIRequests Found: ${aiRequestsCheck.found ? 'YES' : 'NO'}`);
    console.log(`- Local Audit Logs Found: ${localAuditLog && localAuditLog.length > 0 ? 'YES' : 'NO'}`);
    if (adjustmentAttempts.length > 0) {
      console.log(`- Auto-adjustment Attempts: ${adjustmentAttempts.length}`);
    }
    console.log('Full test results:', JSON.stringify(testResults, null, 2));

    return new Response(JSON.stringify(testResults), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });

  } catch (error: any) {
    console.error('Error in Sofinity integration test:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { 
          'Content-Type': 'application/json', 
          ...corsHeaders 
        },
      }
    );
  }
};

serve(handler);