import * as Location from 'expo-location';

export interface CurrentCoords {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
}

export type LocationErrorReason =
  | 'permission_denied'
  | 'services_disabled'
  | 'timeout'
  | 'unknown';

export class LocationError extends Error {
  reason: LocationErrorReason;
  constructor(reason: LocationErrorReason, message?: string) {
    super(message || reason);
    this.name = 'LocationError';
    this.reason = reason;
  }
}

/**
 * Ask for foreground location permission. Resolves to true if granted, false
 * otherwise. Never throws — caller decides how to surface a denied state.
 */
export async function ensureLocationPermission(): Promise<boolean> {
  try {
    const existing = await Location.getForegroundPermissionsAsync();
    if (existing.granted) return true;
    if (!existing.canAskAgain) return false;
    const requested = await Location.requestForegroundPermissionsAsync();
    return requested.granted;
  } catch (error) {
    console.warn('ensureLocationPermission failed:', error);
    return false;
  }
}

/**
 * Resolve the device's current GPS coordinates. Throws a typed
 * LocationError so callers can render the right UX (denied vs disabled
 * vs hardware timeout).
 */
export async function getCurrentCoords(timeoutMs: number = 10000): Promise<CurrentCoords> {
  const granted = await ensureLocationPermission();
  if (!granted) {
    throw new LocationError('permission_denied', 'Location permission denied');
  }

  let servicesEnabled = true;
  try {
    servicesEnabled = await Location.hasServicesEnabledAsync();
  } catch {
    // Some platforms throw when probing; fall through and let getCurrentPositionAsync surface it.
  }
  if (!servicesEnabled) {
    throw new LocationError('services_disabled', 'Location services are disabled');
  }

  const position = await Promise.race<Location.LocationObject>([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    new Promise<Location.LocationObject>((_, reject) =>
      setTimeout(() => reject(new LocationError('timeout', 'Location lookup timed out')), timeoutMs)
    ),
  ]);

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp,
  };
}
