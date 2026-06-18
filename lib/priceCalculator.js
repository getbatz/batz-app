import { CONFIG } from './config';

export function calculateTaxiPrice(distanceMeters, isSuburb = false, suburbDistanceKm = 0) {
  let totalPrice;
  
  if (distanceMeters <= CONFIG.PRICING.INCLUDED_METERS) {
    totalPrice = CONFIG.PRICING.BASE_FARE;
  } else {
    const extraMeters = distanceMeters - CONFIG.PRICING.INCLUDED_METERS;
    const extraKm = extraMeters / 1000;
    totalPrice = CONFIG.PRICING.BASE_FARE + (extraKm * CONFIG.PRICING.PER_KM_RATE);
  }
  
  if (isSuburb) {
    totalPrice += (suburbDistanceKm * CONFIG.PRICING.SUBURB_SURCHARGE);
  }
  
  // Округление до 10 тенге
  return Math.round(totalPrice / 10) * 10;
}
