import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/feedback/ToastProvider';
import { fetchSafeStops, SafeStop } from '../../services/safeStopService';
import {
  CurrentCoords,
  getCurrentCoords,
  LocationError,
} from '../../services/locationService';

const TYPE_ICON: Record<string, string> = {
  gas_station: 'Gas station',
  rest_stop: 'Rest stop',
  parking: 'Parking',
  convenience_store: 'Convenience store',
  cafe: 'Cafe',
};

const DEFAULT_REGION: Region = {
  // Roughly the center of Israel — only used as a placeholder before the
  // real GPS fix arrives so the map has something to show.
  latitude: 32.0853,
  longitude: 34.7818,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

function formatDistance(meters: number | null): string {
  if (meters == null || !Number.isFinite(meters)) return '—';
  if (meters < 950) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;
  return `${hours} h ${remaining} min`;
}

function describeLocationError(error: unknown): { title: string; message: string } {
  if (error instanceof LocationError) {
    switch (error.reason) {
      case 'permission_denied':
        return {
          title: 'Location permission needed',
          message:
            'WakeSafe needs your location to find nearby safe stops. Enable location access in Settings to continue.',
        };
      case 'services_disabled':
        return {
          title: 'Turn on location services',
          message: 'Your device location is turned off. Enable it to find nearby safe stops.',
        };
      case 'timeout':
        return {
          title: 'Could not get your location',
          message:
            'It is taking too long to get a GPS fix. Move to an area with better signal and try again.',
        };
      default:
        break;
    }
  }
  return {
    title: 'Could not get your location',
    message: 'Something went wrong while reading your GPS. Please try again.',
  };
}

function buildOpenInMapsUrl(stop: SafeStop, origin?: CurrentCoords | null): string {
  if (origin) {
    const dest = `${stop.latitude},${stop.longitude}`;
    if (Platform.OS === 'ios') {
      // Apple Maps deep link with driving directions.
      return `http://maps.apple.com/?saddr=${origin.latitude},${origin.longitude}&daddr=${dest}&dirflg=d`;
    }
    // Universal Google Maps directions URL — works on Android (opens app)
    // and as a web fallback elsewhere.
    return `https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${dest}&travelmode=driving`;
  }
  return stop.googleMapsUrl;
}

export const NavigationScreen: React.FC = () => {
  const { token } = useAuth();
  const { showToast } = useToast();
  const mapRef = useRef<MapView | null>(null);

  const [origin, setOrigin] = useState<CurrentCoords | null>(null);
  const [stops, setStops] = useState<SafeStop[]>([]);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState<string | null>(null);

  const region: Region = useMemo(() => {
    if (origin) {
      return {
        latitude: origin.latitude,
        longitude: origin.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    return DEFAULT_REGION;
  }, [origin]);

  const loadNearbyStops = useCallback(
    async (silent: boolean = false) => {
      if (!silent) setLoading(true);
      setErrorMessage(null);
      setErrorTitle(null);

      let coords: CurrentCoords;
      try {
        coords = await getCurrentCoords();
        setOrigin(coords);
      } catch (error) {
        const { title, message } = describeLocationError(error);
        setErrorTitle(title);
        setErrorMessage(message);
        setLoading(false);
        return;
      }

      if (!token) {
        setErrorTitle('Sign in required');
        setErrorMessage('Please sign in again to load nearby stops.');
        setLoading(false);
        return;
      }

      try {
        const result = await fetchSafeStops({
          latitude: coords.latitude,
          longitude: coords.longitude,
          token,
        });
        const uniqueStops = dedupeStops(result.stops);
        setStops(uniqueStops);
        if (uniqueStops.length === 0) {
          setErrorTitle('No nearby safe stops');
          setErrorMessage(
            'We could not find safe stops within range. Try moving a bit and refresh.'
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load nearby stops';
        setErrorTitle('Could not load stops');
        setErrorMessage(message);
        if (silent) {
          showToast(message, 'error');
        }
      } finally {
        setLoading(false);
      }
    },
    [token, showToast]
  );

  useEffect(() => {
    loadNearbyStops();
  }, [loadNearbyStops]);

  // When stops or origin change, recenter the map to fit them all.
  useEffect(() => {
    if (!mapRef.current) return;
    const points: Array<{ latitude: number; longitude: number }> = [];
    if (origin) points.push({ latitude: origin.latitude, longitude: origin.longitude });
    stops.forEach((s) => points.push({ latitude: s.latitude, longitude: s.longitude }));
    if (points.length < 2) return;
    try {
      mapRef.current.fitToCoordinates(points, {
        edgePadding: { top: 80, right: 80, bottom: 80, left: 80 },
        animated: true,
      });
    } catch (error) {
      console.warn('NavigationScreen fitToCoordinates failed:', error);
    }
  }, [stops, origin]);

  const handleSelectStop = useCallback((stop: SafeStop) => {
    setSelectedStopId(stop.placeId);
    if (mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: stop.latitude,
          longitude: stop.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        400
      );
    }
  }, []);

  const handleOpenInMaps = useCallback(
    async (stop: SafeStop) => {
      const url = buildOpenInMapsUrl(stop, origin);
      try {
        const supported = await Linking.canOpenURL(url);
        if (!supported) {
          // Fall back to the place URL if the platform can't open the directions deep link.
          await Linking.openURL(stop.googleMapsUrl);
          return;
        }
        await Linking.openURL(url);
      } catch (error) {
        console.warn('Failed to open external maps app:', error);
        showToast('Could not open Maps. Please try again.', 'error');
      }
    },
    [origin, showToast]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Find a safe stop</Text>
        <Text style={styles.headerSubtitle}>
          Pull over and rest. We picked the closest places to you.
        </Text>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_DEFAULT}
          initialRegion={region}
          showsUserLocation={!!origin}
          showsMyLocationButton={false}
          loadingEnabled
        >
          {stops.map((stop) => (
            <Marker
              key={stop.placeId}
              identifier={stop.placeId}
              coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
              title={stop.placeName}
              description={stop.address}
              onPress={() => handleSelectStop(stop)}
            />
          ))}
        </MapView>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>
          Nearby ({stops.length})
        </Text>
        <TouchableOpacity
          onPress={() => loadNearbyStops()}
          disabled={loading}
          style={[styles.refreshBtn, loading && styles.refreshBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Refresh nearby safe stops"
        >
          <Text style={styles.refreshBtnText}>{loading ? 'Loading…' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      >
        {loading && stops.length === 0 ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator color="#2563eb" />
            <Text style={styles.centerText}>Looking for the closest safe stops…</Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={[styles.centerBlock, styles.errorBlock]}>
            <Text style={styles.errorTitle}>{errorTitle}</Text>
            <Text style={styles.errorMessage}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => loadNearbyStops()}>
              <Text style={styles.retryBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {stops.map((stop) => {
          const isSelected = selectedStopId === stop.placeId;
          return (
            <TouchableOpacity
              key={stop.placeId}
              activeOpacity={0.85}
              onPress={() => handleSelectStop(stop)}
              style={[styles.card, isSelected && styles.cardSelected]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {stop.placeName}
                </Text>
                <Text style={styles.cardType}>
                  {TYPE_ICON[stop.sourceType] || 'Stop'}
                </Text>
              </View>
              {stop.address ? (
                <Text style={styles.cardAddress} numberOfLines={2}>
                  {stop.address}
                </Text>
              ) : null}
              <View style={styles.cardMetaRow}>
                <Text style={styles.cardMeta}>{formatDistance(stop.distanceMeters)}</Text>
                <Text style={styles.cardMetaDivider}>•</Text>
                <Text style={styles.cardMeta}>{formatDuration(stop.durationSeconds)}</Text>
                {stop.rating != null ? (
                  <>
                    <Text style={styles.cardMetaDivider}>•</Text>
                    <Text style={styles.cardMeta}>★ {stop.rating.toFixed(1)}</Text>
                  </>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.navigateBtn}
                onPress={() => handleOpenInMaps(stop)}
                accessibilityRole="button"
                accessibilityLabel={`Open directions to ${stop.placeName}`}
              >
                <Text style={styles.navigateBtnText}>Navigate</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
};

function dedupeStops(stops: SafeStop[]): SafeStop[] {
  const seen = new Set<string>();
  const out: SafeStop[] = [];
  for (const stop of stops) {
    const id = stop.placeId || `${stop.latitude.toFixed(5)},${stop.longitude.toFixed(5)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(stop);
  }
  return out;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#64748b',
  },
  mapWrap: {
    height: 260,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  refreshBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#2563eb',
    borderRadius: 8,
  },
  refreshBtnDisabled: {
    backgroundColor: '#94a3b8',
  },
  refreshBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  centerBlock: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 13,
  },
  errorBlock: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#b91c1c',
    marginBottom: 6,
    textAlign: 'center',
  },
  errorMessage: {
    color: '#475569',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#2563eb',
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
    marginRight: 8,
  },
  cardType: {
    fontSize: 11,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardAddress: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 8,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardMeta: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
  },
  cardMetaDivider: {
    marginHorizontal: 6,
    color: '#94a3b8',
  },
  navigateBtn: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  navigateBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
});
