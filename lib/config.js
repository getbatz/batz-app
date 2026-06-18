export const CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  TELEGRAM_BOT_TOKEN: process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN,
  DEFAULT_LAT: parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LAT || '52.48945'),
  DEFAULT_LNG: parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LNG || '78.16120'),
  BOUNDING_BOX: {
    north: 53.5,
    south: 52.5,
    east: 78.5,
    west: 77.8,
  },
  PRICING: {
    BASE_FARE: 250,
    INCLUDED_METERS: 1200,
    PER_KM_RATE: 90,
    SUBURB_SURCHARGE: 100,
  },
};
