/**
 * Our Vietnam Trip — data model.
 *
 * Conventions
 * - Dates are ISO calendar dates ("2026-11-23") and times are local wall-clock
 *   times ("14:30") at the place where they happen. Nothing is converted:
 *   the app shows exactly what the booking says.
 * - Every entity has a stable `id` (kebab-case). Other entities reference it
 *   instead of repeating data (a hotel used for 3 nights is registered once).
 * - Anything unknown is simply omitted (optional field). The UI never shows
 *   empty fields. Never fill a field with a guess.
 * - Sensitive values (booking codes, ticket numbers, phones) do NOT live here.
 *   They go to private/private.json → encrypted into src/data/private.enc.json
 *   and are keyed by the same entity ids. See README.
 */

export type ISODate = string; // YYYY-MM-DD
export type LocalTime = string; // HH:mm (24h, local time of the place)
export type IanaTimeZone = string; // e.g. "Asia/Ho_Chi_Minh"

/** confirmed = booked / fixed time · suggestion = idea, flexible · pending = waiting for data */
export type Status = 'confirmed' | 'suggestion' | 'pending';

export interface Coordinates {
  lat: number;
  lng: number;
  /** true only when checked against the booking / Google Maps. */
  verified: boolean;
}

export interface Photo {
  /** Local file under /public/photos (precached for offline use). */
  src: string;
  alt: string;
  credit?: string;
  /** CSS object-position, e.g. "50% 30%". */
  focus?: string;
}

export interface Trip {
  id: string;
  title: string;
  subtitle?: string;
  /** First and last day shown in the app (inclusive), including travel days. */
  startDate: ISODate;
  endDate: ISODate;
  /** false while dates are still approximate. */
  datesConfirmed: boolean;
  /** Reference time zone for "today" detection. */
  timeZone: IanaTimeZone;
  coverPhoto?: Photo;
  travelers?: Traveler[];
  /** 'placeholder' until the real itinerary has been imported. */
  dataStatus: 'placeholder' | 'imported';
  /** Free text shown on the overview (optional). */
  intro?: string;
}

export interface Traveler {
  id: string;
  name: string;
}

export interface City {
  id: string;
  name: string;
  /** Vietnamese spelling, e.g. "Hà Nội". */
  localName?: string;
  region?: string;
  /** City centre — used only for the overview map. */
  coords: Coordinates;
  photo?: Photo;
  tagline?: string;
  /** Hue of the generated cover art when there is no photo (0–360). */
  artHue?: number;
  /** Which side of the dot the label goes on in the overview map. */
  mapLabel?: 'left' | 'right';
}

export type PlaceKind =
  | 'attraction'
  | 'restaurant'
  | 'cafe'
  | 'hotel'
  | 'airport'
  | 'station'
  | 'pier'
  | 'market'
  | 'shopping'
  | 'meeting-point'
  | 'other';

export interface Place {
  id: string;
  name: string;
  localName?: string;
  cityId: string;
  kind: PlaceKind;
  address?: string;
  coords?: Coordinates;
  /** Google Maps place id, when known — makes the Maps link exact. */
  googlePlaceId?: string;
  description?: string;
  photo?: Photo;
  notes?: string;
}

export interface Hotel {
  id: string;
  placeId: string; // name, address, coords live on the Place
  checkIn: ISODate;
  checkOut: ISODate;
  checkInTime?: LocalTime;
  checkOutTime?: LocalTime;
  roomType?: string;
  bookedVia?: string;
  status: Status;
  notes?: string;
}

export interface Airport {
  code: string; // IATA
  name: string;
  city: string;
  timeZone: IanaTimeZone;
  /** Optional Place for the Maps link. */
  placeId?: string;
}

export interface Flight {
  id: string;
  airline: string;
  flightNumber: string;
  from: string; // Airport code
  to: string; // Airport code
  departDate: ISODate;
  departTime?: LocalTime; // local at origin
  arriveDate?: ISODate;
  arriveTime?: LocalTime; // local at destination
  departTerminal?: string;
  arriveTerminal?: string;
  baggage?: string;
  status: Status;
  notes?: string;
}

export type BookingKind = 'transfer' | 'train' | 'bus' | 'boat' | 'cruise' | 'car' | 'tour' | 'ticket' | 'restaurant' | 'other';

/** Transports, tours, tickets and restaurant reservations. */
export interface Booking {
  id: string;
  kind: BookingKind;
  title: string;
  provider?: string;
  date: ISODate;
  time?: LocalTime;
  endDate?: ISODate;
  endTime?: LocalTime;
  fromPlaceId?: string;
  toPlaceId?: string;
  meetingPlaceId?: string;
  meetingPoint?: string; // free text when there is no Place
  durationMin?: number;
  instructions?: string;
  status: Status;
  notes?: string;
}

export type Period = 'morning' | 'afternoon' | 'evening';

export type ActivityKind =
  | 'activity'
  | 'meal'
  | 'flight'
  | 'transfer'
  | 'check-in'
  | 'check-out'
  | 'free-time'
  | 'note';

export interface Activity {
  id: string;
  kind: ActivityKind;
  title: string;
  time?: LocalTime;
  endTime?: LocalTime;
  /** Used when there is no exact time. Derived from `time` otherwise. */
  period?: Period;
  description?: string;
  placeId?: string;
  durationMin?: number;
  photo?: Photo;
  /** How to get there ("Grab ~15 min", "a pé 10 min"...). */
  transport?: string;
  notes?: string;
  status: Status;
  /** Links to reservations — their details are shown on the card. */
  flightId?: string;
  bookingId?: string;
  hotelId?: string;
}

export interface Day {
  date: ISODate;
  /** Cities of the day, in order. Two or more = travel day. */
  cityIds: string[];
  title?: string;
  summary?: string;
  photo?: Photo;
  /** Hotel where we sleep that night (omit on overnight flights). */
  hotelId?: string;
  activities: Activity[];
}

export interface TripData {
  trip: Trip;
  cities: City[];
  places: Place[];
  hotels: Hotel[];
  airports: Airport[];
  flights: Flight[];
  bookings: Booking[];
  days: Day[];
}

/** Decrypted private data, keyed by entity id (flight / hotel / booking id). */
export interface PrivateEntry {
  bookingRef?: string;
  ticketNumbers?: string[];
  contact?: string;
  phone?: string;
  email?: string;
  notes?: string;
}
export type PrivateData = Record<string, PrivateEntry>;
