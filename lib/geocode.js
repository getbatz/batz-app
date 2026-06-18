import axios from 'axios';

export async function searchAddress(query, lat, lng) {
  if (!query || query.length < 3) return [];
  
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: query,
        format: 'json',
        addressdetails: 1,
        countrycodes: 'kz',
        limit: 5,
      },
      headers: {
        'Accept-Language': 'ru',
      }
    });
    
    return response.data.map(item => ({
      display_name: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      type: item.type,
      importance: item.importance,
    }));
  } catch (error) {
    console.error('Geocoding error:', error);
    return [];
  }
}

export function isInServiceArea(lat, lng) {
  const { BOUNDING_BOX } = require('./config').CONFIG;
  return (
    lat >= BOUNDING_BOX.south &&
    lat <= BOUNDING_BOX.north &&
    lng >= BOUNDING_BOX.west &&
    lng <= BOUNDING_BOX.east
  );
}
