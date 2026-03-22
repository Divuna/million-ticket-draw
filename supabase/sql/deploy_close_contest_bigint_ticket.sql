-- close_contest: tickets.id is BIGINT. audit_logs.reference_id is UUID - do not store ticket row id there.
-- Ticket pk is stored in metadata.ticket_row_id (jsonb accepts bigint).

CREATE OR REPLACE FUNCTION public.close_contest(p_contest_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $func$
DECLARE
  v_ticket record;
  v_status text;
  v_main_winner_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- AUDIT: admin_action
  INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
  VALUES (
    'admin_action',
    'admin_action',
    auth.uid(),
    p_contest_id,
    jsonb_build_object(
      'reference_id',  p_contest_id,
      'action',        'close_contest',
      'admin_action',  true
    ),
    now()
  );

  SELECT status INTO v_status
  FROM   public.contests
  WHERE  id = p_contest_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;
  IF v_status = 'closed' THEN RETURN; END IF;

  -- Main winner already exists: sync status only
  IF EXISTS (
    SELECT 1 FROM public.winners
    WHERE  contest_id = p_contest_id AND type = 'main'
  ) THEN
    UPDATE public.contests SET status = 'closed' WHERE id = p_contest_id;

    INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
    VALUES (
      'contest_closed',
      'contest_closed',
      auth.uid(),
      p_contest_id,
      jsonb_build_object(
        'reference_id', p_contest_id,
        'source',       'close_contest_sync',
        'admin_action', true
      ),
      now()
    );

    SELECT w.user_id INTO v_main_winner_id
    FROM   public.winners w
    WHERE  w.contest_id = p_contest_id AND w.type = 'main'
    LIMIT  1;

    IF v_main_winner_id IS NOT NULL THEN
      INSERT INTO public.event_logs (event_name, user_id, contest_id, metadata, source_system)
      VALUES (
        'contest_closed',
        v_main_winner_id,
        p_contest_id,
        jsonb_build_object('source', 'close_contest_sync'),
        'onemil'
      );
    END IF;

    RETURN;
  END IF;

  -- Pick a random winning ticket
  SELECT * INTO v_ticket
  FROM   public.tickets
  WHERE  contest_id = p_contest_id
  ORDER  BY random()
  LIMIT  1;

  -- No tickets sold: close with no winner
  IF v_ticket IS NULL THEN
    UPDATE public.contests SET status = 'closed' WHERE id = p_contest_id;

    INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
    VALUES (
      'contest_closed',
      'contest_closed',
      auth.uid(),
      p_contest_id,
      jsonb_build_object(
        'reference_id', p_contest_id,
        'source',       'close_contest_no_tickets',
        'admin_action', true
      ),
      now()
    );

    INSERT INTO public.event_logs (event_name, user_id, contest_id, metadata, source_system)
    VALUES (
      'contest_closed',
      auth.uid(),
      p_contest_id,
      jsonb_build_object('source', 'close_contest_no_tickets'),
      'onemil'
    );

    RETURN;
  END IF;

  -- Insert main winner
  INSERT INTO public.winners (contest_id, user_id, ticket_id, type, created_at)
  VALUES (p_contest_id, v_ticket.user_id, v_ticket.id, 'main', now());

  -- AUDIT: winner_created — reference_id stays NULL; ticket_row_id is BIGINT in metadata
  INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
  VALUES (
    'winner_created',
    'winner_created',
    v_ticket.user_id,
    NULL,
    jsonb_build_object(
      'ticket_row_id', v_ticket.id,
      'contest_id',    p_contest_id,
      'ticket_number', v_ticket.number,
      'type',          'main',
      'admin_action',  true
    ),
    now()
  );

  INSERT INTO public.event_logs (event_name, user_id, contest_id, metadata, source_system)
  VALUES (
    'prize_won',
    v_ticket.user_id,
    p_contest_id,
    jsonb_build_object(
      'notes',         'Hlavni vyhra',
      'type',          'main',
      'ticket_number', v_ticket.number,
      'ticket_row_id', v_ticket.id,
      'source',        'close_contest'
    ),
    'onemil'
  );

  UPDATE public.contests SET status = 'closed' WHERE id = p_contest_id;

  -- AUDIT: contest_closed
  INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
  VALUES (
    'contest_closed',
    'contest_closed',
    auth.uid(),
    p_contest_id,
    jsonb_build_object(
      'reference_id',      p_contest_id,
      'winner_user_id',    v_ticket.user_id,
      'winner_ticket_id',  v_ticket.id,
      'source',            'close_contest',
      'admin_action',      true
    ),
    now()
  );

  INSERT INTO public.event_logs (event_name, user_id, contest_id, metadata, source_system)
  VALUES (
    'contest_closed',
    v_ticket.user_id,
    p_contest_id,
    jsonb_build_object(
      'source',            'close_contest',
      'winner_ticket_id',  v_ticket.id
    ),
    'onemil'
  );
END;
$func$;
