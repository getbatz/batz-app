import axios from 'axios';
import { CONFIG } from './config';

const SHARBAKTY_COORDS = { lat: 52.48945, lng: 78.16120 };
const SERVICE_VILLAGES = [
  'Шарбакты', 'Александровка', 'Жанааул', 'Алексеевка', 'Куркамыс', 'Николаевка', 'Бориктал',
  'Арбигень', 'Ботабас', 'Галкино', 'Кулат', 'Маралды', 'Малиновка', 'Орловка', 'Сахновка',
  'Сугур', 'Северное', 'Заборовка', 'Сосновка', 'Софиевка', 'Сретенка', 'Татьяновка',
  'Богодаровка', 'Хмельницкое', 'Есильбай', 'Шалдай', 'Чигириновка', 'Жылыбулак',
];
const POI_TERMS = ['Школа', 'Больница', 'Аптека', 'Магазин', 'Кафе', 'АЗС', 'Церковь'];

export async function searchAddress(query, lang = 'ru') {
  if (!query || query.trim().length < 3) return [];

  const isSharBaktySearch = query.toLowerCase().includes('шарбак') || query.toLowerCase().startsWith('шар');
  const containsVillage = SERVICE_VILLAGES.some((v) => query.toLowerCase().includes(v.toLowerCase()));
  const isPoiQuery = POI_TERMS.some((term) => query.toLowerCase().includes(term.toLowerCase()));

  const q = isSharBaktySearch && !containsVillage ? `${query} Шарбакты` : query;

  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q,
        format: 'json',
        addressdetails: 1,
        countrycodes: 'kz',
        limit: 8,
      },
      headers: {
        'Accept-Language': lang,
        'User-Agent': 'BATZ-Taxi-WebApp/1.0 (+https://t.me/yourbot)',
      },
    });

    return response.data
      .filter((item) => item.display_name)
      .map((item) => ({
        display_name: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        type: item.type,
        importance: item.importance,
      }))
      .sort((a, b) => {
        const aShar = a.display_name.includes('Шарбакты') ? 0 : 1;
        const bShar = b.display_name.includes('Шарбакты') ? 0 : 1;
        return aShar - bShar || (b.importance - a.importance);
      });
  } catch (error) {
    console.error('Geocoding error:', error);
    return [];
  }
}

export function isInServiceArea(lat, lng) {
  return (
    lat >= CONFIG.BOUNDING_BOX.south &&
    lat <= CONFIG.BOUNDING_BOX.north &&
    lng >= CONFIG.BOUNDING_BOX.west &&
    lng <= CONFIG.BOUNDING_BOX.east
  );
}

export function isSuburbArea(fromCoords, toCoords) {
  const inCenterFrom = Math.abs(fromCoords.lat - SHARBAKTY_COORDS.lat) < 0.2 && Math.abs(fromCoords.lng - SHARBAKTY_COORDS.lng) < 0.2;
  const inCenterTo = Math.abs(toCoords.lat - SHARBAKTY_COORDS.lat) < 0.2 && Math.abs(toCoords.lng - SHARBAKTY_COORDS.lng) < 0.2;
  return !inCenterFrom || !inCenterTo;
}
