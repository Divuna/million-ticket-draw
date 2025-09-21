-- OneMil: Statistics Panel and KPI Export SQL File
-- This file contains all SQL operations for statistics and KPIs including:
-- 1. Statistics overview queries with key metrics
-- 2. KPI export queries for daily/weekly/monthly summaries
-- 3. Advanced utility queries for performance analysis
-- 4. Sofinity payload preparation for future integration

-- ============================================================================
-- 1. STATISTICS OVERVIEW QUERIES
-- ============================================================================

-- OneMil: Complete statistics overview with STRING_AGG summary
WITH stats_overview AS (
    SELECT 
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM users WHERE created_at >= date_trunc('month', now())) AS new_users_this_month,
        (SELECT COUNT(*) FROM contests WHERE status = 'active') AS active_contests,
        (SELECT COUNT(*) FROM contests) AS total_contests,
        (SELECT COUNT(*) FROM tickets) AS total_tickets,
        (SELECT COUNT(*) FROM tickets WHERE created_at >= date_trunc('month', now())) AS tickets_this_month,
        (SELECT COUNT(*) FROM payments WHERE status = 'completed') AS completed_payments,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'completed') AS total_revenue,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'completed' AND created_at >= date_trunc('month', now())) AS revenue_this_month,
        (SELECT COUNT(*) FROM vouchers) AS total_vouchers,
        (SELECT COUNT(*) FROM vouchers WHERE created_at >= date_trunc('month', now())) AS vouchers_this_month,
        (SELECT COUNT(*) FROM bonus_prizes) AS total_bonus_prizes,
        (SELECT COUNT(*) FROM bonus_prizes WHERE status = 'won') AS won_bonus_prizes,
        (SELECT COALESCE(SUM(balance_coins), 0) FROM wallets) AS total_wallet_coins,
        (SELECT COALESCE(SUM(balance_vouchers), 0) FROM wallets) AS total_wallet_vouchers
)
SELECT 
    'ONEMIL STATISTICS OVERVIEW' AS report_type,
    STRING_AGG(
        format('%s: %s',
            metric_name,
            metric_value
        ),
        E'\n'
        ORDER BY 
            CASE metric_name
                WHEN 'Total Users' THEN 1
                WHEN 'New Users This Month' THEN 2
                WHEN 'Active Contests' THEN 3
                WHEN 'Total Contests' THEN 4
                WHEN 'Total Tickets' THEN 5
                WHEN 'Tickets This Month' THEN 6
                WHEN 'Completed Payments' THEN 7
                WHEN 'Total Revenue' THEN 8
                WHEN 'Revenue This Month' THEN 9
                WHEN 'Total Vouchers' THEN 10
                WHEN 'Vouchers This Month' THEN 11
                WHEN 'Total Bonus Prizes' THEN 12
                WHEN 'Won Bonus Prizes' THEN 13
                WHEN 'Total Wallet Coins' THEN 14
                WHEN 'Total Wallet Vouchers' THEN 15
            END
    ) AS statistics_summary,
    current_timestamp AS generated_at
FROM (
    SELECT 'Total Users' AS metric_name, total_users::text AS metric_value FROM stats_overview
    UNION ALL SELECT 'New Users This Month', new_users_this_month::text FROM stats_overview
    UNION ALL SELECT 'Active Contests', active_contests::text FROM stats_overview
    UNION ALL SELECT 'Total Contests', total_contests::text FROM stats_overview
    UNION ALL SELECT 'Total Tickets', total_tickets::text FROM stats_overview
    UNION ALL SELECT 'Tickets This Month', tickets_this_month::text FROM stats_overview
    UNION ALL SELECT 'Completed Payments', completed_payments::text FROM stats_overview
    UNION ALL SELECT 'Total Revenue', total_revenue::text FROM stats_overview
    UNION ALL SELECT 'Revenue This Month', revenue_this_month::text FROM stats_overview
    UNION ALL SELECT 'Total Vouchers', total_vouchers::text FROM stats_overview
    UNION ALL SELECT 'Vouchers This Month', vouchers_this_month::text FROM stats_overview
    UNION ALL SELECT 'Total Bonus Prizes', total_bonus_prizes::text FROM stats_overview
    UNION ALL SELECT 'Won Bonus Prizes', won_bonus_prizes::text FROM stats_overview
    UNION ALL SELECT 'Total Wallet Coins', total_wallet_coins::text FROM stats_overview
    UNION ALL SELECT 'Total Wallet Vouchers', total_wallet_vouchers::text FROM stats_overview
) metrics
GROUP BY current_timestamp;

-- OneMil: Monthly statistics breakdown with trends
SELECT 
    date_trunc('month', month_date) AS statistics_month,
    SUM(new_users) AS new_users,
    SUM(new_contests) AS new_contests,
    SUM(tickets_sold) AS tickets_sold,
    SUM(completed_payments) AS completed_payments,
    SUM(revenue) AS total_revenue,
    SUM(vouchers_issued) AS vouchers_issued,
    STRING_AGG(
        format('Month: %s | Users: %s | Contests: %s | Tickets: %s | Revenue: %s | Vouchers: %s',
            to_char(date_trunc('month', month_date), 'YYYY-MM'),
            new_users,
            new_contests,
            tickets_sold,
            revenue,
            vouchers_issued
        ),
        E'\n'
        ORDER BY month_date DESC
    ) AS monthly_breakdown
FROM (
    SELECT 
        date_trunc('month', u.created_at) AS month_date,
        COUNT(u.id) AS new_users,
        0 AS new_contests,
        0 AS tickets_sold,
        0 AS completed_payments,
        0 AS revenue,
        0 AS vouchers_issued
    FROM users u
    WHERE u.created_at >= now() - interval '12 months'
    GROUP BY date_trunc('month', u.created_at)
    
    UNION ALL
    
    SELECT 
        date_trunc('month', c.created_at),
        0,
        COUNT(c.id),
        0,
        0,
        0,
        0
    FROM contests c
    WHERE c.created_at >= now() - interval '12 months'
    GROUP BY date_trunc('month', c.created_at)
    
    UNION ALL
    
    SELECT 
        date_trunc('month', t.created_at),
        0,
        0,
        COUNT(t.id),
        0,
        0,
        0
    FROM tickets t
    WHERE t.created_at >= now() - interval '12 months'
    GROUP BY date_trunc('month', t.created_at)
    
    UNION ALL
    
    SELECT 
        date_trunc('month', p.created_at),
        0,
        0,
        0,
        COUNT(p.id),
        COALESCE(SUM(p.amount), 0),
        0
    FROM payments p
    WHERE p.status = 'completed' AND p.created_at >= now() - interval '12 months'
    GROUP BY date_trunc('month', p.created_at)
    
    UNION ALL
    
    SELECT 
        date_trunc('month', v.created_at),
        0,
        0,
        0,
        0,
        0,
        COUNT(v.id)
    FROM vouchers v
    WHERE v.created_at >= now() - interval '12 months'
    GROUP BY date_trunc('month', v.created_at)
) monthly_stats
GROUP BY date_trunc('month', month_date)
ORDER BY statistics_month DESC;

-- ============================================================================
-- 2. KPI EXPORT QUERIES
-- ============================================================================

-- OneMil: Daily KPI summary for last 30 days
SELECT 
    kpi_date,
    new_users,
    tickets_sold,
    payments_completed,
    daily_revenue,
    vouchers_issued,
    bonus_prizes_won,
    STRING_AGG(
        format('Date: %s | Users: %s | Tickets: %s | Payments: %s | Revenue: %s | Vouchers: %s | Bonuses: %s',
            kpi_date,
            new_users,
            tickets_sold,
            payments_completed,
            daily_revenue,
            vouchers_issued,
            bonus_prizes_won
        ),
        E'\n'
        ORDER BY kpi_date DESC
    ) OVER() AS daily_kpi_summary
FROM (
    SELECT 
        d.kpi_date,
        COALESCE(users_stats.new_users, 0) AS new_users,
        COALESCE(tickets_stats.tickets_sold, 0) AS tickets_sold,
        COALESCE(payments_stats.payments_completed, 0) AS payments_completed,
        COALESCE(payments_stats.daily_revenue, 0) AS daily_revenue,
        COALESCE(vouchers_stats.vouchers_issued, 0) AS vouchers_issued,
        COALESCE(bonus_stats.bonus_prizes_won, 0) AS bonus_prizes_won
    FROM (
        SELECT generate_series(
            now()::date - interval '30 days',
            now()::date,
            '1 day'::interval
        )::date AS kpi_date
    ) d
    LEFT JOIN (
        SELECT 
            u.created_at::date AS user_date,
            COUNT(*) AS new_users
        FROM users u
        WHERE u.created_at >= now() - interval '30 days'
        GROUP BY u.created_at::date
    ) users_stats ON users_stats.user_date = d.kpi_date
    LEFT JOIN (
        SELECT 
            t.created_at::date AS ticket_date,
            COUNT(*) AS tickets_sold
        FROM tickets t
        WHERE t.created_at >= now() - interval '30 days'
        GROUP BY t.created_at::date
    ) tickets_stats ON tickets_stats.ticket_date = d.kpi_date
    LEFT JOIN (
        SELECT 
            p.created_at::date AS payment_date,
            COUNT(*) AS payments_completed,
            SUM(p.amount) AS daily_revenue
        FROM payments p
        WHERE p.status = 'completed' AND p.created_at >= now() - interval '30 days'
        GROUP BY p.created_at::date
    ) payments_stats ON payments_stats.payment_date = d.kpi_date
    LEFT JOIN (
        SELECT 
            v.created_at::date AS voucher_date,
            COUNT(*) AS vouchers_issued
        FROM vouchers v
        WHERE v.created_at >= now() - interval '30 days'
        GROUP BY v.created_at::date
    ) vouchers_stats ON vouchers_stats.voucher_date = d.kip_date
    LEFT JOIN (
        SELECT 
            bp.created_at::date AS bonus_date,
            COUNT(*) AS bonus_prizes_won
        FROM bonus_prizes bp
        WHERE bp.status = 'won' AND bp.created_at >= now() - interval '30 days'
        GROUP BY bp.created_at::date
    ) bonus_stats ON bonus_stats.bonus_date = d.kpi_date
    ORDER BY d.kpi_date DESC
) daily_kpis;

-- OneMil: Weekly KPI aggregation
SELECT 
    date_trunc('week', kpi_week) AS week_start,
    SUM(new_users) AS weekly_new_users,
    SUM(tickets_sold) AS weekly_tickets_sold,
    SUM(payments_completed) AS weekly_payments,
    SUM(weekly_revenue) AS total_weekly_revenue,
    SUM(vouchers_issued) AS weekly_vouchers,
    STRING_AGG(
        format('Week of %s: Users: %s | Tickets: %s | Payments: %s | Revenue: %s | Vouchers: %s',
            date_trunc('week', kpi_week),
            new_users,
            tickets_sold,
            payments_completed,
            weekly_revenue,
            vouchers_issued
        ),
        E'\n'
        ORDER BY kpi_week DESC
    ) AS weekly_kpi_summary
FROM (
    SELECT 
        date_trunc('week', u.created_at) AS kpi_week,
        COUNT(u.id) AS new_users,
        0 AS tickets_sold,
        0 AS payments_completed,
        0 AS weekly_revenue,
        0 AS vouchers_issued
    FROM users u
    WHERE u.created_at >= now() - interval '12 weeks'
    GROUP BY date_trunc('week', u.created_at)
    
    UNION ALL
    
    SELECT 
        date_trunc('week', t.created_at),
        0,
        COUNT(t.id),
        0,
        0,
        0
    FROM tickets t
    WHERE t.created_at >= now() - interval '12 weeks'
    GROUP BY date_trunc('week', t.created_at)
    
    UNION ALL
    
    SELECT 
        date_trunc('week', p.created_at),
        0,
        0,
        COUNT(p.id),
        SUM(p.amount),
        0
    FROM payments p
    WHERE p.status = 'completed' AND p.created_at >= now() - interval '12 weeks'
    GROUP BY date_trunc('week', p.created_at)
    
    UNION ALL
    
    SELECT 
        date_trunc('week', v.created_at),
        0,
        0,
        0,
        0,
        COUNT(v.id)
    FROM vouchers v
    WHERE v.created_at >= now() - interval '12 weeks'
    GROUP BY date_trunc('week', v.created_at)
) weekly_data
GROUP BY date_trunc('week', kpi_week)
ORDER BY week_start DESC;

-- ============================================================================
-- 3. ADVANCED UTILITY QUERIES
-- ============================================================================

-- OneMil: Top-performing contests by tickets sold and revenue
SELECT 
    c.id AS contest_id,
    c.title AS contest_title,
    c.status AS contest_status,
    c.ticket_count AS max_tickets,
    c.ticket_price,
    COALESCE(contest_stats.tickets_sold, 0) AS tickets_sold,
    COALESCE(contest_stats.unique_players, 0) AS unique_players,
    COALESCE(contest_stats.total_revenue, 0) AS contest_revenue,
    ROUND(
        (COALESCE(contest_stats.tickets_sold, 0)::numeric / c.ticket_count::numeric) * 100, 2
    ) AS completion_percentage,
    STRING_AGG(
        format('Contest: %s | Status: %s | Tickets: %s/%s (%.1f%%) | Players: %s | Revenue: %s',
            c.title,
            c.status,
            COALESCE(contest_stats.tickets_sold, 0),
            c.ticket_count,
            ROUND((COALESCE(contest_stats.tickets_sold, 0)::numeric / c.ticket_count::numeric) * 100, 2),
            COALESCE(contest_stats.unique_players, 0),
            COALESCE(contest_stats.total_revenue, 0)
        ),
        E'\n'
        ORDER BY COALESCE(contest_stats.total_revenue, 0) DESC
    ) OVER() AS top_contests_summary
FROM contests c
LEFT JOIN (
    SELECT 
        t.contest_id,
        COUNT(t.id) AS tickets_sold,
        COUNT(DISTINCT t.user_id) AS unique_players,
        COUNT(t.id) * MAX(c.ticket_price) AS total_revenue
    FROM tickets t
    JOIN contests c ON c.id = t.contest_id
    GROUP BY t.contest_id
) contest_stats ON contest_stats.contest_id = c.id
ORDER BY contest_revenue DESC, tickets_sold DESC;

-- OneMil: Users with highest activity and spending
SELECT 
    u.id AS user_id,
    u.email,
    u.name,
    u.role,
    COALESCE(user_stats.tickets_purchased, 0) AS tickets_purchased,
    COALESCE(user_stats.contests_participated, 0) AS contests_participated,
    COALESCE(user_stats.total_spent, 0) AS total_spent,
    COALESCE(user_stats.vouchers_owned, 0) AS vouchers_owned,
    COALESCE(user_stats.bonus_prizes_won, 0) AS bonus_prizes_won,
    COALESCE(wallet_stats.current_balance_coins, 0) AS current_balance_coins,
    COALESCE(wallet_stats.current_balance_vouchers, 0) AS current_balance_vouchers,
    STRING_AGG(
        format('User: %s (%s) | Tickets: %s | Contests: %s | Spent: %s | Vouchers: %s | Bonuses: %s | Balance: %s coins, %s vouchers',
            u.email,
            COALESCE(u.name, 'N/A'),
            COALESCE(user_stats.tickets_purchased, 0),
            COALESCE(user_stats.contests_participated, 0),
            COALESCE(user_stats.total_spent, 0),
            COALESCE(user_stats.vouchers_owned, 0),
            COALESCE(user_stats.bonus_prizes_won, 0),
            COALESCE(wallet_stats.current_balance_coins, 0),
            COALESCE(wallet_stats.current_balance_vouchers, 0)
        ),
        E'\n'
        ORDER BY COALESCE(user_stats.total_spent, 0) DESC
    ) OVER() AS top_users_summary
FROM users u
LEFT JOIN (
    SELECT 
        t.user_id,
        COUNT(t.id) AS tickets_purchased,
        COUNT(DISTINCT t.contest_id) AS contests_participated,
        SUM(c.ticket_price) AS total_spent
    FROM tickets t
    JOIN contests c ON c.id = t.contest_id
    GROUP BY t.user_id
) user_stats ON user_stats.user_id = u.id
LEFT JOIN (
    SELECT 
        v.user_id,
        COUNT(v.id) AS vouchers_owned
    FROM vouchers v
    GROUP BY v.user_id
) voucher_stats ON voucher_stats.user_id = u.id
LEFT JOIN (
    SELECT 
        bp.user_id,
        COUNT(bp.id) AS bonus_prizes_won
    FROM bonus_prizes bp
    WHERE bp.status = 'won'
    GROUP BY bp.user_id
) bonus_stats ON bonus_stats.user_id = u.id
LEFT JOIN (
    SELECT 
        w.user_id,
        w.balance_coins AS current_balance_coins,
        w.balance_vouchers AS current_balance_vouchers
    FROM wallets w
) wallet_stats ON wallet_stats.user_id = u.id
WHERE user_stats.user_id IS NOT NULL
ORDER BY total_spent DESC, tickets_purchased DESC
LIMIT 50;

-- OneMil: Revenue breakdown and analysis
SELECT 
    'REVENUE BREAKDOWN ANALYSIS' AS report_type,
    SUM(CASE WHEN p.created_at >= date_trunc('day', now()) THEN p.amount ELSE 0 END) AS revenue_today,
    SUM(CASE WHEN p.created_at >= date_trunc('week', now()) THEN p.amount ELSE 0 END) AS revenue_this_week,
    SUM(CASE WHEN p.created_at >= date_trunc('month', now()) THEN p.amount ELSE 0 END) AS revenue_this_month,
    SUM(CASE WHEN p.created_at >= date_trunc('year', now()) THEN p.amount ELSE 0 END) AS revenue_this_year,
    SUM(p.amount) AS total_revenue,
    COUNT(DISTINCT p.user_id) AS paying_users,
    ROUND(AVG(p.amount), 2) AS average_payment,
    STRING_AGG(
        format('Method: %s | Count: %s | Total: %s | Avg: %s',
            method_stats.method,
            method_stats.payment_count,
            method_stats.method_total,
            ROUND(method_stats.method_avg, 2)
        ),
        E'\n'
        ORDER BY method_stats.method_total DESC
    ) AS payment_methods_breakdown
FROM payments p
LEFT JOIN (
    SELECT 
        pm.method,
        COUNT(*) AS payment_count,
        SUM(pm.amount) AS method_total,
        AVG(pm.amount) AS method_avg
    FROM payments pm
    WHERE pm.status = 'completed'
    GROUP BY pm.method
) method_stats ON method_stats.method = p.method
WHERE p.status = 'completed'
GROUP BY 'REVENUE BREAKDOWN ANALYSIS';

-- OneMil: Contest performance with bonus prizes analysis
SELECT 
    c.id AS contest_id,
    c.title,
    c.status,
    c.ticket_count AS max_tickets,
    c.ticket_price,
    COALESCE(tickets_stats.sold_tickets, 0) AS tickets_sold,
    COALESCE(bonus_stats.total_bonuses, 0) AS total_bonus_prizes,
    COALESCE(bonus_stats.won_bonuses, 0) AS won_bonus_prizes,
    COALESCE(bonus_stats.pending_bonuses, 0) AS pending_bonus_prizes,
    COALESCE(bonus_stats.bonus_value, 0) AS total_bonus_value,
    STRING_AGG(
        format('Contest: %s | Tickets: %s/%s | Bonuses: %s total (%s won, %s pending) | Value: %s',
            c.title,
            COALESCE(tickets_stats.sold_tickets, 0),
            c.ticket_count,
            COALESCE(bonus_stats.total_bonuses, 0),
            COALESCE(bonus_stats.won_bonuses, 0),
            COALESCE(bonus_stats.pending_bonuses, 0),
            COALESCE(bonus_stats.bonus_value, 0)
        ),
        E'\n'
        ORDER BY c.created_at DESC
    ) OVER() AS contest_bonus_analysis
FROM contests c
LEFT JOIN (
    SELECT 
        t.contest_id,
        COUNT(t.id) AS sold_tickets
    FROM tickets t
    GROUP BY t.contest_id
) tickets_stats ON tickets_stats.contest_id = c.id
LEFT JOIN (
    SELECT 
        bp.contest_id,
        COUNT(bp.id) AS total_bonuses,
        COUNT(CASE WHEN bp.status = 'won' THEN 1 END) AS won_bonuses,
        COUNT(CASE WHEN bp.status = 'pending' THEN 1 END) AS pending_bonuses,
        COALESCE(SUM(bp.amount), 0) AS bonus_value
    FROM bonus_prizes bp
    GROUP BY bp.contest_id
) bonus_stats ON bonus_stats.contest_id = c.id
ORDER BY c.created_at DESC;

-- OneMil: Sofinity payload preparation for statistics export
DO $$
DECLARE
    v_stats_record RECORD;
    v_sofinity_payload jsonb;
    v_stats_summary text := '';
BEGIN
    -- Collect current statistics
    SELECT 
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM contests WHERE status = 'active') AS active_contests,
        (SELECT COUNT(*) FROM tickets) AS total_tickets,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'completed') AS total_revenue,
        (SELECT COUNT(*) FROM vouchers) AS total_vouchers,
        (SELECT COUNT(*) FROM bonus_prizes WHERE status = 'won') AS won_bonuses
    INTO v_stats_record;

    -- Prepare Sofinity payload for statistics export
    v_sofinity_payload := jsonb_build_object(
        'event_name', 'statistics_exported',
        'export_timestamp', now(),
        'statistics_data', jsonb_build_object(
            'total_users', v_stats_record.total_users,
            'active_contests', v_stats_record.active_contests,
            'total_tickets', v_stats_record.total_tickets,
            'total_revenue', v_stats_record.total_revenue,
            'total_vouchers', v_stats_record.total_vouchers,
            'won_bonuses', v_stats_record.won_bonuses,
            'export_date', now()::date,
            'export_reason', 'admin_statistics_review'
        ),
        'metadata', jsonb_build_object(
            'export_type', 'statistics_kpi_summary',
            'data_freshness', 'real_time',
            'admin_user', 'system_export'
        )
    );

    v_stats_summary := format(
        'ONEMIL STATISTICS EXPORT FOR SOFINITY' || E'\n' ||
        '=====================================' || E'\n' ||
        'Total Users: %s' || E'\n' ||
        'Active Contests: %s' || E'\n' ||
        'Total Tickets: %s' || E'\n' ||
        'Total Revenue: %s' || E'\n' ||
        'Total Vouchers: %s' || E'\n' ||
        'Won Bonuses: %s' || E'\n' ||
        'Export Time: %s' || E'\n' ||
        'Sofinity Payload: %s',
        v_stats_record.total_users,
        v_stats_record.active_contests,
        v_stats_record.total_tickets,
        v_stats_record.total_revenue,
        v_stats_record.total_vouchers,
        v_stats_record.won_bonuses,
        now(),
        v_sofinity_payload::text
    );

    RAISE NOTICE '%', v_stats_summary;
END $$;