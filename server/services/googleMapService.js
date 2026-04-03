const logger = require('../utils/logger');
const cache = require('./cacheService');
const googleMapsAdapter = require('../adapters/googleMapsAdapter');

// Google Maps Service for WakeSafe
// This service handles Google Maps API operations for location services

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_ROUTES_API_KEY = process.env.GOOGLE_MAPS_ROUTES_API_KEY || GOOGLE_MAPS_API_KEY;

async function geocodeAddress(address) {
  try {
    const data = await googleMapsAdapter.geocode(address);
    
    if (data.status !== 'OK') {
      throw new Error(`Google Maps API error: ${data.status}`);
    }
    
    return data.results[0];
  } catch (error) {
    logger.error('Geocoding failed:', error);
    throw error;
  }
}

async function reverseGeocode(lat, lng) {
  try {
    const data = await googleMapsAdapter.reverseGeocode(lat, lng);
    
    if (data.status !== 'OK') {
      throw new Error(`Google Maps API error: ${data.status}`);
    }
    
    return data.results[0];
  } catch (error) {
    logger.error('Reverse geocoding failed:', error);
    throw error;
  }
}

async function getDirections(origin, destination, mode = 'driving') {
  try {
    const data = await googleMapsAdapter.directions(origin, destination, mode);
    
    if (data.status !== 'OK') {
      throw new Error(`Google Maps API error: ${data.status}`);
    }
    
    return data.routes[0];
  } catch (error) {
    logger.error('Directions request failed:', error);
    throw error;
  }
}

async function getPlaceDetails(placeId) {
  try {
    const data = await googleMapsAdapter.placeDetails(placeId);
    
    if (data.status !== 'OK') {
      throw new Error(`Google Maps API error: ${data.status}`);
    }
    
    return data.result;
  } catch (error) {
    logger.error('Place details request failed:', error);
    throw error;
  }
}

async function searchNearbyPlaces(lat, lng, radius = 1000, type = 'gas_station') {
  try {
    const data = await googleMapsAdapter.nearbySearch(lat, lng, radius, type);
    
    if (data.status !== 'OK') {
      throw new Error(`Google Maps API error: ${data.status}`);
    }
    
    return data.results;
  } catch (error) {
    logger.error('Nearby places search failed:', error);
    throw error;
  }
}

function isValidCoordinate(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function normalizeLocation(locationLike = {}) {
  const latitude = Number(
    locationLike.latitude ??
      locationLike.lat ??
      locationLike?.location?.latitude ??
      locationLike?.location?.lat
  );
  const longitude = Number(
    locationLike.longitude ??
      locationLike.lng ??
      locationLike?.location?.longitude ??
      locationLike?.location?.lng
  );
  if (!isValidCoordinate(latitude, -90, 90) || !isValidCoordinate(longitude, -180, 180)) {
    return null;
  }
  return { latitude, longitude };
}

async function searchNearbyByTypeV1(origin, includedType, radiusMeters = 5000, maxResultCount = 8) {
  const data = await googleMapsAdapter.nearbySearchV1({
      includedTypes: [includedType],
      maxResultCount,
      locationRestriction: {
        circle: {
          center: { latitude: origin.latitude, longitude: origin.longitude },
          radius: radiusMeters
        }
      }
  });
  return data.places || [];
}

function buildSafeStopCacheKey(origin) {
  const lat = Number(origin.latitude).toFixed(3);
  const lng = Number(origin.longitude).toFixed(3);
  return `safe_stop:ranked:${lat}:${lng}`;
}

function typePriorityScore(sourceType) {
  const scoreMap = {
    rest_stop: 0,
    gas_station: 1,
    convenience_store: 2,
    parking: 3
  };
  return scoreMap[sourceType] ?? 99;
}

function isPlaceOpenNow(place) {
  const openNow = place?.openNow ?? place?.currentOpeningHours?.openNow;
  return openNow !== false;
}

function isLikelyUnsafePlace(candidate) {
  const unsafeTypes = new Set(['liquor_store', 'night_club', 'casino', 'bar', 'adult_entertainment']);
  if ((candidate.types || []).some((t) => unsafeTypes.has(String(t)))) return true;
  const text = `${candidate.placeName || ''} ${candidate.address || ''}`.toLowerCase();
  const unsafeKeywords = ['liquor', 'casino', 'night club', 'adult'];
  return unsafeKeywords.some((kw) => text.includes(kw));
}

async function computeDrivingRoute(origin, destination) {
  if (!GOOGLE_MAPS_ROUTES_API_KEY) return null;
  const data = await googleMapsAdapter.computeRoutes({
      origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
      destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE'
  });
  const route = data?.routes?.[0];
  if (!route) return null;
  const durationSeconds = Number(String(route.duration || '0s').replace('s', '')) || null;
  return {
    distanceMeters: route.distanceMeters ?? null,
    durationSeconds
  };
}

function buildGoogleMapsUrl(lat, lng, placeId) {
  if (placeId) return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

async function findNearestSafeStop(locationLike, routePoints = []) {
  const origin = normalizeLocation(locationLike);
  if (!origin) {
    return { found: false, reason: 'invalid_location' };
  }

  const cacheKey = buildSafeStopCacheKey(origin);
  const cached = await cache.get(cacheKey);
  if (cached?.found && cached?.best) {
    return cached;
  }

  const preferredTypes = ['gas_station', 'rest_stop', 'parking', 'convenience_store'];
  const candidates = [];

  for (const type of preferredTypes) {
    try {
      const places = await searchNearbyByTypeV1(origin, type);
      for (const place of places) {
        if (!place?.location?.latitude || !place?.location?.longitude) continue;
        candidates.push({
          placeId: place.id,
          placeName: place.displayName?.text || 'Unknown stop',
          address: place.formattedAddress || '',
          latitude: place.location.latitude,
          longitude: place.location.longitude,
          types: place.types || [],
          rating: place.rating ?? null,
          sourceType: type,
          businessStatus: place.businessStatus || null,
          openNow: place?.currentOpeningHours?.openNow
        });
      }
    } catch (error) {
      logger.warn(`Nearby safe-stop search failed for type ${type}: ${error.message}`);
    }
  }

  if (candidates.length === 0) {
    return { found: false, reason: 'no_candidates' };
  }

  const uniqueById = new Map();
  candidates.forEach((candidate) => {
    if (!uniqueById.has(candidate.placeId)) uniqueById.set(candidate.placeId, candidate);
  });
  const uniqueCandidates = Array.from(uniqueById.values()).slice(0, 8);
  const filteredCandidates = uniqueCandidates.filter((candidate) => {
    if (candidate.businessStatus && candidate.businessStatus !== 'OPERATIONAL') return false;
    if (!isPlaceOpenNow(candidate)) return false;
    if (isLikelyUnsafePlace(candidate)) return false;
    return true;
  });

  if (filteredCandidates.length === 0) {
    return { found: false, reason: 'no_safe_open_candidates' };
  }

  const withRoutes = await Promise.all(
    filteredCandidates.map(async (candidate) => {
      const route = await computeDrivingRoute(origin, {
        latitude: candidate.latitude,
        longitude: candidate.longitude
      });
      return { ...candidate, route };
    })
  );

  withRoutes.sort((a, b) => {
    const aDuration = a.route?.durationSeconds ?? Number.MAX_SAFE_INTEGER;
    const bDuration = b.route?.durationSeconds ?? Number.MAX_SAFE_INTEGER;
    if (aDuration !== bDuration) return aDuration - bDuration;
    const aDistance = a.route?.distanceMeters ?? Number.MAX_SAFE_INTEGER;
    const bDistance = b.route?.distanceMeters ?? Number.MAX_SAFE_INTEGER;
    if (aDistance !== bDistance) return aDistance - bDistance;
    return typePriorityScore(a.sourceType) - typePriorityScore(b.sourceType);
  });

  const best = withRoutes[0];
  const suggestions = withRoutes.slice(0, 3).map((item) => ({
    placeName: item.placeName,
    address: item.address,
    latitude: item.latitude,
    longitude: item.longitude,
    placeId: item.placeId,
    distanceMeters: item.route?.distanceMeters ?? null,
    durationSeconds: item.route?.durationSeconds ?? null,
    googleMapsUrl: buildGoogleMapsUrl(item.latitude, item.longitude, item.placeId),
    sourceType: item.sourceType,
    rating: item.rating ?? null,
    openNow: item.openNow !== false
  }));

  const result = {
    found: true,
    best: {
      placeName: best.placeName,
      address: best.address,
      latitude: best.latitude,
      longitude: best.longitude,
      placeId: best.placeId,
      distanceMeters: best.route?.distanceMeters ?? null,
      durationSeconds: best.route?.durationSeconds ?? null,
      googleMapsUrl: buildGoogleMapsUrl(best.latitude, best.longitude, best.placeId),
      sourceType: best.sourceType,
      rating: best.rating ?? null,
      openNow: best.openNow !== false
    },
    suggestions,
    // Backward-compatible top-level fields
    placeName: best.placeName,
    address: best.address,
    latitude: best.latitude,
    longitude: best.longitude,
    placeId: best.placeId,
    distanceMeters: best.route?.distanceMeters ?? null,
    durationSeconds: best.route?.durationSeconds ?? null,
    googleMapsUrl: buildGoogleMapsUrl(best.latitude, best.longitude, best.placeId),
    sourceType: best.sourceType,
    routeAwareRanking: Boolean(best.route),
    routePointsUsed: Array.isArray(routePoints) ? routePoints.length : 0
  };

  await cache.set(cacheKey, result, 120);
  return result;
}

async function findNavigationLinks(latitude, longitude, keywords = []) {
  const location = normalizeLocation({ latitude, longitude });
  if (!location) return [];
  const stops = [];
  for (const keyword of keywords) {
    const mappedType =
      keyword.includes('gas') ? 'gas_station' :
      keyword.includes('rest') ? 'rest_stop' :
      keyword.includes('parking') ? 'parking' :
      'convenience_store';
    try {
      const places = await searchNearbyByTypeV1(location, mappedType, 5000, 3);
      const place = places[0];
      if (place?.location?.latitude && place?.location?.longitude) {
        stops.push({
          keyword,
          mappedType,
          placeName: place.displayName?.text || keyword,
          address: place.formattedAddress || '',
          latitude: place.location.latitude,
          longitude: place.location.longitude,
          placeId: place.id,
          googleMapsUrl: buildGoogleMapsUrl(place.location.latitude, place.location.longitude, place.id)
        });
      }
    } catch (error) {
      logger.warn(`findNavigationLinks keyword=${keyword} failed: ${error.message}`);
    }
  }
  return stops;
}

module.exports = {
  geocodeAddress,
  reverseGeocode,
  getDirections,
  getPlaceDetails,
  searchNearbyPlaces,
  findNearestSafeStop,
  findNavigationLinks,
  normalizeLocation,
};
