-- OneMil: Notifications Management and Bulk Sending SQL File
-- This file contains all SQL operations for notifications including:
-- 1. Single notification operations (CRUD with logging)
-- 2. Bulk notification operations for multiple users
-- 3. Utility queries for filtering, reporting, and summaries
-- 4. Sofinity payload preparation for future integration

-- ============================================================================
-- 1. SINGLE NOTIFICATION OPERATIONS
-- ============================================================================

-- OneMil: Create a single notification with logging
DO $$
DECLARE
    v_user_id uuid := 'PUT_USER_ID_HERE';
    v_notification_type text := 'PUT_TYPE_HERE';  -- e.g., 'prize_won', 'payment_complete', 'system_alert'
    v_title text := 'PUT_TITLE_HERE';
    v_message text := 'PUT_MESSAGE_HERE';
    v_new_notification_id uuid;
    v_new_notification_data jsonb;
    v_sofinity_payload jsonb;
BEGIN
    -- Insert new notification
    INSERT INTO notifications (user_id, type, title, message, status)
    VALUES (v_user_id, v_notification_type, v_title, v_message, 'queued')
    RETURNING id INTO v_new_notification_id;

    -- Get the created notification data
    SELECT to_jsonb(n.*) INTO v_new_notification_data
    FROM notifications n
    WHERE n.id = v_new_notification_id;

    -- Log the creation action
    PERFORM log_admin_action(
        'notification_created',
        'notifications',
        v_new_notification_id,
        NULL,
        v_new_notification_data
    );

    -- Prepare Sofinity payload (ready for future integration)
    v_sofinity_payload := jsonb_build_object(
        'event_name', 'notification_created',
        'notification_id', v_new_notification_id,
        'user_id', v_user_id,
        'notification_type', v_notification_type,
        'title', v_title,
        'message', v_message,
        'status', 'queued',
        'created_timestamp', now(),
        'metadata', jsonb_build_object(
            'creation_method', 'admin_single_create',
            'admin_user', auth.uid(),
            'notification_priority', 'normal'
        )
    );

    RAISE NOTICE 'Notification created: % | Type: % | User: % | Sofinity payload ready', 
                 v_new_notification_id, v_notification_type, v_user_id;
    RAISE NOTICE 'Sofinity payload: %', v_sofinity_payload;
END $$;

-- OneMil: Update notification status with logging
DO $$
DECLARE
    v_notification_id uuid := 'PUT_NOTIFICATION_ID_HERE';
    v_new_status text := 'PUT_NEW_STATUS_HERE';  -- e.g., 'sent', 'failed', 'read'
    v_old_notification_data jsonb;
    v_new_notification_data jsonb;
    v_sofinity_payload jsonb;
BEGIN
    -- Get old notification data
    SELECT to_jsonb(n.*) INTO v_old_notification_data
    FROM notifications n
    WHERE n.id = v_notification_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Notification not found: %', v_notification_id;
    END IF;

    -- Update notification status
    UPDATE notifications 
    SET status = v_new_status,
        sent_at = CASE WHEN v_new_status = 'sent' THEN now() ELSE sent_at END
    WHERE id = v_notification_id;

    -- Get new notification data
    SELECT to_jsonb(n.*) INTO v_new_notification_data
    FROM notifications n
    WHERE n.id = v_notification_id;

    -- Log the update action
    PERFORM log_admin_action(
        'notification_status_updated',
        'notifications',
        v_notification_id,
        v_old_notification_data,
        v_new_notification_data
    );

    -- Prepare Sofinity payload
    v_sofinity_payload := jsonb_build_object(
        'event_name', 'notification_status_updated',
        'notification_id', v_notification_id,
        'user_id', (v_old_notification_data->>'user_id')::uuid,
        'old_status', v_old_notification_data->>'status',
        'new_status', v_new_status,
        'update_timestamp', now(),
        'metadata', jsonb_build_object(
            'update_method', 'admin_single_update',
            'admin_user', auth.uid(),
            'notification_type', v_old_notification_data->>'type'
        )
    );

    RAISE NOTICE 'Notification status updated: % | Old: % | New: %', 
                 v_notification_id, v_old_notification_data->>'status', v_new_status;
    RAISE NOTICE 'Sofinity payload: %', v_sofinity_payload;
END $$;

-- OneMil: Delete notification with logging
DO $$
DECLARE
    v_notification_id uuid := 'PUT_NOTIFICATION_ID_HERE';
    v_old_notification_data jsonb;
    v_sofinity_payload jsonb;
BEGIN
    -- Get notification data before deletion
    SELECT to_jsonb(n.*) INTO v_old_notification_data
    FROM notifications n
    WHERE n.id = v_notification_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Notification not found: %', v_notification_id;
    END IF;

    -- Delete notification
    DELETE FROM notifications WHERE id = v_notification_id;

    -- Log the deletion action
    PERFORM log_admin_action(
        'notification_deleted',
        'notifications',
        v_notification_id,
        v_old_notification_data,
        NULL
    );

    -- Prepare Sofinity payload
    v_sofinity_payload := jsonb_build_object(
        'event_name', 'notification_deleted',
        'notification_id', v_notification_id,
        'user_id', (v_old_notification_data->>'user_id')::uuid,
        'deleted_notification', v_old_notification_data,
        'deletion_timestamp', now(),
        'metadata', jsonb_build_object(
            'deletion_method', 'admin_single_delete',
            'admin_user', auth.uid(),
            'deletion_reason', 'admin_cleanup'
        )
    );

    RAISE NOTICE 'Notification deleted: % | Type: % | User: %', 
                 v_notification_id, 
                 v_old_notification_data->>'type', 
                 v_old_notification_data->>'user_id';
    RAISE NOTICE 'Sofinity payload: %', v_sofinity_payload;
END $$;

-- ============================================================================
-- 2. BULK NOTIFICATION OPERATIONS
-- ============================================================================

-- OneMil: Bulk create notifications for multiple users
DO $$
DECLARE
    v_user_ids uuid[] := ARRAY['PUT_USER_ID_1', 'PUT_USER_ID_2', 'PUT_USER_ID_3'];  -- Array of user IDs
    v_notification_type text := 'PUT_TYPE_HERE';  -- e.g., 'system_announcement'
    v_title text := 'PUT_TITLE_HERE';
    v_message text := 'PUT_MESSAGE_HERE';
    v_user_id uuid;
    v_new_notification_id uuid;
    v_new_notification_data jsonb;
    v_sofinity_payload jsonb;
    v_created_count integer := 0;
    v_batch_id text;
BEGIN
    v_batch_id := extract(epoch from now())::text;

    FOREACH v_user_id IN ARRAY v_user_ids
    LOOP
        -- Insert notification for each user
        INSERT INTO notifications (user_id, type, title, message, status)
        VALUES (v_user_id, v_notification_type, v_title, v_message, 'queued')
        RETURNING id INTO v_new_notification_id;

        -- Get notification data
        SELECT to_jsonb(n.*) INTO v_new_notification_data
        FROM notifications n
        WHERE n.id = v_new_notification_id;

        -- Log each creation
        PERFORM log_admin_action(
            'notification_bulk_created',
            'notifications',
            v_new_notification_id,
            NULL,
            v_new_notification_data
        );

        -- Prepare Sofinity payload for each notification
        v_sofinity_payload := jsonb_build_object(
            'event_name', 'notification_bulk_created',
            'notification_id', v_new_notification_id,
            'user_id', v_user_id,
            'batch_id', v_batch_id,
            'notification_type', v_notification_type,
            'title', v_title,
            'message', v_message,
            'creation_timestamp', now(),
            'metadata', jsonb_build_object(
                'creation_method', 'admin_bulk_create',
                'admin_user', auth.uid(),
                'batch_size', array_length(v_user_ids, 1),
                'batch_position', v_created_count + 1
            )
        );

        v_created_count := v_created_count + 1;

        RAISE NOTICE 'Bulk notification % of %: % | Type: % | User: %', 
                     v_created_count, 
                     array_length(v_user_ids, 1),
                     v_new_notification_id, 
                     v_notification_type, 
                     v_user_id;
    END LOOP;

    RAISE NOTICE 'Bulk notification creation completed: % notifications | Batch ID: %', 
                 v_created_count, v_batch_id;
END $$;

-- OneMil: Bulk update notification status by criteria
DO $$
DECLARE
    v_target_status text := 'PUT_OLD_STATUS_HERE';  -- e.g., 'queued'
    v_new_status text := 'PUT_NEW_STATUS_HERE';     -- e.g., 'sent'
    v_target_type text := 'PUT_TYPE_HERE';          -- e.g., 'prize_won'
    v_notification_record RECORD;
    v_old_notification_data jsonb;
    v_new_notification_data jsonb;
    v_sofinity_payload jsonb;
    v_updated_count integer := 0;
    v_batch_id text;
BEGIN
    v_batch_id := extract(epoch from now())::text;

    FOR v_notification_record IN 
        SELECT * FROM notifications 
        WHERE status = v_target_status
        AND type = v_target_type
        AND created_at >= now() - interval '7 days'  -- Only recent notifications
        ORDER BY created_at ASC
    LOOP
        v_old_notification_data := to_jsonb(v_notification_record);

        -- Update notification status
        UPDATE notifications 
        SET status = v_new_status,
            sent_at = CASE WHEN v_new_status = 'sent' THEN now() ELSE sent_at END
        WHERE id = v_notification_record.id;

        -- Get updated data
        SELECT to_jsonb(n.*) INTO v_new_notification_data
        FROM notifications n
        WHERE n.id = v_notification_record.id;

        -- Log the update
        PERFORM log_admin_action(
            'notification_bulk_status_updated',
            'notifications',
            v_notification_record.id,
            v_old_notification_data,
            v_new_notification_data
        );

        -- Prepare Sofinity payload
        v_sofinity_payload := jsonb_build_object(
            'event_name', 'notification_bulk_status_updated',
            'notification_id', v_notification_record.id,
            'user_id', v_notification_record.user_id,
            'batch_id', v_batch_id,
            'old_status', v_target_status,
            'new_status', v_new_status,
            'update_timestamp', now(),
            'metadata', jsonb_build_object(
                'update_method', 'admin_bulk_update',
                'admin_user', auth.uid(),
                'notification_type', v_notification_record.type,
                'batch_position', v_updated_count + 1
            )
        );

        v_updated_count := v_updated_count + 1;

        RAISE NOTICE 'Bulk update % | Notification: % | User: % | Status: % -> %', 
                     v_updated_count,
                     v_notification_record.id, 
                     v_notification_record.user_id,
                     v_target_status,
                     v_new_status;
    END LOOP;

    RAISE NOTICE 'Bulk status update completed: % notifications | Batch ID: %', 
                 v_updated_count, v_batch_id;
END $$;

-- OneMil: Bulk delete old notifications with logging
DO $$
DECLARE
    v_cutoff_date timestamp := now() - interval 'PUT_DAYS_HERE days';  -- e.g., 30 days
    v_target_status text := 'PUT_STATUS_HERE';  -- e.g., 'sent'
    v_notification_record RECORD;
    v_old_notification_data jsonb;
    v_sofinity_payload jsonb;
    v_deleted_count integer := 0;
    v_batch_id text;
BEGIN
    v_batch_id := extract(epoch from now())::text;

    FOR v_notification_record IN 
        SELECT * FROM notifications 
        WHERE created_at < v_cutoff_date
        AND status = v_target_status
        ORDER BY created_at ASC
    LOOP
        v_old_notification_data := to_jsonb(v_notification_record);

        -- Delete notification
        DELETE FROM notifications WHERE id = v_notification_record.id;

        -- Log the deletion
        PERFORM log_admin_action(
            'notification_bulk_deleted',
            'notifications',
            v_notification_record.id,
            v_old_notification_data,
            NULL
        );

        -- Prepare Sofinity payload
        v_sofinity_payload := jsonb_build_object(
            'event_name', 'notification_bulk_deleted',
            'notification_id', v_notification_record.id,
            'user_id', v_notification_record.user_id,
            'batch_id', v_batch_id,
            'deleted_notification', v_old_notification_data,
            'deletion_timestamp', now(),
            'metadata', jsonb_build_object(
                'deletion_method', 'admin_bulk_cleanup',
                'admin_user', auth.uid(),
                'cutoff_date', v_cutoff_date,
                'batch_position', v_deleted_count + 1
            )
        );

        v_deleted_count := v_deleted_count + 1;

        RAISE NOTICE 'Bulk delete % | Notification: % | User: % | Age: % days', 
                     v_deleted_count,
                     v_notification_record.id, 
                     v_notification_record.user_id,
                     extract(days from now() - v_notification_record.created_at)::integer;
    END LOOP;

    RAISE NOTICE 'Bulk deletion completed: % notifications | Batch ID: %', 
                 v_deleted_count, v_batch_id;
END $$;

-- ============================================================================
-- 3. UTILITY QUERIES AND REPORTS
-- ============================================================================

-- OneMil: All notifications with user details and STRING_AGG output
SELECT 
    'NOTIFICATIONS COMPLETE SUMMARY' AS report_type,
    COUNT(*) AS total_notifications,
    COUNT(DISTINCT n.user_id) AS unique_users,
    COUNT(DISTINCT n.type) AS unique_types,
    STRING_AGG(
        format('[%s] %s | User: %s (%s) | Type: %s | Status: %s | Created: %s | Title: %s',
            n.id::text,
            COALESCE(n.title, 'No Title'),
            COALESCE(u.email, 'Unknown User'),
            COALESCE(u.name, 'N/A'),
            n.type,
            n.status,
            n.created_at::date,
            COALESCE(n.title, 'No Title')
        ),
        E'\n'
        ORDER BY n.created_at DESC
    ) AS notifications_details
FROM notifications n
LEFT JOIN users u ON u.id = n.user_id
ORDER BY n.created_at DESC;

-- OneMil: Notifications filtered by type with STRING_AGG
SELECT 
    format('NOTIFICATIONS BY TYPE: %s', 'PUT_TYPE_HERE') AS report_type,
    COUNT(*) AS notifications_of_type,
    COUNT(DISTINCT n.user_id) AS unique_users_notified,
    STRING_AGG(DISTINCT n.status, ', ') AS statuses_found,
    STRING_AGG(
        format('[%s] User: %s | Status: %s | Created: %s | Message: %s',
            n.id::text,
            COALESCE(u.email, 'Unknown'),
            n.status,
            n.created_at::timestamp,
            LEFT(n.message, 100) || CASE WHEN LENGTH(n.message) > 100 THEN '...' ELSE '' END
        ),
        E'\n'
        ORDER BY n.created_at DESC
    ) AS type_notifications_details
FROM notifications n
LEFT JOIN users u ON u.id = n.user_id
WHERE n.type = 'PUT_TYPE_HERE'  -- Replace with: 'prize_won', 'system_alert', etc.
ORDER BY n.created_at DESC;

-- OneMil: Notifications by status with user breakdown
SELECT 
    n.status,
    COUNT(*) AS status_count,
    COUNT(DISTINCT n.user_id) AS unique_users,
    STRING_AGG(DISTINCT n.type, ', ' ORDER BY n.type) AS types_in_status,
    STRING_AGG(
        format('User: %s | Type: %s | Created: %s | Title: %s',
            COALESCE(u.email, 'Unknown'),
            n.type,
            n.created_at::date,
            COALESCE(n.title, 'No Title')
        ),
        E'\n'
        ORDER BY n.created_at DESC
    ) AS status_notifications_details,
    MIN(n.created_at) AS oldest_notification,
    MAX(n.created_at) AS newest_notification
FROM notifications n
LEFT JOIN users u ON u.id = n.user_id
GROUP BY n.status
ORDER BY status_count DESC;

-- OneMil: Notifications by date range
SELECT 
    format('NOTIFICATIONS FROM %s TO %s', 'PUT_START_DATE_HERE', 'PUT_END_DATE_HERE') AS report_type,
    COUNT(*) AS notifications_in_range,
    COUNT(DISTINCT n.user_id) AS users_notified,
    COUNT(DISTINCT n.type) AS notification_types,
    STRING_AGG(DISTINCT n.type, ', ' ORDER BY n.type) AS types_sent,
    STRING_AGG(
        format('[%s] %s | User: %s | Type: %s | Status: %s | Date: %s',
            n.id::text,
            COALESCE(n.title, 'No Title'),
            COALESCE(u.email, 'Unknown'),
            n.type,
            n.status,
            n.created_at::date
        ),
        E'\n'
        ORDER BY n.created_at DESC
    ) AS date_range_notifications_details
FROM notifications n
LEFT JOIN users u ON u.id = n.user_id
WHERE n.created_at BETWEEN 'PUT_START_DATE_HERE'::timestamp AND 'PUT_END_DATE_HERE'::timestamp
ORDER BY n.created_at DESC;

-- OneMil: User notification activity summary
SELECT 
    u.email,
    u.name,
    n.user_id,
    COUNT(*) AS total_notifications,
    COUNT(CASE WHEN n.status = 'sent' THEN 1 END) AS sent_notifications,
    COUNT(CASE WHEN n.status = 'queued' THEN 1 END) AS queued_notifications,
    COUNT(CASE WHEN n.status = 'failed' THEN 1 END) AS failed_notifications,
    COUNT(DISTINCT n.type) AS unique_notification_types,
    STRING_AGG(DISTINCT n.type, ', ' ORDER BY n.type) AS notification_types_received,
    STRING_AGG(
        format('%s: %s (%s) on %s',
            n.type,
            COALESCE(n.title, 'No Title'),
            n.status,
            n.created_at::date
        ),
        E'\n'
        ORDER BY n.created_at DESC
    ) AS user_notifications_details,
    MIN(n.created_at) AS first_notification,
    MAX(n.created_at) AS last_notification
FROM notifications n
LEFT JOIN users u ON u.id = n.user_id
GROUP BY n.user_id, u.email, u.name
ORDER BY total_notifications DESC, last_notification DESC;

-- OneMil: Daily notification activity summary
SELECT 
    n.created_at::date AS notification_date,
    COUNT(*) AS daily_notifications,
    COUNT(DISTINCT n.user_id) AS users_notified,
    COUNT(DISTINCT n.type) AS types_sent,
    COUNT(CASE WHEN n.status = 'sent' THEN 1 END) AS sent_count,
    COUNT(CASE WHEN n.status = 'queued' THEN 1 END) AS queued_count,
    COUNT(CASE WHEN n.status = 'failed' THEN 1 END) AS failed_count,
    STRING_AGG(DISTINCT n.type, ', ' ORDER BY n.type) AS daily_types,
    STRING_AGG(
        format('%s notifications of type %s',
            type_counts.type_count,
            type_counts.type
        ),
        ', '
        ORDER BY type_counts.type_count DESC
    ) AS daily_type_breakdown
FROM notifications n
LEFT JOIN (
    SELECT 
        created_at::date as date,
        type,
        COUNT(*) as type_count
    FROM notifications
    GROUP BY created_at::date, type
) type_counts ON type_counts.date = n.created_at::date
WHERE n.created_at >= now() - interval '30 days'
GROUP BY n.created_at::date
ORDER BY notification_date DESC;

-- OneMil: Notification type analysis with performance metrics
SELECT 
    n.type AS notification_type,
    COUNT(*) AS total_sent,
    COUNT(CASE WHEN n.status = 'sent' THEN 1 END) AS successfully_sent,
    COUNT(CASE WHEN n.status = 'failed' THEN 1 END) AS failed_sends,
    COUNT(CASE WHEN n.status = 'queued' THEN 1 END) AS still_queued,
    ROUND(
        (COUNT(CASE WHEN n.status = 'sent' THEN 1 END)::numeric / COUNT(*)::numeric) * 100, 2
    ) AS success_rate_percentage,
    COUNT(DISTINCT n.user_id) AS unique_recipients,
    STRING_AGG(
        format('Status: %s | Count: %s | Users: %s',
            status_summary.status,
            status_summary.status_count,
            status_summary.unique_users
        ),
        ' | '
        ORDER BY status_summary.status_count DESC
    ) AS type_status_breakdown,
    MIN(n.created_at) AS first_sent,
    MAX(n.created_at) AS last_sent
FROM notifications n
LEFT JOIN (
    SELECT 
        type,
        status,
        COUNT(*) as status_count,
        COUNT(DISTINCT user_id) as unique_users
    FROM notifications
    GROUP BY type, status
) status_summary ON status_summary.type = n.type
GROUP BY n.type
ORDER BY total_sent DESC;

-- OneMil: Failed notifications analysis
SELECT 
    'FAILED NOTIFICATIONS ANALYSIS' AS report_type,
    COUNT(*) AS total_failed,
    COUNT(DISTINCT n.user_id) AS affected_users,
    COUNT(DISTINCT n.type) AS failed_types,
    STRING_AGG(DISTINCT n.type, ', ' ORDER BY n.type) AS types_with_failures,
    STRING_AGG(
        format('[%s] Type: %s | User: %s | Title: %s | Created: %s | Message: %s',
            n.id::text,
            n.type,
            COALESCE(u.email, 'Unknown'),
            COALESCE(n.title, 'No Title'),
            n.created_at::timestamp,
            LEFT(n.message, 100) || CASE WHEN LENGTH(n.message) > 100 THEN '...' ELSE '' END
        ),
        E'\n'
        ORDER BY n.created_at DESC
    ) AS failed_notifications_details
FROM notifications n
LEFT JOIN users u ON u.id = n.user_id
WHERE n.status = 'failed'
GROUP BY 'FAILED NOTIFICATIONS ANALYSIS';

-- OneMil: Queued notifications ready for processing
SELECT 
    'QUEUED NOTIFICATIONS READY FOR PROCESSING' AS report_type,
    COUNT(*) AS total_queued,
    COUNT(DISTINCT n.user_id) AS users_waiting,
    COUNT(DISTINCT n.type) AS queued_types,
    STRING_AGG(DISTINCT n.type, ', ' ORDER BY n.type) AS types_queued,
    STRING_AGG(
        format('[%s] Type: %s | User: %s | Created: %s ago | Title: %s',
            n.id::text,
            n.type,
            COALESCE(u.email, 'Unknown'),
            extract(hours from now() - n.created_at)::integer || ' hours',
            COALESCE(n.title, 'No Title')
        ),
        E'\n'
        ORDER BY n.created_at ASC
    ) AS queued_notifications_details,
    MIN(n.created_at) AS oldest_queued,
    MAX(n.created_at) AS newest_queued
FROM notifications n
LEFT JOIN users u ON u.id = n.user_id
WHERE n.status = 'queued'
GROUP BY 'QUEUED NOTIFICATIONS READY FOR PROCESSING';