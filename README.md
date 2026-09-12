<div align="center">

# 🏥 MediVault

### *Encrypted. Consent-driven. AI-augmented. Patient-first.*

[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![MinIO](https://img.shields.io/badge/MinIO_(S3)-C72E49?style=for-the-badge&logo=minio&logoColor=white)](https://min.io/)
[![Ollama](https://img.shields.io/badge/Ollama-000000?style=for-the-badge&logo=ollama&logoColor=white)](https://ollama.com/)

🥈 **2nd Place — Udhbhav 2k26** 🏆

</div>

---

## 👥 Built By

> 🥈 **2nd Place — Udhbhav 2k26**

| Name | GitHub |
|------|--------|
| Aharon Kosetti | [@aharon-kumar-kosetti](https://github.com/aharon-kumar-kosetti) |
| Bhanu Prakash Yirri | [@bhanuprakashyirri](https://github.com/bhanuprakashyirri) |
| Mohith Kumar Baggu | [@mohithkumar64](https://github.com/mohithkumar64) |
| Abishai Jogi | [@abishai-jogi](https://github.com/abishai-jogi) |
| Saketh | [@venkata-saketh-reddy](https://github.com/venkata-saketh-reddy) |
| Ram Sai | [@ramsaik3339-cloud](https://github.com/ramsaik3339-cloud) | 

---

## 🩺 The Problem

> Every year, patients repeat tests, face delayed diagnoses, and receive unsafe care — all because their records are scattered across different hospitals and providers.

Healthcare data is **fragmented**, **inaccessible**, and **out of the patient's hands**. In emergencies, this costs lives.

**MediVault fixes this.**

---

## 💡 What is MediVault?

MediVault is a **secure, role-based medical records platform** that puts patients in full control of their health data. Patients own their records. Doctors request access. Hospitals stay accountable. AI makes it all understandable.

- 🔐 **Patient-owned encrypted records**
- ✅ **Explicit, auditable consent flows**
- 🚨 **Emergency break-glass access with guardrails**
- 🤖 **AI-powered report summaries**

---

## ✨ Key Features

| Feature | Description |
|--------|-------------|
| 🧑‍⚕️ **Role-Based Dashboards** | Separate, purpose-built flows for Patients, Doctors, and Hospitals |
| 🗄️ **Secure Document Vault** | Encrypted upload/download with strict role-based authorization |
| 🤝 **Consent & Access Governance** | Request, approve, reject, grant, revoke — full lifecycle control |
| 🚨 **Emergency Access Workflow** | 24-hour break-glass access with full audit trail |
| 🤖 **AI Medical Summarization** | Structured summaries of uploaded records from a local vision model (Ollama) or any OpenAI-compatible API |

---

## 🛠️ Tech Stack

### Frontend
- ⚛️ React 19 + React Router 7
- ⚡ Vite 7
- 🎨 Custom CSS (landing, auth, dashboards)

### Backend
- 🟢 Node.js + Express 5
- 🔑 Custom HMAC-signed bearer token auth (role-aware)
- 🛡️ Rate limiting, CORS controls, bcrypt password hashing

### Data & Storage
- 🐘 PostgreSQL (`pg`, plain SQL migrations in `db/migrations/`)
- 🪣 S3-compatible object storage for encrypted document blobs (MinIO in Docker locally)

### AI
- 🤖 Any OpenAI-compatible chat API. Default: local Ollama `qwen2.5vl:7b` (free). OpenRouter/GPT-4o still works via env vars.

### Tooling
- ESLint 9 · Concurrently · dotenv

---

## 🚀 Getting Started

### Prerequisites
- Node.js (LTS)
- npm
- PostgreSQL database
- Docker Desktop (runs MinIO for file storage)
- [Ollama](https://ollama.com/) (optional, for free local AI summaries)

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/aharon-kumar-kosetti/medivault-react.git
cd medivault-react

# 2. Install dependencies
npm install
```

### Environment Setup

Create a single `.env` file in the project root (you can copy from `.env.example`).

```env
# Frontend (Vite)
# Keep empty to use relative paths (recommended for Vercel rewrites).
VITE_API_BASE_URL=
VITE_ENABLE_MOCK_AUTH=false

# Backend (Node/Express)
DATABASE_URL=your_postgres_url
SESSION_SECRET=your_secret_key
API_PORT=3001
API_HOST=0.0.0.0
ALLOWED_ORIGINS=http://localhost:5173
NODE_ENV=development

# Object storage (MinIO from docker-compose.yml, or any S3-compatible service)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=medivault
S3_SECRET_KEY=medivault-secret
S3_BUCKET=medivault-documents
S3_REGION=us-east-1

# AI summaries (any OpenAI-compatible chat API; local Ollama by default)
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=qwen2.5vl:7b
AI_API_KEY=
AI_TIMEOUT_MS=300000
```

### Local Services (Docker + Ollama)

```bash
# File storage: MinIO on :9000 (console on :9001). Reads S3_ACCESS_KEY / S3_SECRET_KEY from .env
docker compose up -d

# AI summaries (optional, free): install Ollama, then pull the vision model once (~6 GB)
ollama pull qwen2.5vl:7b
```

To use OpenRouter instead of Ollama set `AI_BASE_URL=https://openrouter.ai/api/v1`, `AI_MODEL=openai/gpt-4o`, and `AI_API_KEY` to your key.

### Database Setup

```bash
# Create the database and apply the SQL migrations in order (PostgreSQL 14+)
createdb medivault
for f in db/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d medivault -f "$f" || break; done
```

### Run the App

```bash
# Full stack (recommended)
npm run dev:all

# Frontend only
npm run dev

# Backend only
npm run dev:api

# Production build
npm run build
npm run preview
```

### Vercel Deployment

Vercel runs the React build as static files and the Express app as one serverless function (`api/server.js`). Ollama and MinIO are local-only, so production needs hosted equivalents. All of them have free tiers:

| Need | Recommended | Also works |
|---|---|---|
| PostgreSQL | [Neon](https://neon.tech) (free tier; also available as the Vercel Postgres integration) | Supabase, Railway, RDS |
| S3-compatible bucket | [Cloudflare R2](https://developers.cloudflare.com/r2/) (10 GB free, no egress fees) | AWS S3, Backblaze B2, Supabase Storage |
| Vision-capable model | [Google AI Studio](https://aistudio.google.com) Gemini API, free tier, OpenAI-compatible endpoint | Groq (free tier), OpenRouter (paid) |

**1. Create the services**

- Neon: create a project, copy the connection string (it ends in `?sslmode=require`).
- R2: create a bucket named `medivault-documents`, then *Manage R2 API Tokens → Create API token* with Object Read & Write on that bucket. Note the Access Key ID, Secret Access Key, and the S3 endpoint `https://<account-id>.r2.cloudflarestorage.com`.
- Gemini: create an API key in AI Studio.

**2. Apply the migrations to the hosted database** (from your machine, once per new database):

```bash
DATABASE_URL='postgresql://...neon.tech/neondb?sslmode=require' npm run db:migrate
```

The runner records applied files in `schema_migrations`, so re-running is safe. If the database was already migrated by hand, baseline it first with `npm run db:migrate -- --mark-applied`.

**3. Import the repo in Vercel** (or `vercel link` from the CLI). Build settings come from `vercel.json`.

**4. Environment variables** (Project Settings → Environment Variables, or `vercel env add NAME production`):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | R2 API token pair |
| `S3_BUCKET` | `medivault-documents` |
| `S3_REGION` | `auto` for R2 (`us-east-1` etc. for AWS) |
| `AI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `AI_MODEL` | `gemini-3.6-flash` (`gemini-2.0-flash` and `gemini-2.5-flash` are retired for new accounts; list the models your key can use with `curl "https://generativelanguage.googleapis.com/v1beta/models?key=$AI_API_KEY"`) |
| `AI_API_KEY` | Gemini API key |
| `AI_TIMEOUT_MS` | `50000` (must stay under the function's 60 s `maxDuration` in `vercel.json`) |
| `ALLOWED_ORIGINS` | your production URL, e.g. `https://medivault.vercel.app` |
| `NODE_ENV` | `production` |

Leave `VITE_API_BASE_URL` **unset** in production: the frontend then uses relative `/api` URLs, which `vercel.json` rewrites to the function. Do not set `VITE_ENABLE_MOCK_AUTH` in production; it would make the site keep accounts in each visitor's browser instead of the database.

**5. Deploy** (`vercel --prod`, or push to `main` once the Git integration is on) and check `https://<your-app>.vercel.app/health` returns `{"ok":true}`.

Operational notes:
- `/api/*`, `/auth/*`, and `/health` are rewritten to the Express serverless function in `api/server.js`; everything else serves `index.html` so React Router works on refresh.
- Vercel serverless functions reject request bodies over 4.5 MB, so uploads are capped at 4 MB when `VERCEL` is set (20 MB locally).
- `maxDuration` is 60 s on the Hobby plan; the AI call must finish inside it. Gemini Flash usually answers in a few seconds.
- The bucket must already exist; the function does not create it (only the local `npm run dev:api` does).
- TLS to Postgres is enabled automatically for non-localhost `DATABASE_URL`s (`server/src/db.js`); set `DATABASE_SSL=false` to override.

---

## 📐 Architecture

> See full architecture diagram: [`public/docs/MediVault-Architecture.pdf`](public/docs/MediVault-Architecture.pdf)

```
┌─────────────────────────────────────────────┐
│               React Frontend                │
│     Patient · Doctor · Hospital Dashboards  │
└──────────────────┬──────────────────────────┘
                   │ HMAC Bearer Token Auth
┌──────────────────▼──────────────────────────┐
│           Express API (Node.js)             │
│   Auth · Records · Consent · Emergency · AI │
└──────┬───────────┬──────────────┬───────────┘
       │           │              │
  ┌────▼────┐ ┌────▼─────┐ ┌─────▼──────┐
  │PostgreSQL│ │ MinIO/S3 │ │ Ollama  AI │
  │  (Data) │ │(Documents│ │ (Summaries)│
  └─────────┘ └──────────┘ └────────────┘
```

---

## 🗺️ Roadmap

- [ ] **Object storage migration** — Backfill blob payloads from DB to object storage at scale
- [ ] **Token revocation table** — `revoked_tokens` for immediate session invalidation
- [ ] **Legacy path cleanup** — Retire compatibility branches post-migration
- [ ] **Mobile app** — React Native patient portal
- [ ] **HL7 FHIR integration** — Interoperability with hospital systems

---

<div align="center">

**MediVault** — *Encrypted. Consent-driven. AI-augmented. Patient-first.*

⭐ Star this repo if you found it useful!

</div>
