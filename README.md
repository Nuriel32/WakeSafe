# WakeSafe

WakeSafe is a full-stack driver safety platform with:
- `server` (Node.js + Express + MongoDB + Redis + Socket.IO)
- `WakeSafeMobile` (Expo + React Native)
- `ml1-service` and `ml2-service` (FastAPI microservices)

## Quick Start

### 1) Prerequisites
- Node.js 20+
- npm 10+
- Python 3.11 (for ML services)
- MongoDB + Redis (local or cloud)

### 2) Install dependencies
```bash
npm run setup
```

### 3) Configure environment

#### Backend
```bash
copy server/.env.example server/env.local
```
Then fill secrets and infrastructure values in `server/env.local`.

#### Mobile
```bash
copy WakeSafeMobile/.env.example WakeSafeMobile/.env.local
```
Set `EXPO_PUBLIC_ENV` and optional endpoint overrides.

### 4) Run development
```bash
# Run backend + mobile together
npm run dev
```

Or run each one:
```bash
npm run dev:server
npm run dev:mobile
```

## Useful Commands

```bash
# Backend tests
npm run test:server

# Mobile env switch shortcuts
npm run env:local --prefix WakeSafeMobile
npm run env:development --prefix WakeSafeMobile
npm run env:staging --prefix WakeSafeMobile
npm run env:production --prefix WakeSafeMobile
```

## GCP Cost Control (Cloud Run)

Use these scripts to quickly move your 3 services between active mode and low-cost idle mode:

```bash
# Show current scaling status
npm run gcp:status

# Active mode (keeps warm instances)
npm run gcp:start

# Low-cost idle mode (min instances = 0)
npm run gcp:stop
```

Manual script usage:

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\manage-gcp-services.ps1 status
powershell -ExecutionPolicy Bypass -File .\scripts\manage-gcp-services.ps1 stop
powershell -ExecutionPolicy Bypass -File .\scripts\manage-gcp-services.ps1 start
```

## Local Redis (Docker Compose)

Start local Redis for development:

```bash
npm run redis:up
```

View logs:

```bash
npm run redis:logs
```

Stop Redis:

```bash
npm run redis:down
```

Compose file used: `docker-compose.local.yml` (maps `localhost:6379`).

## CI/CD Deployment Behavior

GitHub Actions deployment workflows now run on:
- every push to `main`
- manual trigger (`workflow_dispatch`)

Workflows:
- `.github/workflows/deploy-backend.yml` -> `wakesafe-api`
- `.github/workflows/deploy-ml1-service.yml` -> `wakesafe-ml1-service`
- `.github/workflows/deploy-ml2-service.yml` -> `wakesafe-ml2-service`

Required repository secret:
- `GCP_SA_KEY` (service account JSON with Cloud Run + Artifact Registry permissions)

Optional secrets (fallback defaults are applied if not set):
- `PROJECT_ID` (default `wakesafe-470816`)
- `GCP_REGION` (default `us-central1`)

## Project Structure

See `docs/PROJECT_STRUCTURE.md` for architecture and folder conventions.

## Onboarding

See `docs/ONBOARDING.md` for a clean first-day setup flow.