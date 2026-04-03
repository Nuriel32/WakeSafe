# Onboarding Guide

This guide gets a new developer running quickly.

## 1. Clone and install

```bash
git clone <repo-url>
cd wakesafe
npm run setup
```

## 2. Configure backend env

```bash
copy server/.env.example server/env.local
```

Required minimum values:
- `JWT_SECRET`
- `MONGO_URI`
- `GCS_BUCKET` (if testing uploads)
- `ML_WEBHOOK_API_KEY` (if testing ML webhook)

Optional local defaults already exist for:
- `PORT`, `HOST`, `REDIS_HOST`, `REDIS_PORT`

## 3. Configure mobile env

```bash
copy WakeSafeMobile/.env.example WakeSafeMobile/.env.local
```

Use one of:

```bash
npm run env:local --prefix WakeSafeMobile
npm run env:development --prefix WakeSafeMobile
```

Optional overrides:
- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_WS_URL`

## 4. Start development

```bash
npm run dev
```

This starts:
- backend (`server`)
- mobile Expo app (`WakeSafeMobile`)

## 5. Verify basics

- API health: `GET /healthz`
- Login/register from mobile app
- Start session and ensure socket connection is active

## 6. Run tests

```bash
npm run test:server
```

## Common Troubleshooting

- **Mongo connection fails**: check `MONGO_URI` and network access rules.
- **Redis unavailable**: API still runs; caching/rate-limit behavior may degrade.
- **Mobile can’t reach API**: set `EXPO_PUBLIC_API_BASE_URL` in mobile `.env.local`.
- **No realtime events**: verify `SOCKET_IO_ORIGIN` and `EXPO_PUBLIC_WS_URL`.
