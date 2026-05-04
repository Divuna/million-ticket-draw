## Problém

`buy_ticket_atomic` stále padá s `57014 statement timeout` (8 s). Předchozí migrace `20260504_fix_nonblocking_sofinity_triggers.sql` opravila `trigger_sofinity_forward` a `process_event_queue_trigger`, ale v trigger řetězci, který se spouští během INSERTU tiketu / winners / notifications, **zůstávají dva další synchronní `net.http_post`**, které visí na pg_net workerech a překračují timeout.

## Identifikované zbývající blokátory

Audit `pg_proc` (funkce volané triggery na `tickets`, `winners`, `notifications`):

1. **`trigger_notification_sent()`** — trigger `trigger_notification_sent` na `notifications` (AFTER INSERT).
   - Volá synchronně `net.http_post('…/sofinity-event', …)` přímo v transakci.
   - Trigger řetězec během nákupu: `tickets INSERT` → bonus pozice → `winners INSERT` → `notify_winner` → `event_logs INSERT` → `enqueue_notifications_from_event_logs` → `notifications INSERT` → **`trigger_notification_sent` → net.http_post** ⛔

2. **`call_event_forward_log_listener()`** — pokud někde v chainu vznikne řádek v `event_forward_log`, volá `net.http_post('…/event_forward_log_listener', …, timeout 5000)` přímo v transakci. Stejné riziko 5–10 s blokace.

Obě funkce jsou poslední dva přímé `net.http_post` v transakční cestě nákupu (ostatní funkce s `net.http_post` — `forward_event_to_sofinity`, `process_event_queue_message`, `send_push_via_onesignal`, `proxy_post_to_onesignal` atd. — buď nejsou připojené triggerem na tabulky dotčené nákupem, nebo už byly odpojeny).

## Návrh opravy (1 migrace, žádné schema změny)

### Co se mění

Pouze tělo dvou trigger funkcí — **bez** drop, bez nových tabulek, bez nových sloupců, bez RLS změn, bez změn `buy_ticket_atomic`, bez změn ekonomiky.

**A. `trigger_notification_sent()`**
- Ponechá zápis `audit_logs('notification_sent', …)`.
- `net.http_post` nahradí `INSERT INTO public.event_queue(event_name='notification_sent', …)`. Tu už dnes čte polling edge function, takže Sofinity dostane stejný payload, jen asynchronně.
- Vše obalí `BEGIN/EXCEPTION WHEN OTHERS THEN RAISE LOG; RETURN NEW;` — nikdy neblokuje caller.

**B. `call_event_forward_log_listener()`**
- `net.http_post` nahradí `INSERT INTO public.event_queue(event_name='event_forward_log_listener', metadata=jsonb_build_object('id', NEW.id), …)`.
- Stejný non-blocking exception handler.

### Co se NEMĚNÍ

- `buy_ticket_atomic`, `assign_partner_offer_to_ticket`
- `tickets`, `winners`, `wallets`, `event_logs`, `event_queue`, `notifications`, `audit_logs` (žádný DDL)
- RLS policies, granty
- Ekonomika (cena tiketu, MioCoin, výherci, bonusy)
- Polling edge funkce (`send_event_to_sofinity`, `event_forward_log_listener`) — payload v `event_queue` má všechny potřebné fieldy
- Push pipeline (`notifications` → `push_log` → OneSignal) — `trigger_send_push_from_notifications` zůstává beze změny, OneSignal call je tam přes `send_push_via_onesignal`, který má svou vlastní non-blocking obálku

### Reverzibilita

Migrace v hlavičce uvádí přesné předchozí znění obou funkcí pro snadný rollback (analogicky jako `20260504_fix_nonblocking_sofinity_triggers.sql`).

## Ověření po nasazení

1. Zkusit nákup tiketu jako uživatel v `/contest/3a5ce8cd-…` → očekáváme 200 < 1 s.
2. `SELECT count(*), status FROM event_queue WHERE event_name IN ('notification_sent','event_forward_log_listener') GROUP BY status;` — řádky se objevují jako `pending` a polling worker je odbavuje.
3. `audit_logs` stále obsahuje `notification_sent` záznamy (stejné jako dnes).

## Soubor migrace

`supabase/migrations/20260504_fix_remaining_blocking_http_in_ticket_chain.sql` — jediná SQL migrace, dvě `CREATE OR REPLACE FUNCTION`, žádné `DROP`, žádné `ALTER TABLE`.
