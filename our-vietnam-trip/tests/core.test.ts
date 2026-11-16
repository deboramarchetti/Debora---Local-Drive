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
    const d = new URL(mapsDirectionsUrl({ name: 'X', address: 'Y' }, 'walking'));
    expect(d.searchParams.get('destination')).toBe('X, Y');
    expect(d.searchParams.get('travelmode')).toBe('walking');
  });
});

describe('itinerary data', () => {
  it('real trip has no errors and one page per day', () => {
    expect(validateTrip(tripData).filter((i) => i.level === 'error')).toEqual([]);
    expect(tripData.days.length).toBe(14);
    expect(tripData.days[0].date).toBe('2026-11-23');
    expect(tripData.days.at(-1)!.date).toBe('2026-12-06');
  });
  it('real trip contains no invented bookings', () => {
    expect([tripData.hotels, tripData.flights, tripData.bookings, tripData.places].every((x) => x.length === 0)).toBe(true);
    expect(tripData.days.every((d) => d.activities.length === 0)).toBe(true);
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
    expect(tripPhase(m, '2026-11-25')).toEqual({ kind: 'during', date: '2026-11-25', dayNumber: 3 });
    expect(buildModel(tripData).routeProvisional).toBe(true);
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
