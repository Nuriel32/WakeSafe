# Project Structure

## Top-Level Apps

- `server/` - WakeSafe backend API and realtime services.
- `WakeSafeMobile/` - Expo React Native client application.
- `ml1-service/` - Frame-level ML service (FastAPI).
- `ml2-service/` - Temporal decision ML service (FastAPI).

## Backend (`server/`)

- `controllers/` - Route handlers (thin HTTP layer).
- `services/` - Domain/business logic and integrations.
- `middlewares/` - Shared middleware (auth, validation, formatting).
- `models/` - Mongoose schemas/models.
- `routes/` - API route definitions.
- `utils/` - Shared utilities (`logger`, `httpError`, etc.).
- `tests/` - Unit, integration, and e2e backend tests.

### Backend Conventions

- Keep controllers small and focused on request/response.
- Put business logic in services.
- Return standardized responses via `res.success` / `res.fail`.
- Throw or pass `HttpError` for known error cases.

## Mobile (`WakeSafeMobile/`)

- `src/screens/` - App screens grouped by feature area.
- `src/components/` - Reusable UI and feedback components.
- `src/hooks/` - Shared state hooks/providers.
- `src/services/` - API/socket/client-side service logic.
- `src/theme/` - Design tokens and visual primitives.
- `src/config/` - Runtime environment configuration.

### Mobile Conventions

- Reuse design system components for consistency.
- Keep side effects in services/hooks, not in UI components.
- Use toast + empty/loading states for good UX defaults.
