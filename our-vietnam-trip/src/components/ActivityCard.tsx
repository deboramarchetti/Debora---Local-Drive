import { Bed, Car, Clock, Star, Coffee, Info, LogIn, LogOut, MapPin, Plane, Route, StickyNote, Sun, Utensils } from 'lucide-react';
import { model } from '../data';
import type { Activity, ActivityKind } from '../data/types';
import { fmtDuration } from '../lib/time';
import { BOOKING_ICON, BookingCard, FlightCard, PrivateInfo } from './Reservations';
import { MapsButton, Row, StatusBadge } from './ui';

const KIND_ICON: Record<ActivityKind, typeof Sun> = {
  activity: Sun, meal: Utensils, flight: Plane, transfer: Car, 'check-in': LogIn, 'check-out': LogOut, 'free-time': Coffee, note: StickyNote,
};

/**
 * One item of the day's schedule. Only fields that exist are rendered.
 * Confirmed fixed-time items (flights, bookings) get the strongest emphasis.
 */
export function ActivityCard({ a, isLast }: { a: Activity; isLast: boolean }) {
  const place = model.place(a.placeId);
  const flight = model.flight(a.flightId);
  const booking = model.booking(a.bookingId);
  const hotel = model.hotel(a.hotelId);
  const Icon = booking ? BOOKING_ICON[booking.kind] : KIND_ICON[a.kind];
  const fixed = a.status === 'confirmed' && !!a.time;
  const travel = a.kind === 'flight' || a.kind === 'transfer';
  const dur = fmtDuration(a.durationMin ?? booking?.durationMin);

  return (
    <li className="relative grid grid-cols-[52px_1fr] gap-3">
      {/* time rail */}
      <div className="relative flex flex-col items-center">
        <div className={`text-[13px] font-semibold tabular-nums ${fixed ? 'text-lacquer' : 'text-ink-2'}`}>{a.time ?? ''}</div>
        <div className={`mt-1 grid h-8 w-8 place-items-center rounded-full ${fixed ? 'bg-lacquer text-white' : travel ? 'bg-jade-soft text-jade' : 'bg-card text-ink-2 shadow-sm'}`}>
          <Icon size={15} aria-hidden />
        </div>
        {!isLast && <div className="mt-1 w-px flex-1 bg-line" />}
      </div>

      <div className="min-w-0 pb-5">
        <div className={`overflow-hidden rounded-[var(--radius-card)] ${fixed ? 'bg-card shadow-[var(--shadow-lift)] ring-1 ring-lacquer/15' : 'card'}`}>
          {(a.photo ?? place?.photo) && (
            <img src={(a.photo ?? place!.photo)!.src} alt={(a.photo ?? place!.photo)!.alt} className="h-36 w-full object-cover" loading="lazy" decoding="async" />
          )}
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display text-[18px] font-medium leading-snug">
                {a.title}
                {a.highlight && <Star size={14} className="ml-1.5 inline -translate-y-0.5 fill-gold text-gold" aria-label="Destaque da viagem" />}
              </h3>
              <StatusBadge status={a.status} compact={a.status === 'suggestion'} />
            </div>
            {(a.endTime || dur) && (
              <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
                <Clock size={12} aria-hidden />
                {a.time && a.endTime ? `${a.time}–${a.endTime}` : ''}
                {a.endTime && dur ? ' · ' : ''}
                {dur && `~${dur}`}
              </div>
            )}
            {a.description && <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{a.description}</p>}
            {!a.description && place?.description && <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{place.description}</p>}

            <div className="mt-3 space-y-2 empty:hidden">
              {place?.address && <Row icon={MapPin}>{place.name !== a.title && <span className="text-ink">{place.name} · </span>}{place.address}</Row>}
              {!place?.address && place && place.name !== a.title && <Row icon={MapPin}>{place.name}</Row>}
              {a.transport && <Row icon={Route}>{a.transport}</Row>}
              {a.notes && <Row icon={Info}>{a.notes}</Row>}
              {hotel && a.kind !== 'check-in' && a.kind !== 'check-out' && <Row icon={Bed}>{model.place(hotel.placeId)?.name}</Row>}
            </div>

            {flight && <div className="mt-3"><FlightCard flight={flight} compact /></div>}
            {booking && <div className="mt-3"><BookingCard booking={booking} /></div>}
            {hotel && (a.kind === 'check-in' || a.kind === 'check-out') && <div className="mt-3"><PrivateInfo id={hotel.id} /></div>}

            {place && booking?.meetingPlaceId !== place.id && (
              <div className="mt-3 flex flex-wrap gap-2">
                <MapsButton place={place} />
                <MapsButton place={place} label="Como chegar" variant="ghost" directions />
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
