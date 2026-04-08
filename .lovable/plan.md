

## Plan: Add `fast_game` visual toggle

### Overview
Add a `fast_game` boolean column to `contests`, expose it as a checkbox in admin form, show a "Fast game" badge on contest cards and detail page. Purely visual — no logic changes.

### Step 1 — Database migration

Create `supabase/migrations/20260408120000_add_fast_game.sql`:

1. `ALTER TABLE contests ADD COLUMN fast_game boolean NOT NULL DEFAULT false;`
2. Update `admin_manage_contest` RPC — add `p_fast_game boolean DEFAULT NULL` parameter. On create: insert value (default false). On update: `COALESCE(p_fast_game, existing.fast_game)`.
3. Update `get_contest_management_data` RPC — add `c.fast_game` to the SELECT list.

### Step 2 — Admin form (`AdminContestManagement.tsx`)

- Add `fast_game: boolean` to `ContestFormData` (line 67) and `fast_game?: boolean` to `ContestData` (line 43).
- Default `false` in both reset branches (lines 179, 197). Initialize from `editingContest.fast_game ?? false` when editing.
- Add checkbox after the Status select (line 1230, inside the `basic` tab):
  ```tsx
  <div className="flex items-center gap-2 mt-2">
    <input type="checkbox" id="fast_game" checked={form.fast_game}
      onChange={e => setForm(f => ({...f, fast_game: e.target.checked}))} />
    <label htmlFor="fast_game" className="text-sm text-white">Fast game</label>
  </div>
  ```
- Pass `p_fast_game: form.fast_game` to the RPC call (line 953).

### Step 3 — Contest Card (`ContestCard.tsx`)

- Add `fast_game?: boolean` to the `Contest` interface (line 10).
- Show badge in the top row (after line 200, next to status badge):
  ```tsx
  {contest.fast_game && (
    <Badge className="bg-amber-500/80 text-white text-[10px] px-2 py-0.5">Fast game</Badge>
  )}
  ```

### Step 4 — Data queries + interfaces

| File | Interface line | Select line | Change |
|------|---------------|-------------|--------|
| `Homepage.tsx` | 29 | 73 | Add `fast_game?: boolean` to interface, add `, fast_game` to select |
| `Games.tsx` | 22 | 85 | Same |
| `FavoriteGames.tsx` | 23 | 129 | Same (nested select) |
| `ContestDetail.tsx` | 27 | 415 | Same |

### Step 5 — Contest Detail badge (`ContestDetail.tsx`)

Show badge next to the title (after line 630):
```tsx
{contest.fast_game && (
  <Badge className="bg-amber-500/80 text-white">Fast game</Badge>
)}
```

### Files changed (7 total, 1 new)
1. `supabase/migrations/20260408120000_add_fast_game.sql` — new migration
2. `src/components/AdminContestManagement.tsx` — checkbox + save + interfaces
3. `src/components/ContestCard.tsx` — badge + interface
4. `src/pages/Homepage.tsx` — query + interface
5. `src/pages/Games.tsx` — query + interface
6. `src/pages/FavoriteGames.tsx` — query + interface
7. `src/pages/ContestDetail.tsx` — query + interface + badge

### What is NOT changed
- No ticket, wallet, winner, or contest close logic
- No new component files
- No layout or text changes beyond checkbox and badge
- No refactoring
- `src/integrations/supabase/types.ts` left untouched

