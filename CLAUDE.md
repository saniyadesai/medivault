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

> ⚠️ **This branch is a design sample, not a feature branch.** Only the Patient
> dashboard's Overview tab has been rebuilt, and even there Health Vitals and
> Upcoming Appointments are hardcoded sample data with no backend behind them.
> Nothing here is production-ready or merged into `main`. See "Current build
> status" below for the precise done/not-done line.

The dashboard UI (`src/pages/dashboard/*.jsx`, `src/components/dashboard/*.jsx` — currently plain JS/JSX, table-and-nav-list style) is being redesigned from scratch. Work is happening **incrementally, piece by piece** — not as one big rewrite — per user preference.

**Live mockup / design canvas:** https://claude.ai/artifact/Foowa1tdp3BCRe4Cy5sMeV
(Claude Design canvas — the chosen direction is fully interactive; two earlier alternate directions are kept alongside for comparison, not to be deleted without asking.)

### Chosen direction

"Raycast interaction language × healthcare UX rules." Built from two references the user specifically liked:
- **Raycast** (shadcn.io/design/raycast): originally targeted zero drop shadows (depth via a surface ladder instead), hairline 1px borders, Inter font with the `ss03` stylistic set (single-story "g"), restrained/functional layout, one command-bar-style search element. **What actually got built deviates on depth** — see Color system below.
- **Fuselab Creative's healthcare UX article**: red reserved strictly for genuine clinical emergencies — never routine status; green only for normal-range values; blue for trust/informational; tabular figures for vitals/numbers; AI answers should cite their source ("reasoning transparency").

There is no well-known public healthcare dashboard that's both polished and interaction-rich, so the approach is: borrow interaction language from top SaaS products (Linear, Notion, Vercel, Sentry, Mercury/Ramp) and apply it to healthcare-specific content — not copy an existing health app.

### Color system

> **Corrected 2026-09-23.** This section originally documented an amber/copper
> accent (`#E0902E`) as chosen. That was true as of 2026-09-14, but color
> exploration continued afterward (screenshots `palette-sage`, `v3-1/2`,
> `plum-final-*` in `.claude/skills/run-medivault/shots/`, dated 2026-09-17
> through 2026-09-19) and **plum/berry is what actually got built** into
> `src/theme/theme.css` and shipped in the 2026-09-20 commit — amber never
> made it into code. This doc just wasn't updated at the time to reflect that
> pivot. Verified live via `run-medivault` on 2026-09-23: the running app is
> plum/berry with soft card shadows, matching `plum-final-light/dark.png`
> exactly, not the amber/flat-hairline description below that used to be here.

Brand accent: **plum/berry**.
- Core accent: `#a8447f` (light theme) / `#d1689e` (dark theme)
- Text-on-surface variant: `#742959` (light) / `#e6a0c4` (dark)
- Ink on filled accent surfaces: `#ffffff` (light) / `#2b0f20` (dark)
- Canvas has a faint plum tint (`#fbf3f8` light / `#1f0f1a` dark), not neutral gray/white.

Depth uses **soft box-shadows** on cards (`--mv-shadow-card`, `--mv-shadow-toast` in `theme.css`), not the flat hairline-only depth Raycast was originally cited for — a deliberate-looking deviation from the reference, not documented as a conscious choice anywhere, so treat it as the current baseline unless the user says otherwise.

Runs through sidebar active state, avatars, primary buttons, AI assistant accents, icon strokes, and hover states — in **both light and dark mode from one CSS-custom-property token set** (`[data-mv-theme='light']` / `[data-mv-theme='dark']` in `theme.css`), not two separate builds. `prefers-color-scheme` fallback exists; theme switch is instant (no crossfade — a deliberate change from an earlier ~150–200ms crossfade plan, see the comment in `theme.css`: animating that many nodes on toggle was expensive and looked glitchy).

Status colors are kept semantically separate from the brand hue — this matters, don't blur it:
- **Green** = normal/positive vitals only
- **Blue** = informational / pending / unread
- **Red** = emergency action only — never decorative, never routine status

### Interactions (decided via explicit user choice)

Adopted: hover-reveal row actions (Notion/Linear-style — actions appear on row hover, not always visible), animated status changes + toast confirmations (e.g. marking a document verified, marking a notification read), a working light/dark theme toggle.

**Updated 2026-09-24:** search is now functional (see below) — the `⌘K` hint is no longer inert, it actually focuses the search input. The "declined command palette" note above is stale; the user explicitly asked to make search real, so this was built, not a scope violation.

### Current build status (branch: `dashboard-redesign-ts`)

Work lives on the **`dashboard-redesign-ts`** git branch — never merged into `main`, and `main` must not be touched by this work (explicit user instruction from earlier in the project). To resume: `git checkout dashboard-redesign-ts`.

New TypeScript dashboard code lives in **`src/dashboard-v2/`**:
- `DashboardShell.tsx` — the sidebar + topbar shell: collapsible sidebar (expand toggle always visible and inline, not hover-only), 3-column grid topbar with a genuinely centered, **functional** search bar (filters documents/access requests/audit events/notifications already loaded on the dashboard; `⌘K` focuses it; selecting a document opens it, other categories jump to that tab), theme toggle, notification bell, and a profile dropdown on the avatar (name/email + Logout, closes on outside click/Escape).
- `PatientOverview.tsx` — the Overview tab: metrics row (real data), Health Vitals + Upcoming Appointments (still **"SAMPLE DATA"**, no backend for these yet), Recent Documents, Recent Activity, Quick Actions, AI Assistant mini-widget (badged "RAG").
- `StorageVault.tsx`, `AccessRequests.tsx`, `AuditLogView.tsx`, `NotificationsPanel.tsx`, `SettingsPanel.tsx` — the other six Patient tabs, all ported to the same card/row/hover-reveal-action visual language as Overview (see "What's done" below).
- `AiAssistantCard.tsx`, `ToastStack.tsx` / `useToast.ts`, `icons.tsx` (hand-built icon set, not a library), `types.ts` (typed shapes for dashboard data, including `SearchResultItem`).
- Theme system in **`src/theme/`**: `theme.css` (token set) + `useTheme.ts` (light/dark toggle, `prefers-color-scheme` fallback; theme switch is instant, no crossfade — see Color system above). Light theme's main canvas has a subtle gradient echoing the sidebar's treatment; dark theme is untouched/flat, left alone on request.
- `PatientDashboardPage.tsx` composes `DashboardShell` + all seven tab components.

**What's done:** the entire Patient dashboard is now on the new plum/berry design system — Overview, Storage Vault, Access Requests, Audit Log, Notifications, Settings, and AI Chat. AI Chat is a special case: `components/chat/ChatPanel.jsx`'s logic (session management, SSE streaming, citations) was left **completely untouched** — only re-skinned via `.mv-chat`-scoped CSS in `dashboard-v2.css` overriding its existing classnames with `--mv-*` tokens instead of the old marketing-site ones. `DocumentViewer.jsx` and `AISummaryModal.jsx` (opened from Storage Vault) are also untouched — they still depend on `components/dashboard/dashboard.css`, which `PatientDashboardPage.tsx` still imports for exactly that reason (don't remove it without giving those two their own stylesheet first).

Verified end-to-end against the real backend on 2026-09-24: registered a fresh patient + doctor, uploaded a real document, submitted and approved an access request (toast + pill turned green), sent a real AI chat message and got a cited RAG answer, toggled a notification switch, filtered Storage Vault by type, checked dark theme. Zero console/page errors. Along the way, found and fixed a real pre-existing bug: migration `0008_grants_unique_document_grantee.sql` had never been applied to the local DB, so every access-request approval 500'd ("no unique or exclusion constraint matching the ON CONFLICT specification") — applied it directly (file was already committed, just hadn't been run locally).

**What's still old:** the Doctor and Hospital dashboards (`DoctorDashboardPage.jsx`, `HospitalDashboardPage.jsx`) are completely untouched — still the original blue/navy design, not nested in the new shell at all.

**Earlier design exploration** (before the shell above was settled on) is preserved as screenshots in `.claude/skills/run-medivault/shots/`: sidebar layout options (`sidebar-A-*` collapsed/expanded, `sidebar-B-floating`, `sidebar-C-grouped`, `sidebar-D-bold-*`), button styling passes (`sidebar-buttons-fixed/hover`), and full-page palette/layout variants (`palette-sage`, `plum-final-light/dark`, `v3-1-light`, `v3-2-dark`). **`plum-final-light/dark.png` is the closest match to what actually shipped** — see the Color system correction note above; despite the naming, "amber/copper" was never what got built.

**User feedback, 2026-09-23 → resolved 2026-09-24:** user walked through specific Overview-tab issues before allowing further migration (as flagged below) — all addressed in the `DashboardShell.tsx` changes described above (sidebar toggle, search, profile dropdown, topbar centering, light-theme gradient). Once confirmed, user explicitly asked to migrate every remaining Patient tab, which is now done (see "What's done" above). The historical record of what was raised and fixed:
- Collapsed sidebar's expand button was invisible until hover and floated outside the sidebar bounds when it did appear → now always visible, inline, part of the icon rail.
- Topbar search wasn't centered (flex + max-width left asymmetric whitespace) → 3-column grid, genuinely centered.
- No way to reach account actions from the topbar → added the profile dropdown.
- Search was inert (⌘K hint went nowhere) → made functional, scoped to client-side filtering over already-loaded dashboard data (no new backend endpoint).
- Sidebar's gradient look asked about for the main canvas too, light theme only, confirmed not to touch dark theme (user explicitly said dark "looks really good" as-is) → added, scoped via `[data-mv-theme='light']`.

### Next steps

- Doctor and Hospital dashboards (`DoctorDashboardPage.jsx`, `HospitalDashboardPage.jsx`) are the only pieces left on the original design — likely next target, in the same incremental style, following the same `dashboard-v2` component patterns established for Patient.
- Wire Health Vitals and Upcoming Appointments to real data once there's a real data source for them (currently no vitals/appointments backend exists at all — this is new scope, not just a frontend wiring task).
- Audit Log currently displays raw JSON in the description field for some event types (e.g. `{"scope":"all_documents","reason":"..."}` for `share_document`, `{"filename":"...","size":...}` for `upload`) — pre-existing behavior from `dashboardApi`/the server's audit formatting, not something the `AuditLogView.tsx` port introduced or fixed. Worth cleaning up if the user asks.
- Component structure, typed data shapes for `dashboardApi` / `vaultApi` service responses, continuing to extend `dashboard-v2/types.ts` as more of the dashboard is ported.
- Continue refining section by section as directed — confirm scope before large rewrites, and always confirm before merging any of this into `main`.
