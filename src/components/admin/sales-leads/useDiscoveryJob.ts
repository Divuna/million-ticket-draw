/*
 * eslint-disable @typescript-eslint/no-explicit-any
 *
 * `sales_lead_discovery_jobs` ani její RPC nejsou v generovaných Supabase
 * typech (`src/integrations/supabase/types.ts`), proto stejně jako ve zbytku
 * sales-leads modulu používáme `(supabase as any)`. Řádky si typujeme sami
 * přes `DiscoveryJobRow` níže.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Stav běžící discovery úlohy („Najít nové firmy") žije NAD dialogem, aby
 * zavření okna nezastavilo sledování.
 *
 * Zdrojem pravdy je EXISTUJÍCÍ tabulka `sales_lead_discovery_jobs` — žádný
 * paralelní systém. Při načtení stránky se dohledá poslední úloha aktuálního
 * administrátora (`created_by = auth.uid()`); pokud běží, sledování se obnoví.
 * Díky tomu stav přežije zavření dialogu, přepnutí záložky i refresh stránky.
 */

export type DiscoveryJobStatus = 'queued' | 'running' | 'done' | 'stopped' | 'failed';

export interface DiscoveryJobRow {
  id: string;
  status: DiscoveryJobStatus;
  lead_group: string;
  requested_count: number;
  candidates_checked: number;
  created_count: number;
  duplicates: number;
  websites_rejected: number;
  wrong_category: number;
  with_ico: number;
  with_dic: number;
  with_address: number;
  with_phone: number;
  finish_reason: string | null;
  error: string | null;
}

const POLL_MS = 3000;
/** Jak dlouho po dokončení zůstane stavový pruh viditelný. */
const DONE_VISIBLE_MS = 12000;

export const isDiscoveryRunning = (status?: string | null): boolean =>
  status === 'queued' || status === 'running';

export const isDiscoveryTerminal = (status?: string | null): boolean =>
  status === 'done' || status === 'stopped' || status === 'failed';

interface Options {
  /** Zavolá se jednou při přechodu úlohy do koncového stavu. */
  onFinished: (job: DiscoveryJobRow) => void;
  /** Zavolá se při každém průběžném ticku (obnovení seznamu a počtů). */
  onProgress: () => void;
}

export function useDiscoveryJob({ onFinished, onProgress }: Options) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<DiscoveryJobRow | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Callbacky v refech — jinak by změna identity restartovala polling.
  const onFinishedRef = useRef(onFinished);
  const onProgressRef = useRef(onProgress);
  onFinishedRef.current = onFinished;
  onProgressRef.current = onProgress;

  /** id úlohy, u které už proběhlo dokončovací hlášení (žádné duplicity). */
  const finishedFor = useRef<string | null>(null);

  // Po načtení stránky obnov sledování poslední BĚŽÍCÍ úlohy tohoto admina.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid || !active) return;
        const { data } = await (supabase as any)
          .from('sales_lead_discovery_jobs')
          .select('*')
          .eq('created_by', uid)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!active || !data) return;
        const row = data as DiscoveryJobRow;
        // Adoptujeme jen běžící úlohu — dokončené staré běhy nemá smysl hlásit.
        if (isDiscoveryRunning(row.status)) {
          setJobId(row.id);
          setJob(row);
          setDismissed(false);
        }
      } catch {
        // best-effort; chybějící tabulka/oprávnění nesmí rozbít stránku
      }
    })();
    return () => { active = false; };
  }, []);

  // Polling běžící úlohy. Po dosažení koncového stavu se zastaví.
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stopTimer = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };

    const tick = async () => {
      const { data } = await (supabase as any)
        .from('sales_lead_discovery_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();
      if (!active || !data) return;
      const row = data as DiscoveryJobRow;
      setJob(row);

      if (isDiscoveryTerminal(row.status)) {
        stopTimer();
        if (finishedFor.current !== row.id) {
          finishedFor.current = row.id;
          onFinishedRef.current(row);
        }
      } else {
        onProgressRef.current();
      }
    };

    void tick();
    timer = setInterval(tick, POLL_MS);
    return () => { active = false; stopTimer(); };
  }, [jobId]);

  // Po dokončení nech pruh chvíli viditelný, pak ho skryj.
  useEffect(() => {
    if (!job || !isDiscoveryTerminal(job.status) || dismissed) return;
    const t = setTimeout(() => setDismissed(true), DONE_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [job, dismissed]);

  const startJob = useCallback(async (leadGroup: string, requestedCount: number) => {
    const { data, error } = await (supabase as any).rpc('sales_lead_discovery_job_create', {
      p_lead_group: leadGroup,
      p_requested_count: requestedCount,
    });
    if (error) throw new Error(error.message);
    const res = (data ?? {}) as { success?: boolean; error?: string; job_id?: string };
    if (!res.success || !res.job_id) return res;
    finishedFor.current = null;
    setJob(null);
    setDismissed(false);
    setJobId(res.job_id);
    return res;
  }, []);

  const stopJob = useCallback(async () => {
    if (!jobId) return;
    try {
      await (supabase as any).rpc('sales_lead_discovery_job_stop', { p_id: jobId });
    } catch {
      // ignore — stav se stejně dotáhne pollingem
    }
  }, [jobId]);

  const dismiss = useCallback(() => setDismissed(true), []);

  const running = isDiscoveryRunning(job?.status);

  return {
    job,
    jobId,
    isRunning: running,
    /** Pruh je vidět, dokud ho uživatel (nebo timeout po dokončení) neschová. */
    showStatusBar: Boolean(job) && !dismissed,
    startJob,
    stopJob,
    dismiss,
  };
}
