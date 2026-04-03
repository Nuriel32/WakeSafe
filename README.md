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

## Project Structure

See `docs/PROJECT_STRUCTURE.md` for architecture and folder conventions.

## Onboarding

See `docs/ONBOARDING.md` for a clean first-day setup flow.