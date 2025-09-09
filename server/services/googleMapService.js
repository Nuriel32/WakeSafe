const logger = require('../utils/logger');

// Google Maps Service for WakeSafe
// This service handles Google Maps API operations for location services

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function geocodeAddress(address) {
  try {
    if (!GOOGLE_MAPS_API_KEY) {
      throw new Error('GOOGLE_MAPS_API_KEY environment variable is not set');
    }
    
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`
    );
    
    if (!response.ok) {
      throw new Error(`Google Maps API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
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
    if (!GOOGLE_MAPS_API_KEY) {
      throw new Error('GOOGLE_MAPS_API_KEY environment variable is not set');
    }
    
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
    );
    
    if (!response.ok) {
      throw new Error(`Google Maps API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
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
    if (!GOOGLE_MAPS_API_KEY) {
      throw new Error('GOOGLE_MAPS_API_KEY environment variable is not set');
    }
    
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${mode}&key=${GOOGLE_MAPS_API_KEY}`
    );
    
    if (!response.ok) {
      throw new Error(`Google Maps API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
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
    if (!GOOGLE_MAPS_API_KEY) {
      throw new Error('GOOGLE_MAPS_API_KEY environment variable is not set');
    }
    
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${GOOGLE_MAPS_API_KEY}`
    );
    
    if (!response.ok) {
      throw new Error(`Google Maps API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
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
    if (!GOOGLE_MAPS_API_KEY) {
      throw new Error('GOOGLE_MAPS_API_KEY environment variable is not set');
    }
    
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${GOOGLE_MAPS_API_KEY}`
    );
    
    if (!response.ok) {
      throw new Error(`Google Maps API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status !== 'OK') {
      throw new Error(`Google Maps API error: ${data.status}`);
    }
    
    return data.results;
  } catch (error) {
    logger.error('Nearby places search failed:', error);
    throw error;
  }
}

module.exports = {
  geocodeAddress,
  reverseGeocode,
  getDirections,
  getPlaceDetails,
  searchNearbyPlaces,
};
