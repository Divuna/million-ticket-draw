# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before Starting Any Task

Always read these files first — they are the source of truth for current system state, known bugs, and next steps:
- `onemil_state.md` — current system state (treat as authoritative, ignore `state.md`)
- `onemil_history.md` — project timeline and context

For schema/architecture context: `.cursor/SYSTEM_MAP.md` and `.cursor/PROJECT_CONTEXT.md`

## Commands

```sh
npm run dev              # Start Vite dev server (localhost:5173)
npm run build            # Production build
npm run lint             # ESLint validation
npm run functions:serve  # Serve Supabase Edge Functions locally
npm run deploy:ai        # Deploy ai-chat Edge Function to production
npm run e2e:full         # Full E2E test suite
npm run test:concurrency # Race condition tests
```

## Architecture

**OneMil** is a global lottery/contest platform (React 18 + TypeScript + Vite, hosted via Lovable/Vercel).

**Core flow:** voucher purchase (Stripe) → wallet credit (MioCoin) → ticket purchase (`buy_ticket_atomic` RPC) → contest close at 1,000,000 tickets → winner distribution → prize delivery

**Backend:** Supabase (Postgres + Auth + Realtime + Edge Functions on Deno). 40+ Edge Functions in `supabase/functions/`.

**Event pipelines:**
- Reporting: `event_logs` → `event_queue` → Sofinity (external analytics)
- Push notifications: `notifications` → `push_log` → OneSignal

**Auth & roles:** Supabase Auth with three account types enforced via `useUserRole()`:
- Customers: `/`, `/games`, `/profile`, `/messages`, etc.
- Partners: `/partner/*` only
- Influencers: `/influencer/*` only (strictest isolation — sub-type of partner)
- Admins: `/admin/*`

**State management:** React Query (TanStack v5) for server state; `AuthContext` for auth state; component-level hooks for UI state.

**Key integrations:** Stripe (payments), OneSignal (push), Resend + Sofinity (email/events), OpenAI (AI chat via `ai-chat` Edge Function).

## Database Rules

- Always inspect the schema before writing or suggesting SQL (check `supabase/migrations/` or `.cursor/SYSTEM_MAP.md`).
- Never rename existing tables or columns. Never break RLS policies.
- All SQL is applied manually in the Supabase SQL Editor. Never run `supabase db push` or `db reset` automatically.
- Write SQL changes as migration files into `supabase/migrations/` — do not apply them.

## Actions Requiring User Approval

Do not execute these without explicit user instruction:
- Applying production migrations or any SQL that mutates production data
- Dropping/truncating tables or columns, modifying RLS
- Changing wallet or contest economic rules (ticket cost, prize amounts, contest close conditions)
- Deleting files or running destructive scripts

## Core Logic — Do Not Change Without Explicit Instruction

- `buy_ticket_atomic` RPC and all related ticket/contest logic
- Event pipeline: `event_logs` → `event_queue` → Sofinity
- Push pipeline: `notifications` → `push_log` → OneSignal
- Voucher → MioCoin → ticket economic flow

## Deployment rule
After every file change, always run:
git add -A && git commit -m "fix: <short description of change>" && git push

Never leave changes without pushing to GitHub.
