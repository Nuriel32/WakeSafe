import { CONFIG } from '../config';

export interface SafeStop {
  placeId: string;
  placeName: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceMeters: number | null;
  durationSeconds: number | null;
  googleMapsUrl: string;
  sourceType: string;
  rating: number | null;
  openNow?: boolean;
}

export interface FetchSafeStopsParams {
  latitude: number;
  longitude: number;
  token: string;
  signal?: AbortSignal;
}

export interface FetchSafeStopsResult {
  stops: SafeStop[];
  reason?: string;
}

/**
 * Fetch nearby safe stop suggestions for the current GPS location.
 *
 * The backend already does the heavy lifting (multi-type Places search,
 * filtering of unsafe/closed venues, route-aware distance/ETA, ranking) and
 * returns a list ordered nearest-first. We just normalize the shape and
 * surface a typed error message on failure.
 */
export async function fetchSafeStops(params: FetchSafeStopsParams): Promise<FetchSafeStopsResult> {
  const { latitude, longitude, token, signal } = params;

  const response = await fetch(`${CONFIG.API_BASE_URL}/location/safe-stops`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ latitude, longitude }),
    signal,
  });

  const text = await response.text();
  let payload: any = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
  }

  if (!response.ok) {
    const message = payload?.message || `Safe stops request failed (${response.status})`;
    throw new Error(message);
  }

  const stops = Array.isArray(payload?.stops) ? payload.stops : [];
  return {
    stops,
    reason: payload?.reason,
  };
}
