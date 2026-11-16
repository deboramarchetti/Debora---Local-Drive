import type { Activity, Airport, Booking, City, Day, Flight, Hotel, ISODate, Period, Place, TripData } from './types';
import { daysBetween, minutesOf, periodOf } from '../lib/time';

export interface RouteStop {
  cityId: string;
  /** First and last date we are in this city (empty while provisional). */
  from?: ISODate;
  to?: ISODate;
  nights: number;
}

export interface TripModel extends TripData {
  city: (id?: string) => City | undefined;
  place: (id?: string) => Place | undefined;
  hotel: (id?: string) => Hotel | undefined;
  flight: (id?: string) => Flight | undefined;
  booking: (id?: string) => Booking | undefined;
  airport: (code?: string) => Airport | undefined;
  day: (date?: string) => Day | undefined;
  dayIndex: (date: ISODate) => number;
  /** Ordered city stops derived from the days. */
  route: RouteStop[];
  /** true when the route is just the planned city list (no days assigned yet). */
  routeProvisional: boolean;
  /** Activities sorted chronologically and grouped by period. */
  schedule: (day: Day) => { period: Period | 'anytime'; items: Activity[] }[];
  /** Dates each city appears on. */
  datesForCity: (cityId: string) => ISODate[];
  /** Dates a place is used on (activities, hotels, bookings). */
  datesForPlace: (placeId: string) => ISODate[];
}

const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));

export function buildModel(data: TripData): TripModel {
  const cities = byId(data.cities);
  const places = byId(data.places);
  const hotels = byId(data.hotels);
  const flights = byId(data.flights);
  const bookings = byId(data.bookings);
  const airports = new Map(data.airports.map((a) => [a.code, a]));
  const days = new Map(data.days.map((d) => [d.date, d]));
  const dayOrder = data.days.map((d) => d.date);

  // Route: collapse consecutive city appearances across days.
  const route: RouteStop[] = [];
  for (const d of data.days) {
    for (const cid of d.cityIds) {
      const last = route[route.length - 1];
      if (last && last.cityId === cid) last.to = d.date;
      else route.push({ cityId: cid, from: d.date, to: d.date, nights: 0 });
    }
  }
  // Nights = number of days whose hotel is in that city during the stop.
  for (const stop of route) {
    stop.nights = data.days.filter((d) => {
      if (!stop.from || !stop.to || d.date < stop.from || d.date > stop.to) return false;
      const h = d.hotelId ? hotels.get(d.hotelId) : undefined;
      const hp = h ? places.get(h.placeId) : undefined;
      return hp?.cityId === stop.cityId;
    }).length;
  }
  const routeProvisional = route.length === 0;
  const finalRoute = routeProvisional ? data.cities.map((c) => ({ cityId: c.id, nights: 0 })) : route;

  const placeDates = new Map<string, Set<ISODate>>();
  const addPlaceDate = (pid: string | undefined, date: ISODate) => {
    if (!pid) return;
    if (!placeDates.has(pid)) placeDates.set(pid, new Set());
    placeDates.get(pid)!.add(date);
  };
  for (const d of data.days) {
    for (const a of d.activities) addPlaceDate(a.placeId, d.date);
    if (d.hotelId) addPlaceDate(hotels.get(d.hotelId)?.placeId, d.date);
  }
  for (const b of data.bookings) {
    addPlaceDate(b.meetingPlaceId, b.date);
    addPlaceDate(b.fromPlaceId, b.date);
    addPlaceDate(b.toPlaceId, b.date);
  }

  return {
    ...data,
    city: (id) => (id ? cities.get(id) : undefined),
    place: (id) => (id ? places.get(id) : undefined),
    hotel: (id) => (id ? hotels.get(id) : undefined),
    flight: (id) => (id ? flights.get(id) : undefined),
    booking: (id) => (id ? bookings.get(id) : undefined),
    airport: (code) => (code ? airports.get(code) : undefined),
    day: (date) => (date ? days.get(date) : undefined),
    dayIndex: (date) => dayOrder.indexOf(date),
    route: finalRoute,
    routeProvisional,
    schedule: (day) => {
      // Group by period (stable), then sort the timed items among themselves;
      // untimed items keep the position they have in the itinerary.
      const byPeriod = [...day.activities].sort(
        (a, b) => periodRank(periodOf(a.time, a.period)) - periodRank(periodOf(b.time, b.period)),
      );
      const sorted: Activity[] = [];
      for (const rank of [0, 1, 2, 3]) {
        const g = byPeriod.filter((a) => periodRank(periodOf(a.time, a.period)) === rank);
        const timed = g.filter((a) => a.time).sort((a, b) => minutesOf(a.time)! - minutesOf(b.time)!);
        sorted.push(...g.map((a) => (a.time ? timed.shift()! : a)));
      }
      const groups: { period: Period | 'anytime'; items: Activity[] }[] = [];
      for (const a of sorted) {
        const p = periodOf(a.time, a.period) ?? 'anytime';
        const g = groups[groups.length - 1];
        if (g && g.period === p) g.items.push(a);
        else groups.push({ period: p, items: [a] });
      }
      return groups;
    },
    datesForCity: (cityId) => data.days.filter((d) => d.cityIds.includes(cityId)).map((d) => d.date),
    datesForPlace: (placeId) => [...(placeDates.get(placeId) ?? [])].sort(),
  };
}

const periodRank = (p?: Period) => (p === 'morning' ? 1 : p === 'afternoon' ? 2 : p === 'evening' ? 3 : 0);

/** Where are we relative to the trip? */
export type TripPhase =
  | { kind: 'before'; daysToGo: number }
  | { kind: 'during'; date: ISODate; dayNumber: number }
  | { kind: 'after' };

export function tripPhase(model: TripModel, today: ISODate): TripPhase {
  const { startDate, endDate } = model.trip;
  if (today < startDate) return { kind: 'before', daysToGo: daysBetween(today, startDate) };
  if (today > endDate) return { kind: 'after' };
  return { kind: 'during', date: today, dayNumber: daysBetween(startDate, today) + 1 };
}

export const dayNumber = (model: TripModel, date: ISODate) => daysBetween(model.trip.startDate, date) + 1;
