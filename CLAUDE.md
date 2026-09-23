# CLAUDE.md

Project notes and in-progress decisions for MediVault, kept here so context survives across sessions.

## Stack

- Frontend: React 19 + Vite (plain CSS, no Tailwind/component library — see `src/index.css` for the current marketing-site design tokens)
- Backend: Express API (`server/`)
- AI: chat/RAG over pgvector; vision model `qwen2.5vl:7b`
- Storage: MinIO (S3-compatible), self-hosted in Docker (`docker-compose.yml`, quay.io image) — replaced Appwrite
- AI provider: native Ollama (Metal GPU, already installed) — replaced OpenRouter; configurable via `AI_BASE_URL` / `AI_MODEL` / `AI_API_KEY`
- DB: local PostgreSQL 17 via Homebrew, `medivault` database, all migrations applied

**Why self-hosted:** cost — the user wants everything runnable locally with no paid API keys/services. Prefer local/self-hosted options for any new external dependency; don't suggest paid SaaS without asking.

## Dev environment (this machine)

- Port 5173 is occupied by another local project (`deal-me-in`) — MediVault runs on **5177** instead. Use `/run-medivault` (committed skill) to launch; don't assume 5173 is free.
- Docker is not running by default.
- Claude-in-Chrome extension has been unreliable here — headless Playwright Chromium works instead.
- `.env` points `DATABASE_URL` / `VITE_API_BASE_URL` at localhost. The team previously used a Neon cloud DB the user doesn't control; local Postgres is preferred now.

### After a machine restart, checklist before assuming anything is broken

None of these survive a reboot on their own except Postgres (a brew service). Hit these in order before debugging further — a 2026-09-22 session lost real time chasing "summaries broken" / "unauthorized login" that were actually just these:

1. **Docker Desktop** — not running by default (`open -a Docker`, wait for daemon), then `docker compose up -d` for MinIO. Check: `curl http://localhost:9000/minio/health/live` → `200`.
2. **Ollama** — the app usually relaunches itself, but confirm: `curl http://localhost:11434` → `"Ollama is running"`. First request after a cold start can take 5-60s+ while the vision model (`qwen2.5vl:7b`, ~6GB) loads into memory — don't mistake that for it being down.
3. **Local Postgres** — `brew services start postgresql@17` if not already running. **Check every migration in `db/migrations/` has actually been applied to the local `medivault` DB** — it's easy for a migration applied to production (Neon) to never get run locally, and the failure mode is ugly: e.g. migration 0010 (`patients.gender`) missing locally made every single login fail with a generic `column "gender" does not exist` that surfaced in the UI as "Unauthorized. Please log in." Compare columns directly rather than trusting a migrations-tracking table: `psql -d medivault -Atc "select column_name from information_schema.columns where table_name='patients'"`.
4. **The API server itself** — if it was left running from a previous session (`node server/src/index.js` via `nohup`), kill and restart it (`lsof -ti:3001 -sTCP:LISTEN | xargs kill`) rather than trusting a days-old process — it can be holding dead connections to Docker/Ollama from before the restart, surfacing as `ECONNREFUSED` in `/tmp/medivault-api.log` even once those services are back up.
5. Then Vite on **5177** as usual via `/run-medivault`.

## Dashboard redesign (in progress, TypeScript rebuild planned)

The dashboard UI (`src/pages/dashboard/*.jsx`, `src/components/dashboard/*.jsx` — currently plain JS/JSX, table-and-nav-list style) is being redesigned from scratch. Work is happening **incrementally, piece by piece** — not as one big rewrite — per user preference.

**Live mockup / design canvas:** https://claude.ai/artifact/Foowa1tdp3BCRe4Cy5sMeV
(Claude Design canvas — the chosen direction is fully interactive; two earlier alternate directions are kept alongside for comparison, not to be deleted without asking.)

### Chosen direction

"Raycast interaction language × healthcare UX rules, amber/copper brand theme." Built from two references the user specifically liked:
- **Raycast** (shadcn.io/design/raycast): zero drop shadows (depth via a 4-step surface ladder instead), hairline 1px borders, Inter font with the `ss03` stylistic set (single-story "g"), restrained/functional layout, one command-bar-style search element.
- **Fuselab Creative's healthcare UX article**: red reserved strictly for genuine clinical emergencies — never routine status; green only for normal-range values; blue for trust/informational; tabular figures for vitals/numbers; AI answers should cite their source ("reasoning transparency").

There is no well-known public healthcare dashboard that's both polished and interaction-rich, so the approach is: borrow interaction language from top SaaS products (Linear, Notion, Vercel, Sentry, Mercury/Ramp) and apply it to healthcare-specific content — not copy an existing health app.

### Color system

Brand accent: **amber/copper**, chosen because the user wanted something "very unique" (not the obvious medical blue/green/indigo).
- Core: `#E0902E`
- Text-on-surface variants: `#A85D12` (light theme) / `#F4B25C` (dark theme)
- Ink on filled accent surfaces: `#2B1806`

Runs through sidebar active state, avatars, primary buttons, AI assistant accents, icon strokes, and hover states — in **both light and dark mode from one CSS-custom-property token set** swapped via a class (`.mv-dark` / `.mv-light`), not two separate builds. A `data-theme`-style token approach, `prefers-color-scheme` fallback, ~150–200ms crossfade on toggle.

Status colors are kept semantically separate from the brand hue — this matters, don't blur it:
- **Green** = normal/positive vitals only
- **Blue** = informational / pending / unread
- **Red** = emergency action only — never decorative, never routine status

### Interactions (decided via explicit user choice)

Adopted: hover-reveal row actions (Notion/Linear-style — actions appear on row hover, not always visible), animated status changes + toast confirmations (e.g. marking a document verified, marking a notification read), a working light/dark theme toggle.

Declined: command palette (⌘K). The search bar still shows the `⌘K` hint visually but is **not** wired up — don't build it unless asked.

### Current build status (branch: `dashboard-redesign-ts`)

Work lives on the **`dashboard-redesign-ts`** git branch — never merged into `main`, and `main` must not be touched by this work (explicit user instruction from earlier in the project). To resume: `git checkout dashboard-redesign-ts`.

New TypeScript dashboard code lives in **`src/dashboard-v2/`**:
- `DashboardShell.tsx` — the new sidebar + topbar shell (search bar with inert ⌘K hint, theme toggle, notification bell, avatar).
- `PatientOverview.tsx` — the new Overview tab content: metrics row (Documents/Pending Requests/Active Grants/Audit Events — real data), Health Vitals row (Heart Rate/Blood Pressure/Blood Glucose/Last Checkup — explicitly badged **"SAMPLE DATA"**, not wired to anything real yet), Upcoming Appointments (also **"SAMPLE DATA"**), Recent Documents, Recent Activity, Quick Actions, and an AI Assistant mini-widget (badged "RAG").
- `AiAssistantCard.tsx`, `ToastStack.tsx` / `useToast.ts`, `icons.tsx` (hand-built icon set, not a library), `types.ts` (typed shapes for dashboard data).
- Theme system in **`src/theme/`**: `theme.css` (token set) + `useTheme.ts` (light/dark toggle, ~150–200ms crossfade, `prefers-color-scheme` fallback).
- `PatientDashboardPage.jsx` was renamed to `.tsx` and now composes `DashboardShell` + `PatientOverview` for the Overview tab.

**What's done:** Overview tab for the Patient dashboard only — new shell, new Overview component, real data wired for everything except vitals/appointments (intentionally sample data for now), light/dark theme toggle confirmed working. Verified live via Playwright screenshots: `.claude/skills/run-medivault/shots/v2-1-overview-dark.png` and `v2-2-overview-light.png`.

**What's still old:** every other Patient tab (Storage Vault, Access Requests, Audit Log, AI Chat, Settings, Notifications) still renders with the original `DashboardSection` / `DataTable` / `ActivityFeed` components and old `components/dashboard/dashboard.css`, just now nested inside the new `DashboardShell`. The Doctor and Hospital dashboards (`DoctorDashboardPage.jsx`, `HospitalDashboardPage.jsx`) are completely untouched — still the original design.

**Earlier design exploration** (before the shell above was settled on) is preserved as screenshots in `.claude/skills/run-medivault/shots/`, not necessarily reflecting the final direction — sidebar layout options (`sidebar-A-*` collapsed/expanded, `sidebar-B-floating`, `sidebar-C-grouped`, `sidebar-D-bold-*`), button styling passes (`sidebar-buttons-fixed/hover`), and full-page palette/layout variants (`palette-sage`, `plum-final-light/dark`, `v3-1-light`, `v3-2-dark`). The amber/copper direction described above is what was ultimately chosen and built.

### Next steps

- Rebuild remaining Patient tabs (Storage Vault first is the likely next target), then Doctor and Hospital dashboards, in the same incremental style.
- Wire Health Vitals and Upcoming Appointments to real data once there's a real data source for them (currently no vitals/appointments backend exists at all — this is new scope, not just a frontend wiring task).
- Component structure, typed data shapes for `dashboardApi` / `vaultApi` service responses, continuing to extend `dashboard-v2/types.ts` as more of the dashboard is ported.
- Continue refining section by section as directed — confirm scope before large rewrites, and always confirm before merging any of this into `main`.
