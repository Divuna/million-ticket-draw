-- Restore the missing asynchronous dispatch from push_log to the existing
-- send-push Edge Function. Network I/O is queued by pg_net and starts only
-- after the transaction commits, so ticket/winner transactions never wait for
-- send-push or OneSignal.
--
-- Deployment prerequisite (values are environment-specific and never belong
-- in this migration): Vault must contain `project_url` and
-- `internal_function_token`; the same internal token must be configured as the
-- send-push Edge Function secret `INTERNAL_FUNCTION_TOKEN`.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Keep legacy `error` rows readable, but use `failed` for every new failure.
ALTER TABLE public.push_log
  DROP CONSTRAINT IF EXISTS push_log_status_check;

ALTER TABLE public.push_log
  ADD CONSTRAINT push_log_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'error'));

CREATE OR REPLACE FUNCTION public.enqueue_send_push_edge_request(p_push_log_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_internal_token text;
  v_project_url text;
  v_request_id bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.push_log
    WHERE id = p_push_log_id
      AND status = 'pending'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret
  INTO v_internal_token
  FROM vault.decrypted_secrets
  WHERE name = 'internal_function_token'
  LIMIT 1;

  SELECT decrypted_secret
  INTO v_project_url
  FROM vault.decrypted_secrets
  WHERE name = 'project_url'
  LIMIT 1;

  IF COALESCE(v_internal_token, '') = '' OR COALESCE(v_project_url, '') = '' THEN
    UPDATE public.push_log
    SET status = 'failed',
        sent_at = now(),
        response = jsonb_build_object(
          'ok', false,
          'stage', 'enqueue_configuration',
          'error', 'Missing Vault secret',
          'missing_internal_function_token', COALESCE(v_internal_token, '') = '',
          'missing_project_url', COALESCE(v_project_url, '') = ''
        )
    WHERE id = p_push_log_id
      AND status = 'pending';
    RETURN NULL;
  END IF;

  v_request_id := net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-token', v_internal_token
    ),
    body := jsonb_build_object('push_log_id', p_push_log_id::text),
    timeout_milliseconds := 10000
  );

  UPDATE public.push_log
  SET response = COALESCE(response, '{}'::jsonb) || jsonb_build_object(
    'dispatch_request_id', v_request_id,
    'dispatch_enqueued_at', now()
  )
  WHERE id = p_push_log_id
    AND status = 'pending';

  RETURN v_request_id;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.push_log
  SET status = 'failed',
      sent_at = now(),
      response = jsonb_build_object(
        'ok', false,
        'stage', 'enqueue',
        'error', SQLERRM
      )
  WHERE id = p_push_log_id
    AND status = 'pending';
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_send_push_edge_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_send_push_edge_request(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_send_push_edge_request(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_send_push_edge_request(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_send_push_edge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM public.enqueue_send_push_edge_request(NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Fail closed in the push queue, never propagate into ticket/winner creation.
  UPDATE public.push_log
  SET status = 'failed',
      sent_at = now(),
      response = jsonb_build_object(
        'ok', false,
        'stage', 'trigger',
        'error', SQLERRM
      )
  WHERE id = NEW.id
    AND status = 'pending';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_send_push_edge() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_send_push_edge() FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_send_push_edge() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_send_push_edge() TO service_role;

DROP TRIGGER IF EXISTS trg_push_log_enqueue_send_push_edge ON public.push_log;
CREATE TRIGGER trg_push_log_enqueue_send_push_edge
AFTER INSERT ON public.push_log
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION public.enqueue_send_push_edge();

-- Intentionally no backfill: rows that were already pending before this
-- trigger was created remain untouched. Only future INSERT events are
-- dispatched automatically.
