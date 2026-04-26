# WakeSafe Backend — WebSocket API

The backend exposes a Socket.IO endpoint at the same origin as the REST API. Path: `/socket.io`. Transports: `websocket`, `polling`. CORS is controlled by the `SOCKET_IO_ORIGIN` env variable.

## Authentication handshake

The client must send the JWT in `socket.handshake.auth.token` when connecting:

```js
const socket = io(WS_URL, {
  auth: { token: jwt },
  transports: ['websocket']
});
```

The server middleware:

1. Verifies the JWT (`HS256`, `JWT_SECRET`).
2. Checks if `jti` is revoked in Redis (`revoked:<jti>`).
3. Attaches `socket.userId`, `socket.userEmail`, `socket.jti`.
4. Joins two rooms: `user:<userId>` and `session:<userId>`.
5. Emits a `connected` welcome event.

If any step fails, the connection is rejected with `Authentication token required`, `Invalid token`, or `Token has been revoked`.

---

## Server -> Client events

### `connected`
Emitted right after a successful handshake.

```ts
{ message: string; userId: string; timestamp: number }
```

### `session_started` / `session_ended`
Acknowledgements for client-emitted `session_start` / `session_end`.

```ts
{ sessionId: string; status: 'active' | 'ended'; timestamp: number }
```

### `continuous_capture_started` / `continuous_capture_stopped`
Acknowledgements for client-emitted `continuous_capture_start` / `continuous_capture_stop`.

```ts
{ sessionId: string; captureRate?: '1 photo per second'; timestamp: number }
```

### `photo_capture_confirmed`
Echoed by the server when the client emits `photo_captured`.

```ts
{ sequenceNumber: number; timestamp: number; sessionId: string }
```

### `upload_progress`
Progress updates for a photo upload.

```ts
{ photoId: string; progress: 0..100; fileName: string; status: 'uploading' }
```

### `upload_completed`

```ts
{ photoId: string; fileName: string; gcsPath: string; status: 'completed'; aiProcessingQueued: boolean }
```

### `upload_failed`

```ts
{ photoId: string; fileName: string; error: string; status: 'failed' }
```

### `ai_processing_complete`
Sent after ML1+ML2 finish for a photo. Always carries the `eventId`; Redis dedupes per event.

```ts
{
  eventId: string;
  photoId: string;
  results: {
    ml1: ML1PredictResponse;       // see ML1_SERVICE.md
    ml2: ML2AnalyzeResponse;       // see ML2_SERVICE.md
    prediction: 'alert' | 'drowsy' | 'sleeping' | 'unknown';
    alertEmitted: boolean;
  };
  processingTime: number;          // ms
  timestamp: number;
}
```

### `driver_fatigue_alert`
Emitted when ML2 reports fatigue and the false-positive guard passes (`fatigueAlertService.processDetection`).

```ts
{
  eventId: string;
  type: 'fatigue_alert';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  tripId: string;                  // alias of sessionId
  sessionId: string;
  timestamp: string;               // ISO 8601
  confidenceScore: number;         // 0..1
  fatigueLevel: number;            // 0..1
  source: 'ml_pipeline' | 'ml' | string;
  recommendation: string;
  metrics?: Record<string, unknown>;
  photoId?: string;
}
```

### `fatigue_safe_stop`
Emitted alongside a critical / warning alert when a nearby safe stop is found via Google Maps. Cooldown configurable via `SAFE_STOP_RECOMMENDATION_COOLDOWN_MS`.

```ts
{
  eventId: string;
  type: 'fatigue_safe_stop';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  tripId: string;
  sessionId: string;
  timestamp: string;
  placeName: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId: string;
  distanceMeters: number;
  durationSeconds: number;
  googleMapsUrl: string;
  recommendations: Array<unknown>;
}
```

### `notification`
Generic toast / banner notification surface.

```ts
{
  eventId: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  duration: number;               // ms
  timestamp: number;
}
```

### `pong`
Reply to `ping`.

```ts
{ timestamp: number }
```

### `heartbeat_ack`
Reply to `heartbeat`.

```ts
{ timestamp: number; clientTimestamp: number | null }
```

### `location_update` *(broadcast)*
Re-broadcast of a client's location to its own user room (used for multi-device).

```ts
{ location: object; timestamp: number }
```

---

## Client -> Server events

### `session_start`

```ts
{ sessionId: string }
```

### `session_end`

```ts
{ sessionId: string }
```

### `continuous_capture_start` / `continuous_capture_stop`

```ts
{ sessionId: string }
```

### `photo_captured`
Emitted by the client right after a frame is captured (before upload completes).

```ts
{ sessionId: string; sequenceNumber: number; timestamp: number }
```

### `upload_started` / `upload_progress` / `upload_completed` / `upload_failed`
Progress reporting from the client. Server logs and re-broadcasts to the user's own room.

```ts
{ photoId: string; fileName: string; progress?: number; gcsPath?: string; error?: string; aiProcessingQueued?: boolean }
```

### `location_update`

```ts
{ location: { latitude: number; longitude: number; accuracy?: number; timestamp?: number } }
```

### `ping`
No body. Server replies with `pong`.

### `heartbeat`

```ts
{ timestamp?: number }
```

The server records the last heartbeat per socket; sockets with no heartbeat for `SOCKET_HEARTBEAT_STALE_MS` (default 70s) are disconnected by the periodic sweep (`SOCKET_HEARTBEAT_SWEEP_MS`, default 30s).

---

## Deduplication

The server uses Redis to dedupe outgoing emits:

```js
ws_emit:<eventName>:<userId>:<eventId>
```

Each event carries an `eventId` (random UUID). Default TTL: 60s for most events, 30s for `ai_processing_complete`, 15s for `notification`, 120s for `fatigue_detection`.

If the client receives the same `eventId` twice (e.g., due to retries), it should ignore the duplicate.
