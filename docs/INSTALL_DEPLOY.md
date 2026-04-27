# WakeSafe — Local Install + Cloud Deploy (Step-by-step)

This guide covers:
- **Local development** (backend, ML services, web client, mobile)
- **Cloud deployment** (GCP Cloud Run via GitHub Actions)

Repo root (Windows): `c:\Users\nurie\source\repos\WakeSafe\WakeSafe`

## Local development

### Prerequisites
- **Node.js 20+** and **npm 10+**
- **Python 3.11+** (for `ml1-service` / `ml2-service`)
- **Docker Desktop** (for local Redis via `docker-compose.local.yml`)
- **MongoDB** running locally (or a cloud MongoDB URI)
- (Mobile) **Expo Go** app on your phone or Android Studio / Xcode for emulators

### 1) Install dependencies
From the repo root:

```powershell
npm run setup
```

This runs:
- `npm install --prefix server`
- `npm install --prefix WakeSafeMobile`

### 2) Configure environment files

#### Backend env (`server/`)
Copy the example env file:

```powershell
copy server\.env.example server\env.local
```

Edit `server\env.local` and set at least:
- **`MONGO_URI`** and `MONGO_DB`
- **`JWT_SECRET`**
- (If using Maps features) **`GOOGLE_MAPS_API_KEY`**
- **`GCS_BUCKET`** + credentials (only needed if you use GCS uploads locally)

The backend expects ML services at:
- `ML1_SERVICE_URL=http://localhost:8001`
- `ML2_SERVICE_URL=http://localhost:8002`

#### Mobile env (`WakeSafeMobile/`)
Copy the example env file:

```powershell
copy WakeSafeMobile\.env.example WakeSafeMobile\.env.local
```

Then set (typical local):
- `EXPO_PUBLIC_ENV=development`
- optionally `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_WS_URL`

You can also use the built-in env switch script:

```powershell
npm run env:local --prefix WakeSafeMobile
```

### 3) Start Redis (local)
From the repo root:

```powershell
npm run redis:up
```

To stop:

```powershell
npm run redis:down
```

### 4) Run the backend + ML services locally

#### Option A (recommended): Run backend + ML1 + ML2 together

```powershell
npm run dev:local
```

This starts:
- Redis (docker)
- backend (`server/`, with nodemon)
- ML1 (`ml1-service`, FastAPI on `:8001`)
- ML2 (`ml2-service`, FastAPI on `:8002`)

#### Option B: Backend only

```powershell
npm run dev:server
```

### 5) Run mobile (Expo)
In a separate terminal:

```powershell
npm run start --prefix WakeSafeMobile
```

Common alternatives:

```powershell
npm run start:clear --prefix WakeSafeMobile
npm run android --prefix WakeSafeMobile
npm run ios --prefix WakeSafeMobile
```

### 6) Run the web client (optional)
This repo includes a simple web client under `client/` (`client/index.html`).

Start a static server (pick one):

```powershell
# Option 1: http-server (no install)
npx http-server .\client -p 8081
```

Then open `http://localhost:8081`.

Notes:
- The backend uses Socket.IO; make sure `CONFIG.API_BASE_URL` / `CONFIG.WS_URL` in `client/js/config.js` point at your backend (default `http://localhost:8080`).
- If you serve the web client from another port, ensure your backend CORS/origins allow it (see `server/.env.example` `CORS_ALLOWED_ORIGINS` / `SOCKET_IO_ORIGIN`).

### 7) Full stack in one command (backend + ML + mobile)
From repo root:

```powershell
npm run dev:local:all
```

## Cloud deployment (GCP Cloud Run)

WakeSafe deploys services to **Cloud Run** using **GitHub Actions** workflows.

### What gets deployed
Workflows (see `.github/workflows/`):
- `deploy-backend.yml` → **Cloud Run service** `wakesafe-api`
- `deploy-ml1-service.yml` → `wakesafe-ml1-service`
- `deploy-ml2-service.yml` → `wakesafe-ml2-service`
- `deploy-ai-server.yml` → `wakesafe-ai-server`

Deploy triggers:
- On push to `main`
- Manual trigger (`workflow_dispatch`) in GitHub Actions

### 1) Create a GCP project + enable APIs
In the Google Cloud Console:
- Create/select a project
- Enable APIs:
  - Cloud Run
  - Artifact Registry
  - Cloud Build (commonly required by tooling)
  - IAM

### 2) Create Artifact Registry repository
Create a Docker repository in your region (the workflows assume repository name `wakesafe`).

### 3) Create a deploy service account
Create a service account that can:
- Deploy/update Cloud Run services
- Push to Artifact Registry
- Read/write any required secrets (if you later move to Secret Manager)

Download the service account JSON.

### 4) Add GitHub repository secrets
In GitHub → **Settings → Secrets and variables → Actions**, add:

- **`GCP_SA_KEY`**: the service account JSON (entire JSON content)

For backend deploy (`deploy-backend.yml`), also set:
- **`MONGO_URI`**
- **`JWT_SECRET`**
- **`GOOGLE_MAPS_API_KEY`** (if used)
- **`GCS_BUCKET`** (if used)

Optional (workflows provide defaults if missing):
- `PROJECT_ID` (default: `wakesafe-470816`)
- `GCP_REGION` (default: `us-central1`)

### 5) Deploy
Push to `main` or run the workflow manually:
- GitHub → Actions → select workflow → **Run workflow**

Each workflow builds a Docker image, pushes it to Artifact Registry, then deploys to Cloud Run.

### 6) Cost control (Cloud Run scale-to-zero)
This repo includes a helper PowerShell script to toggle Cloud Run services between “warm” and “idle”:

```powershell
npm run gcp:status
npm run gcp:stop
npm run gcp:start
```

Equivalent direct script calls:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\manage-gcp-services.ps1 status
powershell -ExecutionPolicy Bypass -File .\scripts\manage-gcp-services.ps1 stop
powershell -ExecutionPolicy Bypass -File .\scripts\manage-gcp-services.ps1 start
```

## Troubleshooting quick hits

### Backend can’t connect to MongoDB
- Verify `MONGO_URI` and `MONGO_DB` in `server/env.local`
- Ensure MongoDB is running and accessible from your machine/container

### WebSocket / Socket.IO not connecting
- Ensure backend is running
- Ensure the client points to the backend (`CONFIG.WS_URL`)
- Check `SOCKET_IO_ORIGIN` / `CORS_ALLOWED_ORIGINS` in backend env

### Audio won’t play in the web client
- Most browsers require a **user gesture** before audio playback is allowed.
  Click/tap once in the page first to unlock audio.

