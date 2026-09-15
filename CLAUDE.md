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

### Next steps

- TypeScript rebuild of the dashboard: component structure, typed data shapes for `dashboardApi` / `vaultApi` service responses, wiring the new layout to real patient/doctor/hospital dashboard data (currently mocked in the design canvas).
- Continue refining section by section as directed — confirm scope before large rewrites.
