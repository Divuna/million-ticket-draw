-- Security Fix: Enable RLS and Fix Function Search Paths
-- Address critical security warnings from linter

-- ============================================================================
-- ENABLE RLS ON TABLES MISSING ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on event_logs table if not enabled
ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for event_logs - admin access only
CREATE POLICY "Admin access to event logs"
ON public.event_logs
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'superadmin')
  )
);

-- Enable RLS on prizes table if not enabled  
ALTER TABLE public.prizes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for prizes table
CREATE POLICY "Users can view prizes for their contests"
ON public.prizes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.contest_id = prizes.contest_id
    AND t.user_id = auth.uid()
  ) OR 
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'superadmin')
  )
);

CREATE POLICY "Admins can manage prizes"
ON public.prizes
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'superadmin')
  )
);

-- ============================================================================
-- FIX FUNCTION SEARCH PATHS FOR SECURITY
-- ============================================================================

-- Fix search_path for existing functions that don't have it set
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_default_contest_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.status IS NULL THEN
    NEW.status := 'active';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_contest_on_million_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_contest_id uuid;
BEGIN
    -- zkontroluj, zda je to ticket #1 000 000
    IF new.number = 1000000 THEN
        v_contest_id := new.contest_id;

        -- update contest status → closed
        UPDATE contests
        SET status = 'closed'
        WHERE id = v_contest_id;

        -- zapiš audit log
        INSERT INTO audit_logs(event, user_id, metadata, created_at)
        VALUES (
            'contest_closed',
            new.user_id,
            jsonb_build_object('contest_id', v_contest_id, 'ticket_number', new.number),
            now()
        );

        -- odešli event do Sofinity
        PERFORM notify_sofinity_event(
            'contest_closed',
            new.user_id,
            v_contest_id,
            jsonb_build_object('ticket_number', new.number)
        );
    END IF;

    RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_send_event_to_sofinity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_event_name text;
    v_metadata jsonb;
BEGIN
    -- logika podle tabulek (tickets, prizes, contests) ...
    -- ...

    IF v_event_name IS NOT NULL THEN
        PERFORM net.http_post(
            'https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/send_event_to_sofinity',
            jsonb_build_object(
                'Content-Type', 'application/json'
            ),
            jsonb_build_object(
                'project_id', 'defababe-004b-4c63-9ff1-311540b0a3c9',
                'event_name', v_event_name,
                'user_id', coalesce(NEW.user_id, OLD.user_id),
                'contest_id', coalesce(NEW.contest_id, OLD.contest_id, NEW.id),
                'metadata', v_metadata,
                'timestamp', now()
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_check_bonus_prize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_bonus bonus_prizes%rowtype;
BEGIN
  SELECT * INTO v_bonus
  FROM bonus_prizes
  WHERE contest_id = new.contest_id
    AND ticket_position = new.number
    AND status = 'pending'
  LIMIT 1;

  IF found THEN
    INSERT INTO winners (contest_id, prize_id, user_id, type, notes)
    VALUES (new.contest_id, v_bonus.id, new.user_id, 'bonus',
            format('Bonus prize for ticket #%s', new.number));

    UPDATE bonus_prizes SET status = 'won'
    WHERE id = v_bonus.id;
  END IF;

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_close_contest(p_contest uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_last_ticket tickets%rowtype;
BEGIN
  SELECT * INTO v_last_ticket
  FROM tickets
  WHERE contest_id = p_contest
  ORDER BY number DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE NOTICE 'No tickets sold for contest %', p_contest;
    UPDATE contests SET status = 'closed' WHERE id = p_contest;
    RETURN;
  END IF;

  -- Create main winner if not already created
  IF v_last_ticket.number = (SELECT ticket_count FROM contests WHERE id = p_contest) THEN
    INSERT INTO winners (contest_id, user_id, type, notes)
    VALUES (p_contest, v_last_ticket.user_id, 'main',
            format('Main prize for ticket #%s', v_last_ticket.number));
  END IF;

  UPDATE contests SET status = 'closed' WHERE id = p_contest;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_audit_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO audit_logs(event, user_id, metadata, created_at)
  VALUES (
    TG_OP, -- INSERT / UPDATE / DELETE
    coalesce(new.id, old.id), -- vezme user_id podle operace
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'old', to_jsonb(old),
      'new', to_jsonb(new)
    ),
    now()
  );
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_wallet_after_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only process payments with 'completed' status
  IF new.status = 'completed' THEN
    -- Create or update wallet for the user
    INSERT INTO public.wallets (user_id, balance_coins, balance_vouchers, created_at)
    VALUES (
      new.user_id,
      new.amount,
      new.amount,
      now()
    )
    ON CONFLICT (user_id) DO UPDATE
      SET balance_coins = wallets.balance_coins + new.amount,
          balance_vouchers = wallets.balance_vouchers + new.amount;
  END IF;

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, created_at)
  VALUES (new.id, new.email, coalesce(new.raw_user_meta_data->>'name',''), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.wallets (user_id) VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_notification_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM notify_sofinity_event(
    'notification_sent',
    NEW.user_id,
    NULL,
    jsonb_build_object(
      'notification_id', NEW.id,
      'type', NEW.type,
      'title', NEW.title,
      'message', NEW.message,
      'sent_at', NEW.created_at
    )
  );
  RETURN NEW;
END;
$$;