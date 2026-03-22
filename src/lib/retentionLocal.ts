/** Client-side retention helpers — no contest/ticket numbers exposed in messaging. */

export const LS_LAST_VISIT = 'onemil_last_visit_ts';
export const LS_LAST_TICKET = 'onemil_last_ticket_ts';
export const LS_RETENTION_NOTIF_DAY = 'onemil_retention_push_day';
export const LS_IDLE_TOAST_DAY = 'onemil_idle_coins_toast_day';

export function toLocalYmd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Call after any successful ticket purchase (win or loss). */
export function recordLocalTicketPlay(): void {
  try {
    localStorage.setItem(LS_LAST_TICKET, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function peekLastVisitTs(): number {
  try {
    const raw = localStorage.getItem(LS_LAST_VISIT);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/** Call once per app session (login) after reading peek for 24h-away checks. */
export function writeVisitNow(): void {
  try {
    localStorage.setItem(LS_LAST_VISIT, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function getLastTicketPlayTs(): number {
  try {
    const raw = localStorage.getItem(LS_LAST_TICKET);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export function wasRetentionPushSentToday(): boolean {
  try {
    return localStorage.getItem(LS_RETENTION_NOTIF_DAY) === toLocalYmd();
  } catch {
    return false;
  }
}

export function markRetentionPushSentToday(): void {
  try {
    localStorage.setItem(LS_RETENTION_NOTIF_DAY, toLocalYmd());
  } catch {
    /* ignore */
  }
}

export function wasIdleCoinsToastToday(): boolean {
  try {
    return localStorage.getItem(LS_IDLE_TOAST_DAY) === toLocalYmd();
  } catch {
    return false;
  }
}

export function markIdleCoinsToastToday(): void {
  try {
    localStorage.setItem(LS_IDLE_TOAST_DAY, toLocalYmd());
  } catch {
    /* ignore */
  }
}

export const ALMOST_WIN_MESSAGES: string[] = [
  'Skoro! Štěstí bylo nablízko — jeden další pokus může vše změnit.',
  'Ten tiket byl fakt blízko — zkus to ještě jednou!',
  'Jsi v tom! Odměna může padnout kdykoliv — nekonči teď.',
  'Fakt dobrý pokus — další kolo může být tvoje.',
  'Drž se — štěstí se otáčí, zkus to znovu.',
];

export function pickRandomAlmostWinMessage(): string {
  const i = Math.floor(Math.random() * ALMOST_WIN_MESSAGES.length);
  return ALMOST_WIN_MESSAGES[i] ?? ALMOST_WIN_MESSAGES[0];
}

/** ~10–15 % chance per loss (random threshold in band) — call only on non-win outcomes. */
export function rollAlmostWinEffect(): boolean {
  const p = 0.1 + Math.random() * 0.05;
  return Math.random() < p;
}
