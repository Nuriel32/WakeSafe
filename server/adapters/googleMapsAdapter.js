const { get, post } = require('./httpClient');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_ROUTES_API_KEY = process.env.GOOGLE_MAPS_ROUTES_API_KEY || GOOGLE_MAPS_API_KEY;

function requireKey() {
  if (!GOOGLE_MAPS_API_KEY) throw new Error('GOOGLE_MAPS_API_KEY environment variable is not set');
}

async function geocode(address) {
  requireKey();
  return get(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`,
    {},
    { service: 'google_maps', maxRetries: 2 }
  );
}

async function reverseGeocode(lat, lng) {
  requireKey();
  return get(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`,
    {},
    { service: 'google_maps', maxRetries: 2 }
  );
}

async function directions(origin, destination, mode = 'driving') {
  requireKey();
  return get(
    `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${mode}&key=${GOOGLE_MAPS_API_KEY}`,
    {},
    { service: 'google_maps', maxRetries: 2 }
  );
}

async function placeDetails(placeId) {
  requireKey();
  return get(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${GOOGLE_MAPS_API_KEY}`,
    {},
    { service: 'google_maps', maxRetries: 2 }
  );
}

async function nearbySearch(lat, lng, radius = 1000, type = 'gas_station') {
  requireKey();
  return get(
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${GOOGLE_MAPS_API_KEY}`,
    {},
    { service: 'google_maps', maxRetries: 2 }
  );
}

async function nearbySearchV1(payload) {
  requireKey();
  return post(
    'https://places.googleapis.com/v1/places:searchNearby',
    payload,
    {
      headers: {
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.businessStatus,places.currentOpeningHours.openNow',
      },
    },
    { service: 'google_places', maxRetries: 2 }
  );
}

async function computeRoutes(payload) {
  if (!GOOGLE_MAPS_ROUTES_API_KEY) return null;
  return post(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    payload,
    {
      headers: {
        'X-Goog-Api-Key': GOOGLE_MAPS_ROUTES_API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
      },
    },
    { service: 'google_routes', maxRetries: 2 }
  );
}

module.exports = {
  geocode,
  reverseGeocode,
  directions,
  placeDetails,
  nearbySearch,
  nearbySearchV1,
  computeRoutes,
};
