## Plan

I found why the app still shows the old error about minimum 100 tickets.

### What is actually wrong
There are still two older contest-creation paths that use `100`, even though `AdminContestManagement` was already changed to `5`:

1. `src/pages/AdminDashboard.tsx`
   - still validates `ticket_count < 100`
   - still shows the toast text `Počet ticketů musí být platné číslo alespoň 100.`

2. `supabase/functions/create-contest/index.ts`
   - still rejects `ticket_count < 100`
   - still throws `Ticket count must be a finite number >= 100`

I also checked the database constraint on `public.contests`, and it is currently `CHECK (ticket_count >= 1)`, so the database itself is not forcing 100.

## Implementation

Once approved, I will make only these minimal changes:

1. Update `src/pages/AdminDashboard.tsx`
   - change the validation from minimum `100` to minimum `5`
   - change the Czech error message from `alespoň 100` to `alespoň 5`

2. Update `supabase/functions/create-contest/index.ts`
   - change the server-side validation from minimum `100` to minimum `5`
   - update the thrown error message accordingly

3. Verify there are no remaining user-facing or active validation paths still requiring 100 for contest creation
   - specifically re-check all active contest creation flows
   - leave unrelated `100` occurrences untouched

## Technical notes

Files to change:
- `src/pages/AdminDashboard.tsx`
- `supabase/functions/create-contest/index.ts`

Files already correct and not to be changed further:
- `src/components/AdminContestManagement.tsx`

Files not requiring DB changes:
- no migration needed
- no RLS changes needed
- no table changes needed

## Expected result

After the fix:
- contest creation should allow `5` or more tickets
- the old toast saying `alespoň 100` should no longer appear
- both frontend and server validation will be aligned at `5`
- no banner/UI/design changes or unrelated logic changes will be made