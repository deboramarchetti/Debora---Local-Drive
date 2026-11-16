import type { City, Day, ISODate, TripData } from './types';

/**
 * ============================================================
 *  SOURCE OF TRUTH — the real itinerary goes here (Stage 2).
 * ============================================================
 * Status: PLACEHOLDER. Only facts already given by the travellers are
 * filled in (destination, approximate period, planned cities). No hotels,
 * flights, bookings, times or activities were invented.
 */

// Planned destinations (order still provisional until the itinerary arrives).
// Coordinates are city centres, used only to draw the overview map.
const cities: City[] = [
  { id: 'hanoi', name: 'Hanói', localName: 'Hà Nội', region: 'Norte', coords: { lat: 21.0285, lng: 105.8542, verified: false }, artHue: 8, mapLabel: 'left' },
  { id: 'ninh-binh', name: 'Ninh Binh', localName: 'Ninh Bình', region: 'Norte', coords: { lat: 20.2506, lng: 105.9745, verified: false }, artHue: 150, mapLabel: 'left' },
  { id: 'ha-long', name: 'Ha Long Bay', localName: 'Vịnh Hạ Long', region: 'Norte', coords: { lat: 20.9101, lng: 107.1839, verified: false }, artHue: 185 },
  { id: 'hoi-an', name: 'Hoi An', localName: 'Hội An', region: 'Centro', coords: { lat: 15.8801, lng: 108.338, verified: false }, artHue: 38 },
  { id: 'hue', name: 'Hue', localName: 'Huế', region: 'Centro', coords: { lat: 16.4637, lng: 107.5909, verified: false }, artHue: 280, mapLabel: 'left' },
  { id: 'ho-chi-minh', name: 'Ho Chi Minh City', localName: 'Thành phố Hồ Chí Minh', region: 'Sul', coords: { lat: 10.7769, lng: 106.7009, verified: false }, artHue: 345 },
];

/** Creates empty day shells for the approximate period (to be replaced). */
function emptyDays(start: ISODate, end: ISODate): Day[] {
  const days: Day[] = [];
  const d = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');
  while (d <= last) {
    days.push({ date: d.toISOString().slice(0, 10), cityIds: [], activities: [] });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

export const tripData: TripData = {
  trip: {
    id: 'vietnam-2026',
    title: 'Our Vietnam Trip',
    subtitle: 'Vietnã · 2026',
    startDate: '2026-11-23',
    endDate: '2026-12-06',
    datesConfirmed: false,
    timeZone: 'Asia/Ho_Chi_Minh',
    dataStatus: 'placeholder',
  },
  cities,
  places: [],
  hotels: [],
  airports: [],
  flights: [],
  bookings: [],
  days: emptyDays('2026-11-23', '2026-12-06'),
};
