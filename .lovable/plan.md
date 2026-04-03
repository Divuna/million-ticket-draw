

## Diagnosis: Preview is blank due to lost HMR connection

### What happened
The previous change to `vite.config.ts` caused the Vite dev server to restart. The client (preview iframe) lost its WebSocket connection and is stuck in "Polling for restart..." mode. 

### Evidence
- **Dev server is running fine** — Vite started successfully on port 8080 at 14:12:29
- **TypeScript compiles** — zero errors
- **Vite build succeeds** — full production build completes in 16s
- **Console log**: `[vite] server connection lost. Polling for restart...`
- **Network**: Vite ping requests return 204 (healthy)
- The `vite.config.ts` has `port: 5173` but the sandbox runs on `--port 8080` (overridden by CLI flag). This is harmless but could confuse HMR reconnection.

### Fix Plan

**Step 1: Fix the port in vite.config.ts**
Change `port: 5173` to `port: 8080` to match the actual sandbox port. This eliminates any mismatch that could interfere with HMR reconnection.

```typescript
server: {
  host: true,
  port: 8080,  // was 5173
  hmr: isLovableSandbox
    ? { protocol: "wss", clientPort: 443 }
    : undefined,
},
```

This single change should trigger a server restart and restore the preview connection.

### Why it should work
The sandbox runs `vite --port 8080`, which overrides the config. But having them match avoids any edge cases where the HMR client gets confused about which port to reconnect to. After this change, the server restarts cleanly and the preview iframe should reconnect.

