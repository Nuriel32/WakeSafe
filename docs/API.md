# WakeSafe — API Documentation Index

This document is the entry point for all API documentation in the WakeSafe project. It links to per-subsystem documents so each component can be browsed independently.

## Subsystems

| Document | Scope |
|---|---|
| [`api/REST.md`](./api/REST.md) | Backend REST API (Node.js + Express). Auth, sessions, photos, fatigue, uploads, location, Spotify. |
| [`api/WEBSOCKET.md`](./api/WEBSOCKET.md) | Real-time Socket.IO contract (client → server, server → client events). |
| [`api/ML1_SERVICE.md`](./api/ML1_SERVICE.md) | Frame-level eye-state classifier service (FastAPI). Endpoints, classes, schemas. |
| [`api/ML2_SERVICE.md`](./api/ML2_SERVICE.md) | Temporal fatigue decision service (FastAPI). Endpoints, classes, schemas. |
| [`api/DATA_MODELS.md`](./api/DATA_MODELS.md) | All persistence schemas (Mongoose) and DTO schemas (Pydantic). |
| [`api/SERVICES.md`](./api/SERVICES.md) | Internal service classes and modules across the backend and AI services. |
| [`api/CONFIGURATION.md`](./api/CONFIGURATION.md) | Environment variables and configuration surfaces for every component. |

## Conventions

- All REST endpoints are versioned by base path. Currently the only base is `/api`.
- All authenticated routes require `Authorization: Bearer <jwt>`. JWTs are issued by `POST /api/auth/login` and revoked through Redis on `POST /api/auth/logout`.
- Successful Express responses use the helper `res.success(data, { statusCode, message, meta })`, producing:
  ```json
  {
    "success": true,
    "message": "...",
    "data": { ... },
    "meta": { ... },
    "requestId": "..."
  }
  ```
- Error responses use the helper `res.fail(message, { statusCode, code, details })` and consistently include `requestId`.
- All timestamps are ISO 8601 UTC unless documented otherwise.
- Object IDs are 24-character hex strings (MongoDB ObjectId).

## Service map

```
Mobile / Web client
       |
       | HTTPS, WebSocket
       v
+--------------------+
| Backend (Express)  | ----+----- MongoDB
| /api/* + Socket.IO |     +----- Redis
+--------------------+     +----- Google Cloud Storage
       |                   +----- Google Maps APIs
       | HTTP (internal)
       v
+----------+      +----------+
|   ML1    | ---> |   ML2    |
|  /predict|      | /analyze |
+----------+      +----------+
```

- ML1 and ML2 are not exposed publicly. They are reached only by the backend over the internal network.
- The legacy `ai_server/` directory is an earlier monolithic AI service kept in the repo for reference; it is not part of the active production pipeline.
