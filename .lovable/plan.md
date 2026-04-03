
Do I know what the issue is? Yes. At this point it no longer looks like a Vite port/security-header problem. The stronger suspects are:

1. `tsconfig.node.tsbuildinfo` and `tsconfig.app.tsbuildinfo` are generated cache files sitting in the repo root, while `.gitignore` does not ignore `*.tsbuildinfo`. Those files can be rewritten by typecheck/build tooling and trigger repeated preview restarts.
2. `src/hooks/useOneSignal.ts` is mounted globally from `src/App.tsx` and does heavy startup work for logged-in users: unregistering OneSignal service workers, clearing caches/storage, and automatically calling `OneSignal.Notifications.requestPermission()`. That is risky inside the Lovable preview iframe and can make the app briefly load and then become unstable.

What I checked
- `vite.config.ts` is now aligned with Lovable (`port: 8080`, `wss`, `clientPort: 443`).
- I did not find blocking security headers in `vercel.json`; `middleware.ts` does not affect `/`.
- Console logs show only React Router warnings plus repeated `[Admin Realtime] Not admin, skipping subscriptions`, which suggests remount/restart churn rather than one clean fatal crash.
- `.gitignore` currently does not ignore `*.tsbuildinfo`.
- `useOneSignal` contains aggressive browser-reset logic and an automatic permission request on app load.

Plan
1. Stop generated-file restart churn
   - add `*.tsbuildinfo` to `.gitignore`
   - remove `tsconfig.node.tsbuildinfo` and `tsconfig.app.tsbuildinfo` from tracked/project edits
   - treat them as disposable local artifacts only

2. Stabilize startup side effects
   - remove automatic notification permission requests from normal app mount
   - stop clearing OneSignal service workers/caches/storage on every startup
   - keep reset logic only behind an explicit debug/reset action

3. Harden the app shell
   - clean up `src/App.tsx` so app-level hooks stay unconditional and predictable
   - reduce repeated parallel `useUserRole()` fetches across the shell where possible

4. Verify after the fix
   - homepage stays open when logged out
   - homepage stays open when logged in
   - refresh does not restart the preview loop
   - if the issue remains only when logged in, the remaining suspect is the OneSignal path

Files to update
- `.gitignore`
- `src/App.tsx`
- `src/hooks/useOneSignal.ts`

Technical detail
```text
Most likely current loop

tool/typecheck rewrites *.tsbuildinfo
-> Lovable detects project file changes
-> preview/dev process restarts
-> iframe reloads again

and/or for signed-in users

AppContent mounts
-> useOneSignal runs globally
-> clears SW/cache/storage + requests permission
-> preview becomes unstable
-> page loads briefly, then falls again
```

Expected result
- preview stops endlessly loading/falling
- editor becomes usable again
- notifications remain possible, but only after explicit user action
