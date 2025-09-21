-- OneMil: Audit Logs Viewing and Export SQL File
-- This file contains all SQL operations for audit logs including:
-- 1. Fetching audit logs with user details and filters
-- 2. Export queries with CSV-ready output
-- 3. Advanced utility queries with counts and aggregations
-- 4. Sofinity payload preparation for future integration

-- ============================================================================
-- 1. FETCHING AUDIT LOGS WITH USER DETAILS
-- ============================================================================

-- OneMil: All audit logs with user details and STRING_AGG output
SELECT 
    'COMPLETE AUDIT LOGS SUMMARY' AS report_type,
    COUNT(*) AS total_logs,
    STRING_AGG(
        format('[%s] %s | User: %s (%s) | Event: %s | Date: %s | Metadata: %s',
            al.id::text,
            COALESCE(u.email, 'System/Unknown'),
            COALESCE(u.name, 'N/A'),
            COALESCE(al.user_id::text, 'system'),
            al.event,
            al.created_at::timestamp,
            COALESCE(al.metadata::text, '{}')
        ),
        E'\n'
        ORDER BY al.created_at DESC
    ) AS audit_logs_details
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
ORDER BY al.created_at DESC;

-- OneMil: Filtered audit logs by event type
SELECT 
    format('AUDIT LOGS FOR EVENT: %s', 'PUT_EVENT_TYPE_HERE') AS report_type,
    COUNT(*) AS matching_logs,
    STRING_AGG(
        format('[%s] User: %s | Date: %s | Metadata: %s',
            al.id::text,
            COALESCE(u.email, 'System'),
            al.created_at::timestamp,
            COALESCE(al.metadata::text, '{}')
        ),
        E'\n'
        ORDER BY al.created_at DESC
    ) AS filtered_logs_details
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
WHERE al.event = 'PUT_EVENT_TYPE_HERE'  -- Replace with: 'payment_refunded', 'voucher_created', etc.
ORDER BY al.created_at DESC;

-- OneMil: Audit logs by date range with user details
SELECT 
    format('AUDIT LOGS FROM %s TO %s', 'PUT_START_DATE_HERE', 'PUT_END_DATE_HERE') AS report_type,
    COUNT(*) AS logs_in_range,
    STRING_AGG(
        format('[%s] %s | User: %s (%s) | Event: %s | Date: %s',
            al.id::text,
            al.event,
            COALESCE(u.email, 'System'),
            COALESCE(u.name, 'N/A'),
            al.event,
            al.created_at::date
        ),
        E'\n'
        ORDER BY al.created_at DESC
    ) AS date_range_logs_details
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
WHERE al.created_at BETWEEN 'PUT_START_DATE_HERE'::timestamp AND 'PUT_END_DATE_HERE'::timestamp
ORDER BY al.created_at DESC;

-- OneMil: Audit logs for specific user
SELECT 
    format('AUDIT LOGS FOR USER: %s', COALESCE(u.email, 'Unknown User')) AS report_type,
    COUNT(*) AS user_logs_count,
    STRING_AGG(
        format('[%s] Event: %s | Date: %s | Metadata: %s',
            al.id::text,
            al.event,
            al.created_at::timestamp,
            COALESCE(al.metadata::text, '{}')
        ),
        E'\n'
        ORDER BY al.created_at DESC
    ) AS user_logs_details
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
WHERE al.user_id = 'PUT_USER_ID_HERE'::uuid  -- Replace with actual user UUID
GROUP BY u.email
ORDER BY COUNT(*) DESC;

-- ============================================================================
-- 2. EXPORT QUERIES - CSV READY OUTPUT
-- ============================================================================

-- OneMil: CSV export format for audit logs
SELECT 
    'ID,Event,User_Email,User_Name,Created_At,Metadata_JSON' AS csv_header
UNION ALL
SELECT 
    format('%s,%s,%s,%s,%s,"%s"',
        al.id::text,
        al.event,
        COALESCE(u.email, 'System'),
        COALESCE(u.name, 'N/A'),
        al.created_at::text,
        COALESCE(al.metadata::text, '{}')
    ) AS csv_row
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
ORDER BY al.created_at DESC;

-- OneMil: Export audit logs with formatted metadata for Excel/Sheets
SELECT 
    al.id AS log_id,
    al.event AS event_type,
    COALESCE(u.email, 'System/Unknown') AS user_email,
    COALESCE(u.name, 'N/A') AS user_name,
    al.created_at AS log_timestamp,
    CASE 
        WHEN al.metadata IS NOT NULL THEN
            jsonb_pretty(al.metadata)
        ELSE 'No metadata'
    END AS formatted_metadata,
    CASE 
        WHEN al.metadata ? 'entity_type' THEN al.metadata->>'entity_type'
        ELSE 'Unknown'
    END AS entity_type,
    CASE 
        WHEN al.metadata ? 'entity_id' THEN al.metadata->>'entity_id'
        ELSE 'N/A'
    END AS entity_id
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
ORDER BY al.created_at DESC;

-- OneMil: Audit logs export with Sofinity payload preparation
DO $$
DECLARE
    v_audit_record RECORD;
    v_sofinity_payload jsonb;
    v_export_data text := '';
BEGIN
    v_export_data := 'AUDIT LOGS EXPORT WITH SOFINITY PAYLOADS' || E'\n' || 
                     '================================================' || E'\n\n';

    FOR v_audit_record IN 
        SELECT 
            al.id,
            al.event,
            al.user_id,
            al.created_at,
            al.metadata,
            COALESCE(u.email, 'System') as user_email,
            COALESCE(u.name, 'N/A') as user_name
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        ORDER BY al.created_at DESC
        LIMIT 100  -- Limit for performance
    LOOP
        -- Prepare Sofinity payload for each audit log
        v_sofinity_payload := jsonb_build_object(
            'event_name', 'audit_log_exported',
            'audit_log_id', v_audit_record.id,
            'original_event', v_audit_record.event,
            'user_id', v_audit_record.user_id,
            'export_timestamp', now(),
            'metadata', jsonb_build_object(
                'original_metadata', v_audit_record.metadata,
                'user_email', v_audit_record.user_email,
                'user_name', v_audit_record.user_name,
                'log_timestamp', v_audit_record.created_at,
                'export_reason', 'admin_audit_export'
            )
        );

        v_export_data := v_export_data || 
                        format('Log ID: %s | Event: %s | User: %s | Date: %s' || E'\n' ||
                               'Sofinity Payload: %s' || E'\n' ||
                               '---' || E'\n',
                               v_audit_record.id,
                               v_audit_record.event,
                               v_audit_record.user_email,
                               v_audit_record.created_at,
                               v_sofinity_payload::text);
    END LOOP;

    RAISE NOTICE '%', v_export_data;
END $$;

-- ============================================================================
-- 3. ADVANCED UTILITY QUERIES
-- ============================================================================

-- OneMil: Count of actions per user with STRING_AGG details
SELECT 
    COALESCE(u.email, 'System/Unknown') AS user_email,
    COALESCE(u.name, 'N/A') AS user_name,
    al.user_id,
    COUNT(*) AS total_actions,
    COUNT(DISTINCT al.event) AS unique_events,
    STRING_AGG(DISTINCT al.event, ', ' ORDER BY al.event) AS event_types,
    STRING_AGG(
        format('%s (%s)', al.event, al.created_at::date),
        ', '
        ORDER BY al.created_at DESC
    ) AS recent_actions,
    MIN(al.created_at) AS first_action,
    MAX(al.created_at) AS last_action
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
GROUP BY al.user_id, u.email, u.name
ORDER BY total_actions DESC;

-- OneMil: Count of actions per event type with user breakdown
SELECT 
    al.event AS event_type,
    COUNT(*) AS total_occurrences,
    COUNT(DISTINCT al.user_id) AS unique_users,
    STRING_AGG(
        DISTINCT COALESCE(u.email, 'System'),
        ', '
        ORDER BY COALESCE(u.email, 'System')
    ) AS users_involved,
    STRING_AGG(
        format('%s by %s on %s',
            al.event,
            COALESCE(u.email, 'System'),
            al.created_at::date
        ),
        E'\n'
        ORDER BY al.created_at DESC
    ) AS event_details,
    MIN(al.created_at) AS first_occurrence,
    MAX(al.created_at) AS last_occurrence
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
GROUP BY al.event
ORDER BY total_occurrences DESC;

-- OneMil: Most recent actions per user (last 10 actions each)
WITH recent_user_actions AS (
    SELECT 
        al.*,
        u.email,
        u.name,
        ROW_NUMBER() OVER (PARTITION BY al.user_id ORDER BY al.created_at DESC) as rn
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
)
SELECT 
    COALESCE(rua.email, 'System/Unknown') AS user_email,
    COALESCE(rua.name, 'N/A') AS user_name,
    COUNT(*) AS recent_actions_count,
    STRING_AGG(
        format('[%s] %s on %s | Metadata: %s',
            rua.id,
            rua.event,
            rua.created_at::timestamp,
            COALESCE(rua.metadata::text, '{}')
        ),
        E'\n'
        ORDER BY rua.created_at DESC
    ) AS recent_actions_details
FROM recent_user_actions rua
WHERE rua.rn <= 10  -- Last 10 actions per user
GROUP BY rua.user_id, rua.email, rua.name
ORDER BY MAX(rua.created_at) DESC;

-- OneMil: Daily audit log activity summary
SELECT 
    al.created_at::date AS activity_date,
    COUNT(*) AS total_actions,
    COUNT(DISTINCT al.user_id) AS active_users,
    COUNT(DISTINCT al.event) AS unique_events,
    STRING_AGG(DISTINCT al.event, ', ' ORDER BY al.event) AS events_occurred,
    STRING_AGG(
        format('%s: %s actions',
            COALESCE(u.email, 'System'),
            user_action_counts.action_count
        ),
        ', '
        ORDER BY user_action_counts.action_count DESC
    ) AS user_activity_summary
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
LEFT JOIN (
    SELECT 
        user_id,
        created_at::date as action_date,
        COUNT(*) as action_count
    FROM audit_logs
    GROUP BY user_id, created_at::date
) user_action_counts ON user_action_counts.user_id = al.user_id 
                    AND user_action_counts.action_date = al.created_at::date
GROUP BY al.created_at::date
ORDER BY activity_date DESC;

-- OneMil: Audit logs metadata analysis
SELECT 
    'METADATA ANALYSIS' AS report_type,
    COUNT(*) AS total_logs_with_metadata,
    COUNT(CASE WHEN al.metadata ? 'entity_type' THEN 1 END) AS logs_with_entity_type,
    COUNT(CASE WHEN al.metadata ? 'admin_action' THEN 1 END) AS admin_actions,
    STRING_AGG(
        DISTINCT CASE 
            WHEN al.metadata ? 'entity_type' THEN al.metadata->>'entity_type'
            ELSE NULL
        END,
        ', '
    ) AS entity_types_found,
    STRING_AGG(
        format('Event: %s | Entity: %s | User: %s | Date: %s',
            al.event,
            CASE WHEN al.metadata ? 'entity_type' THEN al.metadata->>'entity_type' ELSE 'N/A' END,
            COALESCE(u.email, 'System'),
            al.created_at::date
        ),
        E'\n'
        ORDER BY al.created_at DESC
    ) AS metadata_details
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
WHERE al.metadata IS NOT NULL
GROUP BY 'METADATA ANALYSIS';

-- OneMil: System vs User actions breakdown
SELECT 
    CASE 
        WHEN al.user_id IS NULL THEN 'System Actions'
        ELSE 'User Actions'
    END AS action_category,
    COUNT(*) AS total_actions,
    COUNT(DISTINCT al.event) AS unique_events,
    STRING_AGG(DISTINCT al.event, ', ' ORDER BY al.event) AS event_types,
    STRING_AGG(
        format('%s (%s times)',
            event_counts.event,
            event_counts.count
        ),
        ', '
        ORDER BY event_counts.count DESC
    ) AS event_frequency,
    MIN(al.created_at) AS earliest_action,
    MAX(al.created_at) AS latest_action
FROM audit_logs al
LEFT JOIN (
    SELECT 
        event,
        CASE WHEN user_id IS NULL THEN 'System Actions' ELSE 'User Actions' END as category,
        COUNT(*) as count
    FROM audit_logs
    GROUP BY event, CASE WHEN user_id IS NULL THEN 'System Actions' ELSE 'User Actions' END
) event_counts ON event_counts.category = CASE WHEN al.user_id IS NULL THEN 'System Actions' ELSE 'User Actions' END
GROUP BY CASE WHEN al.user_id IS NULL THEN 'System Actions' ELSE 'User Actions' END
ORDER BY total_actions DESC;

-- OneMil: Admin actions tracking (based on metadata admin_action flag)
SELECT 
    'ADMIN ACTIONS TRACKING' AS report_type,
    COUNT(*) AS total_admin_actions,
    COUNT(DISTINCT al.user_id) AS admin_users_count,
    STRING_AGG(
        DISTINCT COALESCE(u.email, 'Unknown Admin'),
        ', '
        ORDER BY COALESCE(u.email, 'Unknown Admin')
    ) AS admin_users,
    STRING_AGG(
        format('[%s] %s by %s on %s | Entity: %s',
            al.id,
            al.event,
            COALESCE(u.email, 'Unknown'),
            al.created_at::date,
            CASE WHEN al.metadata ? 'entity_type' THEN al.metadata->>'entity_type' ELSE 'N/A' END
        ),
        E'\n'
        ORDER BY al.created_at DESC
    ) AS admin_actions_details
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
WHERE al.metadata ? 'admin_action' 
  AND (al.metadata->>'admin_action')::boolean = true
GROUP BY 'ADMIN ACTIONS TRACKING';

-- OneMil: Audit logs with error detection
SELECT 
    'ERROR DETECTION IN AUDIT LOGS' AS report_type,
    COUNT(*) AS potential_errors,
    STRING_AGG(
        format('[%s] %s | User: %s | Date: %s | Metadata: %s',
            al.id,
            al.event,
            COALESCE(u.email, 'System'),
            al.created_at::timestamp,
            al.metadata::text
        ),
        E'\n'
        ORDER BY al.created_at DESC
    ) AS error_logs_details
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
WHERE al.event ILIKE '%error%' 
   OR al.event ILIKE '%fail%' 
   OR al.event ILIKE '%exception%'
   OR (al.metadata ? 'error' AND al.metadata->>'error' IS NOT NULL)
GROUP BY 'ERROR DETECTION IN AUDIT LOGS';