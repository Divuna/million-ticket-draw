export const SALES_LEAD_TIME_ZONE = 'Europe/Prague';

export type WorkQueueBucket = 'overdue' | 'today' | 'upcoming';

export const pragueDayKey = (value: string | Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: SALES_LEAD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(typeof value === 'string' ? new Date(value) : value);

export const workQueueBucket = (dueAt: string, now = new Date()): WorkQueueBucket => {
  const due = new Date(dueAt);
  if (pragueDayKey(due) === pragueDayKey(now)) return 'today';
  return due < now ? 'overdue' : 'upcoming';
};
export const completedToday = (completedAt: string | null, now = new Date()): boolean =>
  Boolean(completedAt && pragueDayKey(completedAt) === pragueDayKey(now));

export const toLocalDateTimeInput = (value = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SALES_LEAD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
};
