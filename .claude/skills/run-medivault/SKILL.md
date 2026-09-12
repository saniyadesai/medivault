---
name: run-medivault
description: Build, run, and drive MediVault (React 19 + Vite frontend, Express API). Use when asked to start MediVault, run the dev server, take a screenshot of its UI, register/login as a patient, doctor, or hospital, or interact with the running app.
---

MediVault is a Vite/React frontend plus an Express API that needs Postgres. Drive it by starting the Vite dev server on port 5177 and running `.claude/skills/run-medivault/driver.mjs`, a Playwright script that registers a user through the built-in mock auth, lands on the role dashboard, and screenshots each step. The API is not required for that path; a verified local-Postgres path for the full stack is below.

All paths are relative to the repo root.

## Prerequisites

- Node 25 was used (`node --version` -> v25.2.1); Node 20+ should be fine.
- A Chromium build for Playwright. Installed into the Playwright cache (macOS: `~/Library/Caches/ms-playwright/`) by the Setup step.
- No Postgres, Appwrite, or API keys are needed for the frontend path.

## Setup

```bash
npm install
git checkout package-lock.json          # see Gotchas: npm install rewrites the lockfile
(cd .claude/skills/run-medivault && npm install && npx playwright install chromium)
```

The skill directory has its own `package.json` so Playwright stays out of the app's dependencies. Its `node_modules/` and `shots/` are gitignored.

Two modes, chosen by `.env` (gitignored):

- **No `.env`, or `VITE_API_BASE_URL` empty** -> `src/services/authApi.js` switches to mock auth (accounts in browser localStorage) and the dashboard services return empty datasets. No backend needed.
- **`VITE_API_BASE_URL=http://localhost:3001`** -> the browser talks to the real Express API, which needs Postgres. See "Run (full stack, local Postgres)".

## Run (agent path)

Start the dev server on 5177 (the port the repo's own `dev:all` script uses; 5173 is Vite's default and is often taken by another project on a dev machine):

```bash
nohup npx vite --port 5177 --strictPort > /tmp/medivault-vite.log 2>&1 &
for i in $(seq 1 60); do curl -sf http://localhost:5177 >/dev/null && break; sleep 0.5; done; curl -sf -o /dev/null http://localhost:5177 && echo ready
```

Drive it:

```bash
node .claude/skills/run-medivault/driver.mjs --role all
```

The driver, per role, visits `/register/<role>`, fills the form (a fake PDF is generated for the hospital's proof upload), submits, waits for `/dashboard/<role>`, screenshots, opens the Storage Vault tab (patient only), clicks Logout, then logs back in at `/login/<role>` with the same mock account. It exits 1 on any failure or any console/page/network error. Expected tail of output:

```
[driver] hospital login round-trip ok: http://localhost:5177/dashboard/hospital
[driver] OK - no console/page/network errors. Screenshots in .claude/skills/run-medivault/shots
```

| flag | default | meaning |
|---|---|---|
| `--role patient\|doctor\|hospital\|all` | `patient` | which registration flow(s) to run |
| `--base URL` | `http://localhost:5177` | dev server origin |
| `--shots DIR` | `.claude/skills/run-medivault/shots` | where PNGs land (`0-landing.png`, `<role>-1-register-filled.png`, `<role>-2-dashboard.png`, `patient-3-storage-vault.png`, `failure.png`) |

Stop the server:

```bash
lsof -ti:5177 -sTCP:LISTEN | xargs kill
```

To extend the driver for a new UI change: form inputs use `id` equal to the form field name (`#fullName`, `#email`, `#licenseNumber`, `#specialization`, `#proof`, ...), and dashboard tabs are plain text in the sidebar, so `page.getByText('Access Requests', { exact: true })` selects them. There is no `<main>` element; use `body` for text probes.

## Run (full stack: local Postgres + MinIO + Ollama)

One-time: install and start PostgreSQL 17, create the database, apply the SQL migrations in order.

```bash
brew install postgresql@17
brew services start postgresql@17
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
createdb medivault
for f in db/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -d medivault -f "$f" || break; done
psql -d medivault -Atc "select tablename from pg_tables where schemaname='public'"   # expect 12 tables
```

Then start the file store (Docker Desktop must be running: `open -a Docker`) and pull the vision model (~6 GB, once):

```bash
docker compose up -d                       # MinIO on :9000, console :9001
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9000/minio/health/live   # 200
ollama pull qwen2.5vl:7b                   # native Ollama app must be running (curl localhost:11434 -> "Ollama is running")
```

Write `.env` (copy `.env.example`; its defaults already match docker-compose.yml and Ollama). The values that matter:

```
VITE_API_BASE_URL=http://localhost:3001
DATABASE_URL=postgresql://localhost:5432/medivault
SESSION_SECRET=<openssl rand -hex 32>
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5177
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=medivault
S3_SECRET_KEY=medivault-secret
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=qwen2.5vl:7b
AI_TIMEOUT_MS=300000
```

Start the API, then Vite (restart Vite after editing `.env`), then drive:

```bash
nohup node server/src/index.js > /tmp/medivault-api.log 2>&1 &
for i in $(seq 1 30); do curl -sf http://localhost:3001/health >/dev/null && break; sleep 0.5; done; curl -s http://localhost:3001/health   # {"ok":true}
node .claude/skills/run-medivault/driver.mjs --role all
psql -d medivault -Atc "select email, role from users order by created_at"   # the driver's smoke-* accounts appear here
```

The API log prints `✓ Created storage bucket "medivault-documents"` on first start, then one line per request plus `Registered <role>` / `Login <role>`. Stop with `lsof -ti:3001 -sTCP:LISTEN | xargs kill`; MinIO with `docker compose down` (data persists in the `minio-data` volume).

To exercise storage without the browser: log in as a doctor, upload a PNG as a lab report for a patient, download it back, and list the bucket. Only doctors and hospitals may upload; `patientId` accepts the patient's email or `patients.id`.

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login -H 'Content-Type: application/json' -d '{"role":"doctor","email":"<doctor email>","password":"Medivault2026"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).token))")
curl -s -X POST http://localhost:3001/api/documents/upload -H "Authorization: Bearer $TOKEN" -F "file=@some.png;type=image/png" -F documentType=lab_report -F patientId=<patient email>
# -> {"message":"Document uploaded successfully.","documentId":"<uuid>"}
curl -s -o out.png -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/documents/<uuid>/download   # byte-identical to some.png
docker compose exec -T minio sh -c 'mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc ls local/medivault-documents'
```

Objects in the bucket are AES-256-GCM ciphertext (first bytes are not the PNG magic `89 50 4e 47`).| xargs kill`.

AI summary (needs the Ollama model pulled; ~30 s on an M4 for a PNG, returns the structured 🏥/📋/⚠️ template):

```bash
curl -s -X POST http://localhost:3001/api/ai/summarize/<uuid> -H "Authorization: Bearer $TOKEN"
# API log: Calling AI model "qwen2.5vl:7b" at http://localhost:11434/v1 ... AI API response: 200
```

## Run (human path)

```bash
npm run dev            # frontend only on http://localhost:5173, mock auth. Ctrl-C to stop.
npm run dev:all        # also starts the API on 3001 - needs a .env with DATABASE_URL (not verified here)
```

## Test

There is no test suite. Lint is the only check:

```bash
npm run lint
```

As of commit d7eeb81 this exits 1 with 11 pre-existing errors in `src/` (unused vars in the dashboard pages, `no-misleading-character-class` in `MediVault-Flowcharts.jsx`). ESLint only matches `*.js`/`*.jsx`, so the `.mjs` driver is not linted.

## Gotchas

- **`npm install` rewrites `package-lock.json`.** The committed lockfile lists `drizzle-orm` and `drizzle-kit` that `package.json` no longer declares, so any install or `npm prune` produces a 3000-line lock diff. Run `git checkout package-lock.json` afterwards and do not commit the churn. `npm install --no-save <pkg>` has the same effect, which is why Playwright lives in the skill's own `package.json`.
- **Dashboard panels fade in.** A screenshot taken the instant `/dashboard/<role>` loads shows the Overview card at partial opacity. The driver waits 1.2 s; do the same for any new screenshot.
- **Password rules.** At least 8 characters with one letter and one digit (`src/utils/authValidation.js`). The driver uses `Medivault2026`.
- **Mock accounts are per browser profile and email must be unique.** Registering an email twice returns "Email already exists". The driver stamps `Date.now()` into every email; a fresh Playwright context starts with empty localStorage anyway.
- **Hospital registration requires a file.** The `#proof` input is validated client-side, so the driver writes a one-line fake PDF into the shots dir and uses `setInputFiles`.
- **No `timeout` on macOS.** The usual `timeout 30 bash -c "until curl ..."` readiness poll fails with `command not found`; the Run section uses a plain `for` loop instead.
- **Port 5173 may belong to another project.** On the authoring machine it was serving an unrelated Vite app and returned 200, so a naive "is it up" curl would have passed against the wrong app. Use 5177 with `--strictPort`.
- **The Express API exits at startup without a database.** `server/src/index.js` calls `testConnection()` and `process.exit(1)`s on failure. Follow the full-stack section.
- **`minio/minio` on Docker Hub no longer exists** (`pull access denied ... repository does not exist`). docker-compose.yml pins `quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z`, the last release that still ships the full web console.
- **Patients cannot upload.** `POST /api/documents/upload` returns 403 `Only doctors and hospitals can upload documents.` for a patient token; upload as a doctor or hospital and pass `patientId`.
- **The upload response key is `documentId`**, not `document.id`.
- **License numbers are UNIQUE in Postgres** (`doctors_license_number_key`, hospitals likewise). A driver that reuses a fixed license fails the second real-API run with a 500 on `/auth/register/doctor`; the driver stamps `Date.now()` into them.
- **The hosted DB drifted from the migrations.** `GET /api/dashboard/patient` 500s with `column ar.document_ids does not exist` on a database built only from migrations 0001-0005. Migration `0006_access_request_document_ids.sql` adds it, and `0007_audit_action_values.sql` adds the `ai_summarize` / `request_document_access` enum values whose absence made `logAudit()` fail silently (`Audit log insert failed: invalid input value for enum audit_action`). Always apply every file in `db/migrations/`.

## Troubleshooting

- **`Error: Port 5177 is already in use`**: a previous run is still listening. `lsof -ti:5177 -sTCP:LISTEN | xargs kill` and relaunch.
- **`locator.innerText: Timeout 30000ms exceeded` waiting for `locator('main')`**: the app has no `<main>`. Probe `body` instead.
- **`browserType.launch: Executable doesn't exist`**: Chromium not in the Playwright cache. `(cd .claude/skills/run-medivault && npx playwright install chromium)`.
- **Claude in Chrome extension "not connected"**: the extension path is optional; this driver runs headless Chromium and does not need it.
