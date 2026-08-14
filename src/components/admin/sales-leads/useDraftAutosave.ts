/* eslint-disable @typescript-eslint/no-explicit-any -- sales_leads RPC nejsou v generovaných typech */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Tiché automatické ukládání rozepsaného e-mailu.
 *
 * Zásady:
 *  - ukládá až po krátké pauze v psaní (debounce), ne při každé klávese,
 *  - NIKDY nesahá na text v editoru → kurzor se nepřeskakuje
 *    (proto má vlastní stav a nepoužívá `draftSaving`, který zakazuje inputy),
 *  - používá existující pole konceptu (`draft_email_subject/body`) přes RPC
 *    `sales_lead_autosave_draft` — žádný paralelní systém,
 *  - offline záloha v zařízení (localStorage) + synchronizace po obnovení sítě,
 *  - LAST-WRITE-WINS: každému zápisu posílá čas úpravy, takže pomalý starší
 *    požadavek nepřepíše novější text (kontroluje i serverová RPC).
 */

export type DraftAutosaveState = 'idle' | 'saving' | 'saved' | 'offline';

/** Pauza v psaní, po které se koncept uloží. */
export const DRAFT_AUTOSAVE_DELAY_MS = 2500;

export interface LocalDraft {
  subject: string;
  body: string;
  /** Čas úpravy v ms (Date.now()). */
  updatedAt: number;
}

const localKey = (leadId: string) => `onemil_lead_draft_${leadId}`;

/** Přečte místní (offline) zálohu konceptu. */
export function readLocalDraft(leadId: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(localKey(leadId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDraft;
    if (typeof parsed?.updatedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocalDraft(leadId: string, draft: LocalDraft): void {
  try {
    localStorage.setItem(localKey(leadId), JSON.stringify(draft));
  } catch {
    // úložiště může být plné/nedostupné — server zápis tím neblokujeme
  }
}

export function clearLocalDraft(leadId: string): void {
  try {
    localStorage.removeItem(localKey(leadId));
  } catch {
    // ignore
  }
}

interface Options {
  leadId: string | null;
  subject: string;
  body: string;
  /** Autosave běží jen když je editor otevřený a lead načtený. */
  enabled: boolean;
  /** Obnovení seznamu/počtů v rodiči. NESMÍ sahat na text v editoru. */
  onPersisted?: () => void;
}

export function useDraftAutosave({ leadId, subject, body, enabled, onPersisted }: Options) {
  const [state, setState] = useState<DraftAutosaveState>('idle');

  const onPersistedRef = useRef(onPersisted);
  onPersistedRef.current = onPersisted;

  const latestRef = useRef({ subject, body });
  latestRef.current = { subject, body };

  /** Poslední úspěšně uložená verze — brání zbytečným zápisům. */
  const savedRef = useRef<{ subject: string; body: string } | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(async (): Promise<void> => {
    if (!leadId) return;
    const { subject: s, body: b } = latestRef.current;

    if (savedRef.current && savedRef.current.subject === s && savedRef.current.body === b) {
      return; // nic nového
    }
    if (inFlightRef.current) {
      pendingRef.current = true; // doběhne a uloží nejnovější verzi
      return;
    }

    const updatedAt = Date.now();
    // Záloha v zařízení dřív než síťový zápis — přežije i výpadek proudu.
    writeLocalDraft(leadId, { subject: s, body: b, updatedAt });

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setState('offline');
      return;
    }

    inFlightRef.current = true;
    setState('saving');
    try {
      const { data, error } = await (supabase as any).rpc('sales_lead_autosave_draft', {
        p_lead_id: leadId,
        p_subject: s,
        p_body: b,
        p_client_updated_at: new Date(updatedAt).toISOString(),
      });
      if (error) throw new Error(error.message);
      const res = (data ?? {}) as { success?: boolean; stale?: boolean };
      if (!res.success) throw new Error('autosave_failed');

      savedRef.current = { subject: s, body: b };
      clearLocalDraft(leadId);
      setState('saved');
      onPersistedRef.current?.();
    } catch {
      // Text zůstává v localStorage a zkusí se po obnovení připojení.
      setState('offline');
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        void persist();
      }
    }
  }, [leadId]);

  // Debounce — ukládá se až po pauze v psaní.
  useEffect(() => {
    if (!enabled || !leadId) return;
    if (savedRef.current && savedRef.current.subject === subject && savedRef.current.body === body) {
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void persist(); }, DRAFT_AUTOSAVE_DELAY_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [subject, body, enabled, leadId, persist]);

  /** Okamžité uložení — při zavření detailu, přepnutí záložky, opuštění stránky. */
  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!enabled || !leadId) return;
    await persist();
  }, [enabled, leadId, persist]);

  // Po obnovení připojení dosynchronizuj poslední verzi.
  useEffect(() => {
    const onOnline = () => { void persist(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [persist]);

  // Opuštění stránky / skrytí záložky — poslední pokus o uložení.
  useEffect(() => {
    if (!enabled || !leadId) return;
    const onHide = () => { void persist(); };
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [enabled, leadId, persist]);

  /** Po odeslání e-mailu / smazání konceptu — koncept je vyřízený. */
  const reset = useCallback((clearLocal = true) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    savedRef.current = null;
    pendingRef.current = false;
    if (clearLocal && leadId) clearLocalDraft(leadId);
    setState('idle');
  }, [leadId]);

  /** Označí aktuální text za již uložený (např. po ručním uložení konceptu). */
  const markSaved = useCallback((s: string, b: string) => {
    savedRef.current = { subject: s, body: b };
    if (leadId) clearLocalDraft(leadId);
    setState('saved');
  }, [leadId]);

  return { state, flush, reset, markSaved };
}

/** Nenápadný text stavu pro UI. */
export const DRAFT_AUTOSAVE_LABEL: Record<DraftAutosaveState, string> = {
  idle: '',
  saving: 'Ukládám…',
  saved: 'Uloženo',
  offline: 'Bez připojení — změny budou uloženy později',
};
