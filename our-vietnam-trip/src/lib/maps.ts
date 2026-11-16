import type { Place } from '../data/types';

/**
 * Official Google Maps URLs (https://developers.google.com/maps/documentation/urls).
 * They open the Google Maps app on iPhone and Android when installed,
 * or maps.google.com in the browser otherwise. No API key needed.
 */
export function mapsSearchUrl(p: Pick<Place, 'name' | 'address' | 'coords' | 'googlePlaceId'>): string {
  const params = new URLSearchParams({ api: '1' });
  // Name + address is the most robust query; place id makes it exact.
  const text = [p.name, p.address].filter(Boolean).join(', ');
  if (p.googlePlaceId) {
    params.set('query', text || `${p.coords?.lat},${p.coords?.lng}`);
    params.set('query_place_id', p.googlePlaceId);
  } else if (p.coords?.verified) {
    params.set('query', `${p.coords.lat},${p.coords.lng}`);
  } else {
    params.set('query', text);
  }
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

export function mapsDirectionsUrl(
  p: Pick<Place, 'name' | 'address' | 'coords' | 'googlePlaceId'>,
  travelmode?: 'driving' | 'walking' | 'transit' | 'bicycling',
): string {
  const params = new URLSearchParams({ api: '1' });
  if (p.coords?.verified) params.set('destination', `${p.coords.lat},${p.coords.lng}`);
  else params.set('destination', [p.name, p.address].filter(Boolean).join(', '));
  if (p.googlePlaceId) params.set('destination_place_id', p.googlePlaceId);
  if (travelmode) params.set('travelmode', travelmode);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
