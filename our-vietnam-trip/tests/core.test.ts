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
    expect(Object.fromEntries(m.route.map((r) => [r.cityId, r.nights]))).toEqual({ hanoi: 2, 'ninh-binh': 2, 'ha-long': 1, 'hoi-an': 3, hue: 1, 'ho-chi-minh': 4 });
    // Flights (sheet "Calendar" + doc)
    const f = (id: string) => m.flight(id)!;
    expect([f('gru-doh').departTime, f('gru-doh').arriveDate, f('gru-doh').arriveTime]).toEqual(['20:25', '2026-11-21', '16:00']);
    expect([f('doh-han').departTime, f('doh-han').arriveTime]).toEqual(['01:50', '12:20']);
    expect([f('hph-dad').departDate, f('hph-dad').departTime, f('hph-dad').arriveTime]).toEqual(['2026-11-28', '16:15', '17:30']);
    expect([f('sgn-doh').departTime, f('sgn-doh').arriveTime]).toEqual(['19:40', '23:40']);
    expect([f('doh-gru').departDate, f('doh-gru').departTime, f('doh-gru').arriveTime]).toEqual(['2026-12-07', '00:25', '09:30']);
    // Qatar confirmations
    expect(['gru-doh', 'doh-han', 'sgn-doh', 'doh-gru'].map((id) => f(id).flightNumber)).toEqual(['QR 780', 'QR 976', 'QR 971', 'QR 785']);
    expect([f('doh-han').arriveTerminal, f('sgn-doh').departTerminal]).toEqual(['2', '2']);
    // Nothing invented: only addresses that came from a confirmation; no codes in public data
    expect(m.places.filter((p) => p.address).map((p) => p.id)).toEqual(['millennium-plaza-doha', 'little-riverside', 'melia-vinpearl-hue', 'fusion-saigon']);
    expect(f('hph-dad').flightNumber).toBeUndefined();
    expect([f('hui-sgn').flightNumber, f('hui-sgn').departTime, f('hui-sgn').arriveTime, f('hui-sgn').status]).toEqual(['VJ 1311', '17:50', '19:15', 'confirmed']);
    // Doha stopover is not part of the Vietnam route
    expect(m.route.some((r) => r.cityId === 'doha')).toBe(false);
    // Only bookings marked RESERVADO are confirmed hotels
    expect(m.hotels.map((h) => h.placeId)).toEqual(['millennium-plaza-doha', 'oriental-jade', 'la-lua', 'orchid-cruise', 'little-riverside', 'melia-vinpearl-hue', 'fusion-saigon']);
    expect(m.hotels.every((h) => h.status === 'confirmed')).toBe(true);
    expect(m.bookings.every((b) => b.status === 'pending')).toBe(true);
  });
  it('day 6 schedule keeps transfer before the 16:15 flight', () => {
    const m = buildModel(tripData);
    const afternoon = m.schedule(m.day('2026-11-28')!).find((g) => g.period === 'afternoon')!.items.map((a) => a.id);
    // Hue → SGN day: transfer to airport before the 17:50 flight
    expect(m.schedule(m.day('2026-12-02')!).find((g) => g.period === 'afternoon')!.items.map((a) => a.id)).toEqual(['d10-lunch', 'd10-to-airport', 'd10-flight']);
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
  it('no booking code from private/private.json appears in the public code', () => {
    // private/ is git-ignored; on machines without it there is nothing to compare.
    if (!existsSync('private/private.json')) return;
    const priv = JSON.parse(readFileSync('private/private.json', 'utf8')) as Record<string, Record<string, unknown>>;
    const secrets = Object.values(priv).flatMap((e) => [e.bookingRef, ...((e.ticketNumbers as string[]) ?? [])]).filter((v): v is string => typeof v === 'string' && v.length >= 5);
    const pub = [readFileSync('src/data/trip.ts', 'utf8'), readFileSync('src/data/private.enc.json', 'utf8')].join('\n');
    for (const code of secrets) for (const part of code.split(/[\s:]+/).filter((x) => x.length >= 5 && (/\d/.test(x) || /^[A-Z0-9]+$/.test(x)))) expect(pub.includes(part), part.slice(0, 2) + '…').toBe(false);
  });

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

describe('changes made in the app', () => {
  it('marks a pending booking as booked, adds a new one, and merges by newest', async () => {
    const { applyLocal, mergeLocal, localPrivate } = await import('../src/lib/localStore');
    const store = {
      edits: { 'b-cu-chi': { status: 'confirmed' as const, time: '07:30', provider: 'Les Rives', bookingRef: 'CC-1', updatedAt: '2026-11-17T10:00:00Z' } },
      items: [{ id: 'local-x', kind: 'restaurant' as const, title: 'Jantar Madame Hien', date: '2026-11-24', time: '19:30', status: 'confirmed' as const, updatedAt: '2026-11-17T10:00:00Z' }],
    };
    const m = buildModel(applyLocal(tripData, store));
    expect(m.booking('b-cu-chi')).toMatchObject({ status: 'confirmed', time: '07:30', provider: 'Les Rives' });
    expect(m.day('2026-12-04')!.activities.find((a) => a.id === 'd12-cu-chi')!.status).toBe('confirmed');
    expect(m.day('2026-11-24')!.activities.some((a) => a.bookingId === 'local-x' && a.kind === 'meal')).toBe(true);
    expect(validateTrip(applyLocal(tripData, store)).filter((i) => i.level === 'error')).toEqual([]);
    expect(localPrivate(store)['b-cu-chi'].bookingRef).toBe('CC-1');
    expect(tripData.bookings.find((b) => b.id === 'b-cu-chi')!.status).toBe('pending'); // original untouched
    const newer = { edits: { 'b-cu-chi': { status: 'pending' as const, updatedAt: '2026-11-18T00:00:00Z' } }, items: [] };
    const older = { edits: { 'b-cu-chi': { status: 'pending' as const, updatedAt: '2026-11-01T00:00:00Z' } }, items: [] };
    expect(mergeLocal(store, newer).store.edits['b-cu-chi'].status).toBe('pending');
    expect(mergeLocal(store, older)).toMatchObject({ changed: 0 });
  });
  it('group code round-trips with the trip passphrase', async () => {
    const { encryptJSON, decryptJSON } = await import('../src/lib/crypto');
    const env = await encryptJSON({ edits: {}, items: [{ id: 'a' }] }, 'senha-de-teste-1', 1000);
    expect(JSON.stringify(env)).not.toContain('"a"');
    expect(await decryptJSON(env, 'senha-de-teste-1')).toEqual({ edits: {}, items: [{ id: 'a' }] });
    await expect(decryptJSON(env, 'outra-senha-xx')).rejects.toBeTruthy();
  });
});

describe('per-party view (same hotels, separate reservations)', () => {
  it('shows each party only its own missing confirmations', async () => {
    const { missingFor } = await import('../src/lib/viewer');
    const m = buildModel(tripData);
    const lr = m.hotel('h-little-riverside')!;
    expect(missingFor(lr, 'casal')).toEqual([]);
    expect(missingFor(lr, 'arthur')).toEqual(['sua confirmação (código, PIN)']);
    expect(missingFor(lr, undefined)).toEqual(['confirmação de Arthur']);
    expect(missingFor(m.flight('hui-sgn')!, 'arthur')).toEqual([]); // one VietJet booking for all three
    expect(missingFor(m.flight('sgn-doh')!, 'casal')).toEqual(['bilhete da Débora (o PDF enviado é só do Renato)']);
    expect(missingFor(m.flight('sgn-doh')!, 'arthur')).toEqual(['sua confirmação (código, PIN)']);
    expect(missingFor(m.hotel('h-la-lua')!, 'casal')).toEqual(['endereço e horários de check-in/check-out', 'sua confirmação (código, PIN)']);
    // The to-do list keeps own codes apart: Arthur's hotels are booked, codes optional.
    const { needsOwnCode } = await import('../src/lib/viewer');
    expect(missingFor(lr, 'arthur', false)).toEqual([]);
    expect(needsOwnCode(lr, 'arthur')).toBe(true);
    expect(needsOwnCode(lr, 'casal')).toBe(false);
  });
  it('a code typed by Arthur in the app counts as his confirmation only', async () => {
    const { applyLocal } = await import('../src/lib/localStore');
    const { missingFor } = await import('../src/lib/viewer');
    const store = { edits: { 'h-little-riverside@arthur': { bookingRef: '1234.567.890', updatedAt: '2026-11-17T00:00:00Z' } }, items: [] };
    const m = buildModel(applyLocal(tripData, store));
    expect(m.hotel('h-little-riverside')!.confirmations).toEqual(['casal', 'arthur']);
    expect(missingFor(m.hotel('h-little-riverside')!, 'arthur')).toEqual([]);
    expect(m.hotel('h-la-lua')!.confirmations).toEqual([]);
  });
});

describe('what each party takes part in', () => {
  it('Arthur starts in Doha → Hanoi and returns separately', async () => {
    const { forParty } = await import('../src/lib/viewer');
    const a = buildModel(forParty(tripData, 'arthur'));
    expect(a.flights.map((f) => f.id)).toEqual(['doh-han', 'hph-dad', 'hui-sgn']);
    expect(a.hotels.some((h) => h.id === 'h-millennium-doha')).toBe(false);
    expect(a.places.some((p) => p.id === 'millennium-plaza-doha')).toBe(false);
    const d14 = a.day('2026-12-06')!.activities.map((x) => x.id);
    expect(d14).toContain('d14-arthur-exit');
    expect(d14).not.toContain('d14-flight');
    expect(d14).not.toContain('d14-to-airport');
    expect(a.booking('b-arthur-saida')!.status).toBe('pending');
    expect(validateTrip(forParty(tripData, 'arthur')).filter((i) => i.level === 'error')).toEqual([]);

    const c = buildModel(forParty(tripData, 'casal'));
    expect(c.flights.map((f) => f.id)).toEqual(['gru-doh', 'doh-han', 'hph-dad', 'hui-sgn', 'sgn-doh', 'doh-gru']);
    expect(c.booking('b-arthur-saida')).toBeUndefined();
    expect(c.day('2026-12-06')!.activities.map((x) => x.id)).not.toContain('d14-arthur-exit');
    expect(validateTrip(forParty(tripData, 'casal')).filter((i) => i.level === 'error')).toEqual([]);
  });
});
