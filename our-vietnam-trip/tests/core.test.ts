import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, fmtDuration, nowTimeIn, periodOf, todayIn, zonedInstant } from '../src/lib/time';
import { mapsDirectionsUrl, mapsSearchUrl } from '../src/lib/maps';
import { validateTrip } from '../src/data/validate';
import { buildModel, tripPhase } from '../src/data/model';
import { tripData } from '../src/data/trip';
import { sampleData } from '../src/data/sample';
import { decryptPrivate } from '../src/lib/crypto';

describe('Vietnam time', () => {
  it('uses UTC+7 for "today" regardless of device zone', () => {
    // 2026-11-23 18:30 UTC = 2026-11-24 01:30 in Vietnam
    const t = new Date('2026-11-23T18:30:00Z');
    expect(todayIn('Asia/Ho_Chi_Minh', t)).toBe('2026-11-24');
    expect(nowTimeIn('Asia/Ho_Chi_Minh', t)).toBe('01:30');
    expect(todayIn('America/Sao_Paulo', t)).toBe('2026-11-23');
  });
  it('date math', () => {
    expect(daysBetween('2026-11-23', '2026-12-06')).toBe(13);
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(periodOf('11:59')).toBe('morning');
    expect(periodOf('12:00')).toBe('afternoon');
    expect(periodOf('18:00')).toBe('evening');
    expect(fmtDuration(90)).toBe('1h30');
  });
  it('zonedInstant resolves local wall-clock times', () => {
    expect(new Date(zonedInstant('2026-11-23', '08:40', 'Asia/Ho_Chi_Minh')).toISOString()).toBe('2026-11-23T01:40:00.000Z');
    expect(new Date(zonedInstant('2026-11-22', '01:10', 'America/Sao_Paulo')).toISOString()).toBe('2026-11-22T04:10:00.000Z');
  });
});

describe('Google Maps URLs', () => {
  it('uses the official api=1 search URL with name + address', () => {
    const u = new URL(mapsSearchUrl({ name: 'Hoan Kiem Lake', address: 'Hà Nội' }));
    expect(u.origin + u.pathname).toBe('https://www.google.com/maps/search/');
    expect(u.searchParams.get('api')).toBe('1');
    expect(u.searchParams.get('query')).toBe('Hoan Kiem Lake, Hà Nội');
  });
  it('prefers place id, then verified coordinates', () => {
    const u = new URL(mapsSearchUrl({ name: 'X', googlePlaceId: 'ChIJ123' }));
    expect(u.searchParams.get('query_place_id')).toBe('ChIJ123');
    const c = new URL(mapsSearchUrl({ name: 'X', coords: { lat: 21.02, lng: 105.85, verified: true } }));
    expect(c.searchParams.get('query')).toBe('21.02,105.85');
    const q = new URL(mapsSearchUrl({ name: 'Oriental Jade', mapsQuery: 'The Oriental Jade Hotel, Hanoi' }));
    expect(q.searchParams.get('query')).toBe('The Oriental Jade Hotel, Hanoi');
    const d = new URL(mapsDirectionsUrl({ name: 'X', address: 'Y' }, 'walking'));
    expect(d.searchParams.get('destination')).toBe('X, Y');
    expect(d.searchParams.get('travelmode')).toBe('walking');
  });
});

describe('itinerary data', () => {
  it('real trip has no errors and one page per day', () => {
    expect(tripData.trip.dataStatus).toBe('imported');
    expect(validateTrip(tripData).filter((i) => i.level === 'error')).toEqual([]);
    expect(tripData.days.length).toBe(14);
    expect(tripData.days[0].date).toBe('2026-11-23');
    expect(tripData.days.at(-1)!.date).toBe('2026-12-06');
  });
  it('import matches the source documents', () => {
    const m = buildModel(tripData);
    // Route order (doc "Rota")
    expect(m.route.map((r) => r.cityId)).toEqual(['hanoi', 'ninh-binh', 'ha-long', 'hoi-an', 'hue', 'ho-chi-minh']);
    // Nights (doc "Resumo de noites"; HCMC hotel not booked yet → 0 booked nights)
    expect(Object.fromEntries(m.route.map((r) => [r.cityId, r.nights]))).toEqual({ hanoi: 2, 'ninh-binh': 2, 'ha-long': 1, 'hoi-an': 3, hue: 1, 'ho-chi-minh': 0 });
    expect(m.days.filter((d) => d.date >= '2026-12-02' && d.date <= '2026-12-05').every((d) => !d.hotelId && d.stayNote)).toBe(true);
    // Flights (sheet "Calendar" + doc)
    const f = (id: string) => m.flight(id)!;
    expect([f('gru-doh').departTime, f('gru-doh').arriveDate, f('gru-doh').arriveTime]).toEqual(['20:25', '2026-11-21', '16:00']);
    expect([f('doh-han').departTime, f('doh-han').arriveTime]).toEqual(['01:50', '12:20']);
    expect([f('hph-dad').departDate, f('hph-dad').departTime, f('hph-dad').arriveTime]).toEqual(['2026-11-28', '16:15', '17:30']);
    expect([f('sgn-doh').departTime, f('sgn-doh').arriveTime]).toEqual(['19:40', '23:40']);
    expect([f('doh-gru').departDate, f('doh-gru').departTime, f('doh-gru').arriveTime]).toEqual(['2026-12-07', '00:25', '09:30']);
    expect(f('hui-sgn').departTime).toBeUndefined();
    // Qatar confirmations
    expect(['gru-doh', 'doh-han', 'sgn-doh', 'doh-gru'].map((id) => f(id).flightNumber)).toEqual(['QR 780', 'QR 976', 'QR 971', 'QR 785']);
    expect([f('doh-han').arriveTerminal, f('sgn-doh').departTerminal]).toEqual(['2', '2']);
    // Nothing invented: only addresses that came from a confirmation; no codes in public data
    expect(m.places.filter((p) => p.address).map((p) => p.id)).toEqual(['millennium-plaza-doha']);
    expect(f('hph-dad').flightNumber).toBeUndefined();
    expect(JSON.stringify(tripData)).not.toMatch(/7HD4WN|7HQJVM|QZ1Z5BDQ|157214|873403289/);
    // Doha stopover is not part of the Vietnam route
    expect(m.route.some((r) => r.cityId === 'doha')).toBe(false);
    // Only bookings marked RESERVADO are confirmed hotels
    expect(m.hotels.map((h) => h.placeId)).toEqual(['millennium-plaza-doha', 'oriental-jade', 'la-lua', 'orchid-cruise', 'little-riverside', 'melia-vinpearl-hue']);
    expect(m.bookings.every((b) => b.status === 'pending')).toBe(true);
  });
  it('day 6 schedule keeps transfer before the 16:15 flight', () => {
    const m = buildModel(tripData);
    const afternoon = m.schedule(m.day('2026-11-28')!).find((g) => g.period === 'afternoon')!.items.map((a) => a.id);
    expect(afternoon).toEqual(['d6-transfer-hph', 'd6-flight']);
  });
  it('sample validates', () => {
    expect(validateTrip(sampleData).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('validator catches broken references and time-zone impossible flights', () => {
    const bad = structuredClone(sampleData);
    bad.days[0].activities[0].placeId = 'nope';
    bad.flights[0].departTime = '23:10'; // would arrive before departing
    const errs = validateTrip(bad).filter((i) => i.level === 'error').map((i) => i.message).join('\n');
    expect(errs).toMatch(/unknown placeId "nope"/);
    expect(errs).toMatch(/arrival is before departure/);
  });
  it('model derives route, schedule order and trip phase', () => {
    const m = buildModel(sampleData);
    expect(m.route.map((r) => r.cityId)).toEqual(['hanoi', 'ninh-binh']);
    expect(m.route[0].nights).toBe(2);
    const order = m.schedule(m.day('2026-11-23')!).flatMap((g) => g.items.map((a) => a.time));
    expect(order).toEqual(['08:40', '09:15', '14:00', '16:30', '19:30']);
    expect(tripPhase(m, '2026-11-16')).toEqual({ kind: 'before', daysToGo: 7 });
    expect(m.route.map((r) => r.cityId)).toEqual(['hanoi', 'ninh-binh']);
    expect(tripPhase(m, '2026-11-25')).toEqual({ kind: 'during', date: '2026-11-25', dayNumber: 3 });
    expect(buildModel(tripData).routeProvisional).toBe(false);
  });
});

describe('private data encryption', () => {
  it('encrypt script output decrypts in the app, wrong passphrase fails', async () => {
    const out = 'src/data/private.enc.json';
    const original = readFileSync(out, 'utf8');
    const hadDir = existsSync('private');
    mkdirSync('private', { recursive: true });
    const hadFile = existsSync('private/private.json');
    const backup = hadFile ? readFileSync('private/private.json', 'utf8') : null;
    writeFileSync('private/private.json', JSON.stringify({ 'f-1': { bookingRef: 'ABC123' } }));
    try {
      execFileSync('node', ['scripts/encrypt-private.mjs'], { env: { ...process.env, TRIP_PASSPHRASE: 'correct horse battery' } });
      const env = JSON.parse(readFileSync(out, 'utf8'));
      expect(JSON.stringify(env)).not.toContain('ABC123');
      expect((await decryptPrivate(env, 'correct horse battery'))['f-1'].bookingRef).toBe('ABC123');
      await expect(decryptPrivate(env, 'wrong passphrase!')).rejects.toBeTruthy();
    } finally {
      writeFileSync(out, original);
      if (backup !== null) writeFileSync('private/private.json', backup);
      else rmSync('private/private.json');
      if (!hadDir) rmSync('private', { recursive: true, force: true });
    }
  }, 30000);
});
