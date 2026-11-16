import type { TripData } from './types';
import { tripData } from './trip';

/**
 * DESIGN PREVIEW ONLY — fictional sample data.
 * Loaded only with ?sample=1 and always shown with a "Modo exemplo" banner.
 * Nothing here is a real reservation, time or activity.
 */
const c = (id: string) => tripData.cities.find((x) => x.id === id)!;
const coords = (id: string, dLat: number, dLng: number) => ({ lat: c(id).coords.lat + dLat, lng: c(id).coords.lng + dLng, verified: false });

const emptyDays = Array.from({ length: 14 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 10, 23 + i)).toISOString().slice(0, 10),
  cityIds: [] as string[],
  activities: [],
}));

export const sampleData: TripData = {
  ...tripData,
  trip: { ...tripData.trip, dataStatus: 'placeholder', datesConfirmed: false, intro: 'Dados fictícios para visualizar o design. O roteiro real substituirá tudo.' },
  places: [
    { id: 'ex-hotel-hanoi', name: 'Hotel Exemplo Hanói', cityId: 'hanoi', kind: 'hotel', address: 'Endereço de exemplo, Hoàn Kiếm', coords: coords('hanoi', 0.004, -0.002) },
    { id: 'ex-lake', name: 'Lago (exemplo)', cityId: 'hanoi', kind: 'attraction', description: 'Descrição curta de exemplo para mostrar como um lugar aparece no roteiro.', coords: coords('hanoi', 0, 0) },
    { id: 'ex-restaurant', name: 'Restaurante (exemplo)', cityId: 'hanoi', kind: 'restaurant', address: 'Endereço de exemplo', coords: coords('hanoi', -0.006, 0.005) },
    { id: 'ex-museum', name: 'Museu (exemplo)', cityId: 'hanoi', kind: 'attraction', coords: coords('hanoi', 0.01, -0.012) },
    { id: 'ex-airport-han', name: 'Aeroporto (exemplo) — Hanói', cityId: 'hanoi', kind: 'airport', coords: coords('hanoi', 0.19, -0.05) },
    { id: 'ex-pier', name: 'Píer (exemplo)', cityId: 'ninh-binh', kind: 'pier', coords: coords('ninh-binh', -0.03, -0.04) },
    { id: 'ex-hotel-nb', name: 'Hotel Exemplo Ninh Binh', cityId: 'ninh-binh', kind: 'hotel', address: 'Endereço de exemplo', coords: coords('ninh-binh', -0.02, -0.03) },
  ],
  airports: [
    { code: 'XXX', name: 'Aeroporto de origem (exemplo)', city: 'Origem', timeZone: 'America/Sao_Paulo' },
    { code: 'HAN', name: 'Noi Bai International Airport', city: 'Hanói', timeZone: 'Asia/Ho_Chi_Minh', placeId: 'ex-airport-han' },
  ],
  flights: [
    { id: 'ex-flight-1', airline: 'Companhia (exemplo)', flightNumber: 'XX 000', from: 'XXX', to: 'HAN', departDate: '2026-11-22', departTime: '01:10', arriveDate: '2026-11-23', arriveTime: '08:40', arriveTerminal: 'T2', status: 'confirmed', notes: 'Voo fictício para demonstrar o layout.' },
  ],
  hotels: [
    { id: 'ex-h1', placeId: 'ex-hotel-hanoi', checkIn: '2026-11-23', checkOut: '2026-11-25', checkInTime: '14:00', checkOutTime: '12:00', status: 'confirmed', bookedVia: 'Exemplo' },
    { id: 'ex-h2', placeId: 'ex-hotel-nb', checkIn: '2026-11-25', checkOut: '2026-11-26', status: 'pending' },
  ],
  bookings: [
    { id: 'ex-b1', kind: 'transfer', title: 'Transfer aeroporto → hotel (exemplo)', date: '2026-11-23', time: '09:15', fromPlaceId: 'ex-airport-han', toPlaceId: 'ex-hotel-hanoi', durationMin: 45, meetingPoint: 'Saída do desembarque (exemplo)', status: 'confirmed', instructions: 'Instrução de exemplo.' },
    { id: 'ex-b2', kind: 'tour', title: 'Passeio de barco (exemplo)', provider: 'Operadora exemplo', date: '2026-11-25', time: '13:30', meetingPlaceId: 'ex-pier', durationMin: 120, status: 'suggestion' },
  ],
  days: emptyDays.map((d) => {
    if (d.date === '2026-11-23') return {
      ...d, cityIds: ['hanoi'], hotelId: 'ex-h1', title: 'Chegada em Hanói', summary: 'Resumo de exemplo: chegada, check-in e primeira caminhada pelo centro antigo.',
      activities: [
        { id: 'ex-a1', kind: 'flight', title: 'Chegada a Hanói', time: '08:40', flightId: 'ex-flight-1', status: 'confirmed' },
        { id: 'ex-a2', kind: 'transfer', title: 'Transfer para o hotel', time: '09:15', bookingId: 'ex-b1', status: 'confirmed' },
        { id: 'ex-a3', kind: 'check-in', title: 'Check-in no hotel', time: '14:00', hotelId: 'ex-h1', placeId: 'ex-hotel-hanoi', status: 'confirmed' },
        { id: 'ex-a4', kind: 'activity', title: 'Caminhada ao redor do lago', time: '16:30', durationMin: 90, placeId: 'ex-lake', description: 'Atividade de exemplo para mostrar descrição, duração e transporte.', transport: 'A pé, ~10 min do hotel', status: 'suggestion' },
        { id: 'ex-a5', kind: 'meal', title: 'Jantar (exemplo)', time: '19:30', placeId: 'ex-restaurant', notes: 'Observação prática de exemplo.', status: 'suggestion' },
      ],
    };
    if (d.date === '2026-11-24') return {
      ...d, cityIds: ['hanoi'], hotelId: 'ex-h1', summary: 'Dia de exemplo sem horários definidos.',
      activities: [
        { id: 'ex-a6', kind: 'activity', title: 'Museu (exemplo)', period: 'morning', placeId: 'ex-museum', durationMin: 120, status: 'suggestion' },
        { id: 'ex-a7', kind: 'free-time', title: 'Tarde livre', period: 'afternoon', status: 'suggestion' },
      ],
    };
    if (d.date === '2026-11-25') return {
      ...d, cityIds: ['hanoi', 'ninh-binh'], hotelId: 'ex-h2', title: 'Hanói → Ninh Binh', summary: 'Exemplo de dia com mudança de cidade.',
      activities: [
        { id: 'ex-a8', kind: 'check-out', title: 'Check-out', time: '09:00', hotelId: 'ex-h1', placeId: 'ex-hotel-hanoi', status: 'confirmed' },
        { id: 'ex-a9', kind: 'transfer', title: 'Estrada até Ninh Binh', time: '09:30', durationMin: 120, transport: 'Carro privado (exemplo)', status: 'pending' },
        { id: 'ex-a10', kind: 'activity', title: 'Passeio de barco', time: '13:30', bookingId: 'ex-b2', placeId: 'ex-pier', status: 'suggestion' },
      ],
    };
    return d;
  }),
};
