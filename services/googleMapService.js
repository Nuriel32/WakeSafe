const axios = require('axios');

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Search for places by keyword and create Google Maps navigation links
 * @param {number} latitude
 * @param {number} longitude
 * @param {string[]} keywords
 * @returns {Promise<Array<{name: string, link: string}>>}
 */
exports.findNavigationLinks = async (latitude, longitude, keywords) => {
    const destinations = [];

    for (const keyword of keywords) {
        const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=5000&keyword=${encodeURIComponent(keyword)}&key=${GOOGLE_API_KEY}`;
        console.log('Fetching from Google Maps:', url);
        const response = await axios.get(url);
        const results = response.data.results;

        if (results.length > 0) {
            const place = results[0];
            const destinationCoords = `${place.geometry.location.lat},${place.geometry.location.lng}`;
            const mapsLink = `https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${destinationCoords}&travelmode=driving`;

            destinations.push({
                name: place.name,
                link: mapsLink
            });
        }
    }

    return destinations;
};
