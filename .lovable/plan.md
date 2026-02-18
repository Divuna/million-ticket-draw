

# Fix: Modal content flickering on open

## Problem
When the modal opens, the user briefly sees the "non-winner" content (funny message + ticket number), then it flashes to "Kontroluji výhru..." loading state, then to the final result. This creates a visible 2-3 frame flicker.

## Root Cause
`isLoading` starts as `false` (line 184). The bonus fetch effect sets it to `true`, but only after the first render has already painted. So the first render shows the wrong content branch (non-winner block at line 556), then the second render shows loading (line 550), then the third shows the actual result.

## Solution
Change `isLoading` default to `true` so the very first render when the modal opens shows the loading state ("Kontroluji vyhru...") instead of incorrect content. Reset it back to `true` (not `false`) when the modal closes, so the next open also starts with loading.

### File: `src/components/TicketResultModal.tsx`

**Change 1** - Line 184: Initialize `isLoading` to `true`
```
- const [isLoading, setIsLoading] = useState(false);
+ const [isLoading, setIsLoading] = useState(true);
```

**Change 2** - Line 228-238 (close cleanup effect): Reset `isLoading` back to `true` when modal closes so next open starts clean
```typescript
useEffect(() => {
  if (!isOpen) {
    generatedForTicketRef.current = null;
    if (previewImageUrl) {
      URL.revokeObjectURL(previewImageUrl);
    }
    setPreviewImageUrl(null);
    setPreviewBlob(null);
    setPublicShareUrl(null);
+   setIsLoading(true);  // Reset so next open starts with loading state
  }
}, [isOpen]);
```

**Change 3** - Line 194-198 (bonus fetch effect early return): When modal is closed or no result, set `isLoading` to false to avoid stale loading state when no data is needed
```typescript
if (!isOpen || !result || !contestId) {
  setBonusPrize(null);
+ setIsLoading(false);
  return;
}
```

## Result
The user will see: "Kontroluji vyhru..." (loading) -> final result. Only one visual transition instead of three. No logic, variable, or structure changes.

## Constraints
- No new files
- No renamed variables
- No logic changes
- No canvas changes
- Only `src/components/TicketResultModal.tsx` modified

