## Verification
`src/components/AdminContestManagement.tsx` line 1867 sets `CHUNK_SIZE = 500`, used in the chunked MioCoin save loop (lines 1887–1890) between `admin_begin_miocoin_save` and `admin_finalize_miocoin_save`. PR #78 is reflected in main. ✅

## Plan
1. No code changes.
2. Publish the current app to production via the Publish dialog.
