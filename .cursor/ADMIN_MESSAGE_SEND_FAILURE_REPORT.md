# Admin Message Send Failure – Root Cause Report

**Error:** "Chyba – Zprávu nelze odeslat"  
**Date:** 2025-03-15

---

## 1. Insert Query: **PASS**

The insert in `AdminMessageThread.tsx` (lines 128–138) is correctly formed:

```ts
await supabase.from("messages").insert({
  user_id: userId,
  sender: "admin",
  content: newMessage.trim(),
  read: false,
  topic: "support",
  extension: "onemil",
  payload: {},
  event: "admin_reply",
  private: false,
});
```

- All required columns from `types.ts` are present.
- `userId` comes from `useParams()` (URL `/admin/messages/:userId`).
- No obvious syntax or payload issues.

---

## 2. Messages Table Structure

**Actual schema** (from `types.ts` and migrations):

| Column      | Type    | Notes                          |
|------------|---------|--------------------------------|
| id         | uuid    | Auto-generated                 |
| user_id    | string  | Recipient when admin sends     |
| sender     | string  | "admin" or "user"              |
| content    | string  | Message text                   |
| created_at | string  | Timestamp                      |
| read       | boolean | Default false                  |
| topic      | text    | "support"                      |
| extension  | text    | "onemil"                       |
| payload    | jsonb   | {}                             |
| event      | text    | "admin_reply"                  |
| private    | boolean | false                          |

**Note:** The schema uses `user_id` (recipient), not `sender_id`/`receiver_id`.

**Foreign key:** No `messages.user_id` FK is defined in migrations. The `forward_user_message_to_sofinity` trigger uses `public.users` for `NEW.user_id`, so the app assumes `user_id` references `public.users.id`. If a DB-level FK exists (e.g. to `auth.users`), it was likely created outside migrations.

---

## 3. Receiver Exists: **UNKNOWN (likely issue)**

- `userId` is taken from the URL, which is built from the conversations list.
- The list is built from `messages.user_id` values.
- If a user was removed from `auth.users` but still has rows in `messages`, their `user_id` can appear in the list.
- Inserting with that `user_id` can fail if:
  - `messages.user_id` has an FK to `auth.users(id)` → FK violation.
  - `messages.user_id` has an FK to `public.users(id)` and the user was removed from `users` → FK violation.

**Check:** Ensure `userId` exists in both `auth.users` and `public.users` before sending.

---

## 4. RLS Policy: **PASS** (with caveat)

Two INSERT policies apply to admins:

**Policy 1 – "Admins can send messages to users"** (`20251118162957`):

```sql
WITH CHECK (
  sender = 'admin'
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'superadmin')
  )
);
```

- Checks that the current user is admin via `public.users`.
- Does not check `user_id` (receiver).

**Policy 2 – "Admins can reply to any thread"** (`20251115221737`):

```sql
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'superadmin')
  )
);
```

- Checks admin via `user_roles`.
- Does not check `user_id`.

For INSERT, PostgreSQL RLS allows the operation if at least one policy passes. If the admin is in `users` or `user_roles`, RLS should allow the insert. RLS is therefore unlikely to be the direct cause.

---

## 5. Supabase Error: **NOT CAPTURED**

The UI only shows a generic toast. The Supabase error object is not logged or surfaced.

**How to capture the exact error:**

1. **Browser console:** Add `console.error(error)` in the `if (error)` block in `AdminMessageThread.tsx` (around line 141), then reproduce and check the console.
2. **Network tab:** In DevTools → Network, find the failing `messages` POST request and inspect the response body.

---

## 6. Trigger – Not the cause for admin sends

`forward_user_message_to_sofinity` runs on INSERT but returns early for admin messages:

```sql
IF NEW.sender <> 'user' THEN
  RETURN NEW;
END IF;
```

Admin sends use `sender = 'admin'`, so the trigger exits before any logic that could fail.

---

## Summary

| Check           | Result   |
|----------------|----------|
| Insert Query   | PASS     |
| Receiver Exists| UNKNOWN (likely issue) |
| RLS Policy    | PASS     |
| Supabase Error| NOT CAPTURED |

**Most likely cause:** Foreign key violation on `messages.user_id` when the receiver no longer exists in `auth.users` or `public.users`.

**Next step:** Capture the exact Supabase error (via `console.error` or Network tab) and confirm whether it is a foreign key violation or another error type.
