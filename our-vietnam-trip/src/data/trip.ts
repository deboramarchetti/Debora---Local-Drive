import type { Activity, Airport, Booking, City, Day, Flight, Hotel, Place, TripData } from './types';

/**
 * ============================================================
 *  SOURCE OF TRUTH — itinerary of the Vietnam trip
 * ============================================================
 * Imported from:
 *  - Google Doc "Roteiro - Vietna" (day plan, reserved hotels, HPH→DAD flight)
 *  - Google Sheet "Vietnam Plan" › Calendar (international flights & times)
 *    and › To dos (status of bookings)
 *
 * Rules: nothing invented. Times only where the sources give them.
 * Addresses were NOT in the sources → places use a Maps search text
 * (`mapsQuery`) instead. Coordinates are approximate (verified: false) and are
 * used only to draw the schematic maps, never for the Google Maps links.
 * Booking codes live in private/private.json (encrypted), not here.
 */

// ---------------------------------------------------------------- cities
const cities: City[] = [
  { id: 'hanoi', name: 'Hanói', localName: 'Hà Nội', region: 'Norte', coords: { lat: 21.0285, lng: 105.8542, verified: false }, artHue: 8, mapLabel: 'left', tagline: 'Cultura e gastronomia' },
  { id: 'ninh-binh', name: 'Ninh Binh', localName: 'Ninh Bình', region: 'Norte', coords: { lat: 20.2506, lng: 105.9745, verified: false }, artHue: 150, mapLabel: 'left', tagline: 'Natureza rural' },
  { id: 'ha-long', name: 'Ha Long Bay', localName: 'Vịnh Hạ Long', region: 'Norte', coords: { lat: 20.9101, lng: 107.1839, verified: false }, artHue: 185, tagline: 'Paisagem e barco' },
  { id: 'hoi-an', name: 'Hoi An', localName: 'Hội An', region: 'Centro', coords: { lat: 15.8801, lng: 108.338, verified: false }, artHue: 38, tagline: 'Charme e descanso' },
  { id: 'hue', name: 'Hue', localName: 'Huế', region: 'Centro', coords: { lat: 16.4637, lng: 107.5909, verified: false }, artHue: 280, mapLabel: 'left', tagline: 'Vietnã imperial' },
  { id: 'doha', name: 'Doha', region: 'Catar · stopover', coords: { lat: 25.2854, lng: 51.531, verified: false }, artHue: 30, abroad: true },
  { id: 'ho-chi-minh', name: 'Ho Chi Minh City', localName: 'Thành phố Hồ Chí Minh', region: 'Sul', coords: { lat: 10.7769, lng: 106.7009, verified: false }, artHue: 345, tagline: 'História, metrópole e Delta do Mekong' },
];

// ---------------------------------------------------------------- places
const ll = (lat: number, lng: number) => ({ lat, lng, verified: false });
const places: Place[] = [
  // Doha stopover (address from the Qatar Airways booking confirmation)
  { id: 'millennium-plaza-doha', name: 'Millennium Plaza Doha', cityId: 'doha', kind: 'hotel', address: '231 Suhaim Bin Hamad St., Doha, Qatar' },
  // Hanoi
  { id: 'han-airport', name: 'Noi Bai International Airport', cityId: 'hanoi', kind: 'airport', mapsQuery: 'Noi Bai International Airport', coords: ll(21.2187, 105.8042) },
  { id: 'oriental-jade', name: 'Oriental Jade', cityId: 'hanoi', kind: 'hotel', mapsQuery: 'The Oriental Jade Hotel, Hanoi' },
  { id: 'old-quarter', name: 'Old Quarter', localName: 'Phố cổ Hà Nội', cityId: 'hanoi', kind: 'attraction', mapsQuery: 'Hanoi Old Quarter', coords: ll(21.034, 105.85) },
  { id: 'hoan-kiem', name: 'Hoan Kiem Lake', localName: 'Hồ Hoàn Kiếm', cityId: 'hanoi', kind: 'attraction', mapsQuery: 'Hoan Kiem Lake, Hanoi', coords: ll(21.0288, 105.8525) },
  { id: 'temple-literature', name: 'Temple of Literature', localName: 'Văn Miếu', cityId: 'hanoi', kind: 'attraction', mapsQuery: 'Temple of Literature, Hanoi', coords: ll(21.0293, 105.8355) },
  { id: 'ho-chi-minh-area', name: 'Área de Ho Chi Minh (Mausoléu)', cityId: 'hanoi', kind: 'attraction', mapsQuery: 'Ho Chi Minh Mausoleum, Hanoi', coords: ll(21.0368, 105.8346) },
  // Ninh Binh
  { id: 'la-lua', name: 'La Lua Resort', cityId: 'ninh-binh', kind: 'hotel', mapsQuery: 'La Lua Resort, Ninh Binh' },
  { id: 'hang-mua', name: 'Hang Mua', localName: 'Hang Múa', cityId: 'ninh-binh', kind: 'attraction', mapsQuery: 'Hang Mua viewpoint, Ninh Binh', coords: ll(20.2292, 105.9353) },
  { id: 'trang-an', name: 'Trang An', localName: 'Tràng An', cityId: 'ninh-binh', kind: 'pier', mapsQuery: 'Trang An boat tour, Ninh Binh', coords: ll(20.2556, 105.8939) },
  { id: 'bich-dong', name: 'Bich Dong Pagoda', localName: 'Chùa Bích Động', cityId: 'ninh-binh', kind: 'attraction', mapsQuery: 'Bich Dong Pagoda, Ninh Binh', coords: ll(20.2188, 105.9175) },
  // Ha Long
  { id: 'tuan-chau', name: 'Tuan Chau (porto)', cityId: 'ha-long', kind: 'pier', mapsQuery: 'Tuan Chau International Marina, Ha Long', coords: ll(20.9293, 106.994), notes: 'Destino do transfer previsto no planejamento ("Transfer Ninh Binh → Tuan Chau"). Confirmar o ponto de embarque com a Orchid Cruises.' },
  { id: 'orchid-cruise', name: 'Orchid Cruises', cityId: 'ha-long', kind: 'hotel', mapsQuery: 'Orchid Cruises Ha Long' },
  { id: 'hph-airport', name: 'Aeroporto de Cat Bi (Hai Phong)', cityId: 'ha-long', kind: 'airport', mapsQuery: 'Cat Bi International Airport, Hai Phong', coords: ll(20.8194, 106.725) },
  // Hoi An
  { id: 'dad-airport', name: 'Aeroporto de Da Nang', cityId: 'hoi-an', kind: 'airport', mapsQuery: 'Da Nang International Airport', coords: ll(16.0439, 108.1994) },
  { id: 'little-riverside', name: 'Little Riverside Hoi An', cityId: 'hoi-an', kind: 'hotel', address: '09 Phan Boi Chau, Cam Chau, Hoi An, Vietnã', coords: { lat: 15.87685, lng: 108.336417, verified: true }, phone: '+84 235 3575 555', notes: 'Dá para ir a pé para os lugares.' },
  { id: 'ancient-town', name: 'Hoi An Ancient Town', localName: 'Phố cổ Hội An', cityId: 'hoi-an', kind: 'attraction', mapsQuery: 'Hoi An Ancient Town', coords: ll(15.877, 108.328) },
  { id: 'japanese-bridge', name: 'Japanese Covered Bridge', localName: 'Chùa Cầu', cityId: 'hoi-an', kind: 'attraction', mapsQuery: 'Japanese Covered Bridge, Hoi An', coords: ll(15.8771, 108.3262) },
  { id: 'tra-que', name: 'Tra Que', localName: 'Làng rau Trà Quế', cityId: 'hoi-an', kind: 'attraction', mapsQuery: 'Tra Que Vegetable Village, Hoi An', coords: ll(15.8985, 108.329) },
  { id: 'my-son', name: 'My Son', localName: 'Mỹ Sơn', cityId: 'hoi-an', kind: 'attraction', mapsQuery: 'My Son Sanctuary', coords: ll(15.764, 108.124) },
  // Hai Van Pass road trip & Hue
  { id: 'hai-van', name: 'Hai Van Pass', localName: 'Đèo Hải Vân', cityId: 'hue', kind: 'attraction', mapsQuery: 'Hai Van Pass', coords: ll(16.1925, 108.13) },
  { id: 'lang-co', name: 'Lang Co', localName: 'Lăng Cô', cityId: 'hue', kind: 'attraction', mapsQuery: 'Lang Co Beach', coords: ll(16.27, 108.06) },
  { id: 'melia-vinpearl-hue', name: 'Meliá Vinpearl Hue', cityId: 'hue', kind: 'hotel', address: '50A Hung Vuong Street, Phu Nhuan Ward, Hue, Vietnam', coords: { lat: 16.463067, lng: 107.5944, verified: true }, phone: '+84 234 3688 666' },
  { id: 'khai-dinh', name: 'Khai Dinh Tomb', localName: 'Lăng Khải Định', cityId: 'hue', kind: 'attraction', mapsQuery: 'Khai Dinh Tomb, Hue', coords: ll(16.3989, 107.59) },
  { id: 'imperial-city', name: 'Imperial City / Citadel', localName: 'Đại Nội Huế', cityId: 'hue', kind: 'attraction', mapsQuery: 'Imperial City, Hue', coords: ll(16.4698, 107.5786) },
  { id: 'thien-mu', name: 'Thien Mu Pagoda', localName: 'Chùa Thiên Mụ', cityId: 'hue', kind: 'attraction', mapsQuery: 'Thien Mu Pagoda, Hue', coords: ll(16.4534, 107.5446) },
  { id: 'perfume-river', name: 'Perfume River', localName: 'Sông Hương', cityId: 'hue', kind: 'attraction', mapsQuery: 'Perfume River, Hue', coords: ll(16.4637, 107.5856) },
  { id: 'hui-airport', name: 'Aeroporto de Hue (Phu Bai)', cityId: 'hue', kind: 'airport', mapsQuery: 'Phu Bai International Airport, Hue', coords: ll(16.4015, 107.7026) },
  // Ho Chi Minh City
  { id: 'fusion-saigon', name: 'Fusion Original Saigon Centre', cityId: 'ho-chi-minh', kind: 'hotel', address: '65 Đường Lê Lợi, Takashimaya Saigon Centre, Quận 1, Ho Chi Minh City, Vietnam', coords: { lat: 10.773317, lng: 106.700967, verified: true }, phone: '+84 28 3622 2265', notes: 'Fica no térreo do Saigon Centre: entre pela entrada da rua Pasteur e vire à direita (em frente à loja Marc Jacobs).' },
  { id: 'sgn-airport', name: 'Tan Son Nhat International Airport', cityId: 'ho-chi-minh', kind: 'airport', mapsQuery: 'Tan Son Nhat International Airport', coords: ll(10.8188, 106.652) },
  { id: 'war-remnants', name: 'War Remnants Museum', localName: 'Bảo tàng Chứng tích Chiến tranh', cityId: 'ho-chi-minh', kind: 'attraction', mapsQuery: 'War Remnants Museum, Ho Chi Minh City', coords: ll(10.7795, 106.6922) },
  { id: 'independence-palace', name: 'Independence Palace', localName: 'Dinh Độc Lập', cityId: 'ho-chi-minh', kind: 'attraction', mapsQuery: 'Independence Palace, Ho Chi Minh City', coords: ll(10.777, 106.6953) },
  { id: 'nguyen-hue', name: 'Nguyen Hue', localName: 'Phố đi bộ Nguyễn Huệ', cityId: 'ho-chi-minh', kind: 'attraction', mapsQuery: 'Nguyen Hue Walking Street, Ho Chi Minh City', coords: ll(10.774, 106.7038) },
  { id: 'cu-chi', name: 'Cu Chi Tunnels', localName: 'Địa đạo Củ Chi', cityId: 'ho-chi-minh', kind: 'attraction', mapsQuery: 'Cu Chi Tunnels', coords: ll(11.06, 106.52) },
  { id: 'ben-tre', name: 'Ben Tre (Delta do Mekong)', localName: 'Bến Tre', cityId: 'ho-chi-minh', kind: 'attraction', mapsQuery: 'Ben Tre, Vietnam', coords: ll(10.2433, 106.3756) },
];

// -------------------------------------------------------------- airports
const airports: Airport[] = [
  { code: 'GRU', name: 'Aeroporto Internacional de Guarulhos', city: 'São Paulo', timeZone: 'America/Sao_Paulo' },
  { code: 'DOH', name: 'Hamad International Airport', city: 'Doha', timeZone: 'Asia/Qatar' },
  { code: 'HAN', name: 'Noi Bai International Airport', city: 'Hanói', timeZone: 'Asia/Ho_Chi_Minh', placeId: 'han-airport' },
  { code: 'HPH', name: 'Cat Bi International Airport', city: 'Hai Phong', timeZone: 'Asia/Ho_Chi_Minh', placeId: 'hph-airport' },
  { code: 'DAD', name: 'Da Nang International Airport', city: 'Da Nang', timeZone: 'Asia/Ho_Chi_Minh', placeId: 'dad-airport' },
  { code: 'HUI', name: 'Phu Bai International Airport', city: 'Hue', timeZone: 'Asia/Ho_Chi_Minh', placeId: 'hui-airport' },
  { code: 'SGN', name: 'Tan Son Nhat International Airport', city: 'Ho Chi Minh City', timeZone: 'Asia/Ho_Chi_Minh', placeId: 'sgn-airport' },
];

// --------------------------------------------------------------- flights
// International legs: Qatar Airways confirmations (outbound QZ1Z5BDQ screenshot, return e-ticket PDF).
const flights: Flight[] = [
  { id: 'gru-doh', parties: ['casal'], airline: 'Qatar Airways', flightNumber: 'QR 780', from: 'GRU', to: 'DOH', departDate: '2026-11-20', departTime: '20:25', arriveDate: '2026-11-21', arriveTime: '16:00', departTerminal: '3', baggage: 'Economy · 2 malas por adulto', status: 'confirmed', perParty: true, confirmations: ['casal'], notes: 'Ida. Stopover em Doha (Millennium Plaza Doha) antes do voo para Hanói.' },
  { id: 'doh-han', airline: 'Qatar Airways', flightNumber: 'QR 976', from: 'DOH', to: 'HAN', departDate: '2026-11-23', departTime: '01:50', arriveDate: '2026-11-23', arriveTime: '12:20', arriveTerminal: '2', baggage: 'Economy · 2 malas por adulto', status: 'confirmed', perParty: true, confirmations: ['casal'], notes: 'Chegada em Hanói. Arthur vem no mesmo voo (reserva própria).' },
  { id: 'hph-dad', from: 'HPH', to: 'DAD', departDate: '2026-11-28', departTime: '16:15', arriveDate: '2026-11-28', arriveTime: '17:30', status: 'confirmed', notes: 'Voo direto Hai Phong (Cat Bi) → Da Nang.', missing: ['companhia e número do voo', 'código da reserva', 'bagagem incluída'] },
  { id: 'hui-sgn', airline: 'VietJet Air', flightNumber: 'VJ 1311', from: 'HUI', to: 'SGN', departDate: '2026-12-02', departTime: '17:50', arriveDate: '2026-12-02', arriveTime: '19:15', baggage: 'Por pessoa: 1 mala de mão 7 kg (23×36×56 cm) + 1 mala despachada 20 kg. Itens pessoais não incluídos.', seats: '4C, 4D, 5D', status: 'confirmed', notes: 'Direto · 1h25 · Econômica. 3 viajantes. Permite alteração; reembolso parcial se cancelar.' },
  { id: 'sgn-doh', parties: ['casal'], airline: 'Qatar Airways', flightNumber: 'QR 971', from: 'SGN', to: 'DOH', departDate: '2026-12-06', departTime: '19:40', arriveDate: '2026-12-06', arriveTime: '23:40', departTerminal: '2', baggage: 'Economy · 2 malas (2PC)', status: 'confirmed', perParty: true, confirmations: ['casal'], missingFor: { casal: ['bilhete da Débora (o PDF enviado é só do Renato)'] }, notes: 'Qatar recomenda chegar ao aeroporto 3h antes; check-in online abre 48h antes. Na conexão em Doha: lounge, comida, banho e descanso.' },
  { id: 'doh-gru', parties: ['casal'], airline: 'Qatar Airways', flightNumber: 'QR 785', from: 'DOH', to: 'GRU', departDate: '2026-12-07', departTime: '00:25', arriveDate: '2026-12-07', arriveTime: '09:30', arriveTerminal: '3', baggage: 'Economy · 2 malas (2PC)', status: 'confirmed', perParty: true, confirmations: ['casal'], missingFor: { casal: ['bilhete da Débora (o PDF enviado é só do Renato)'] }, notes: 'Último trecho, para São Paulo.' },
];

// ---------------------------------------------------------------- hotels
// Only bookings marked "RESERVADO" in the doc. Ho Chi Minh City: not booked yet.
const hotels: Hotel[] = [
  { id: 'h-millennium-doha', parties: ['casal'], placeId: 'millennium-plaza-doha', checkIn: '2026-11-21', checkOut: '2026-11-22', bookedVia: 'Qatar Airways (pacote voo + hotel)', status: 'confirmed', perParty: true, confirmations: ['casal'], missing: ['datas exatas de check-in/check-out (21→22/11 é suposição)'], notes: 'Stopover de ida. As datas do hotel não aparecem na parte da confirmação enviada; o roteiro diz 1 noite (check-out 22/11 é uma suposição — confirmar). O voo para Hanói sai 23/11 à 01:50.' },
  { id: 'h-oriental-jade', placeId: 'oriental-jade', checkIn: '2026-11-23', checkOut: '2026-11-25', bookedVia: 'Booking.com', status: 'confirmed', perParty: true, confirmations: [], notes: 'Débora e Renato e Arthur: reservas separadas, mesmo hotel e mesmas datas.', missing: ['endereço e horários de check-in/check-out'] },
  { id: 'h-la-lua', placeId: 'la-lua', checkIn: '2026-11-25', checkOut: '2026-11-27', bookedVia: 'Booking.com', status: 'confirmed', perParty: true, confirmations: [], notes: 'Débora e Renato e Arthur: reservas separadas, mesmo hotel e mesmas datas.', missing: ['endereço e horários de check-in/check-out'] },
  { id: 'h-orchid-cruise', placeId: 'orchid-cruise', checkIn: '2026-11-27', checkOut: '2026-11-28', roomType: 'Cruzeiro Ha Long / Lan Ha 2D1N — noite a bordo', bookedVia: 'Booking.com', status: 'confirmed', perParty: true, confirmations: [], missing: ['horário e ponto de embarque', 'se o transfer está incluso'], notes: 'Débora e Renato e Arthur: reservas separadas, mesmo cruzeiro. Embarque próximo ao almoço. Normalmente inclui navegação, caiaque, cavernas ou ilhas, sunset no deck e jantar.' },
  { id: 'h-little-riverside', placeId: 'little-riverside', checkIn: '2026-11-28', checkOut: '2026-12-01', checkInTime: '14:00', checkOutTime: '12:00', roomType: 'Suíte Little Town · café da manhã incluído', bookedVia: 'Booking.com', status: 'confirmed', perParty: true, confirmations: ['casal'], notes: 'Débora e Renato: reserva para 2 adultos no nome do Renato; Arthur tem reserva própria no mesmo hotel, nas mesmas datas. Pré-pagamento total pode ser cobrado a qualquer momento; cancelamento já não é gratuito (prazo era 06/11). Levar documento com foto e cartão de crédito. Avisar o hotel do horário previsto de chegada.' },
  { id: 'h-melia-hue', placeId: 'melia-vinpearl-hue', checkIn: '2026-12-01', checkOut: '2026-12-02', checkInTime: '14:00', checkOutTime: '12:00', roomType: 'Quarto Deluxe · sem refeições', bookedVia: 'Booking.com', status: 'confirmed', perParty: true, confirmations: ['casal'], notes: 'Débora e Renato: reserva para 2 adultos no nome do Renato; Arthur tem reserva própria no mesmo hotel, nas mesmas datas. Pagamento no hotel; cancelamento grátis até 27/11 23:59. O cartão usado na reserva deve ser do hóspede. Booking informa "sem acesso à internet".' },
  { id: 'h-fusion-saigon', placeId: 'fusion-saigon', checkIn: '2026-12-02', checkOut: '2026-12-06', checkInTime: '14:00', checkOutTime: '12:00', roomType: 'Acomodação Original com cama king-size · café da manhã incluído', bookedVia: 'Booking.com', status: 'confirmed', perParty: true, confirmations: ['casal'], notes: 'Débora e Renato: reserva para 2 adultos no nome do Renato; Arthur tem reserva própria no mesmo hotel, nas mesmas datas. Pré-pagamento total nos 3 dias antes da chegada; cancelamento grátis até 28/11 23:59. Levar o cartão físico usado no pré-pagamento (titular = hóspede) e passaporte. Caução de VND 1.000.000 em dinheiro no check-in (devolvida no check-out). Visitantes só com registro, 08:00–22:00.' },
];

// ---------------------------------------------- transports & tours to book
// From the doc's booking table. None of these is marked as reserved yet.
const bookings: Booking[] = [
  { id: 'b-arthur-saida', parties: ['arthur'], kind: 'other', title: 'Voo de saída do Arthur do Vietnã', date: '2026-12-06', priority: 'medium', bookBy: 'informar companhia, nº do voo e horário', status: 'pending', notes: 'Arthur volta separado (não está nos voos Qatar de 06/12 de Débora e Renato).' },
  { id: 'b-visa', kind: 'other', title: 'Visto do Vietnã', date: '2026-11-23', priority: 'high', bookBy: 'antes do embarque (20/11)', status: 'pending', notes: 'Planilha "To dos": Visa — To Do.' },
  { id: 'b-transfer-han-hotel', kind: 'transfer', title: 'Transfer aeroporto de Hanói → Oriental Jade', date: '2026-11-23', fromPlaceId: 'han-airport', toPlaceId: 'oriental-jade', priority: 'low', bookBy: 'opcional (o roteiro cita o transfer; não está na tabela de reservas)', status: 'pending' },
  { id: 'b-transfer-han-nb', kind: 'transfer', title: 'Transfer Hanói → Ninh Binh', date: '2026-11-25', fromPlaceId: 'oriental-jade', toPlaceId: 'la-lua', priority: 'low', bookBy: 'opcional (o roteiro cita o transfer; não está na tabela de reservas)', status: 'pending' },
  { id: 'b-transfer-halong-hph', kind: 'transfer', title: 'Transfer Ha Long → Aeroporto de Cat Bi (HPH)', date: '2026-11-28', toPlaceId: 'hph-airport', priority: 'medium', bookBy: 'junto com o cruzeiro (voo às 16:15)', status: 'pending', notes: 'Verificar se o cruzeiro oferece esse transfer.' },
  { id: 'b-transfer-dad-hoian', kind: 'transfer', title: 'Transfer Aeroporto de Da Nang → Hoi An', date: '2026-11-28', fromPlaceId: 'dad-airport', toPlaceId: 'little-riverside', priority: 'low', bookBy: 'opcional (o hotel pode oferecer; Grab também atende)', status: 'pending' },
  { id: 'b-transfer-nb-tuan-chau', kind: 'transfer', title: 'Transfer Ninh Binh → Tuan Chau', date: '2026-11-27', toPlaceId: 'tuan-chau', priority: 'medium', bookBy: '2–4 semanas antes', status: 'pending', notes: 'Transfer do roteiro (dia 5).' },
  { id: 'b-hai-van', kind: 'car', title: 'Carro privado Hoi An → Hue via Hai Van Pass', date: '2026-12-01', fromPlaceId: 'little-riverside', toPlaceId: 'melia-vinpearl-hue', priority: 'medium', bookBy: '1–3 semanas antes', status: 'pending', notes: 'Passando por Da Nang, Hai Van Pass e Lang Co.' },
  { id: 'b-food-tour', kind: 'tour', title: 'Food tour em Hanói', date: '2026-11-24', priority: 'low', bookBy: '~1 semana antes', status: 'pending', notes: 'No fim da tarde/noite.' },
  { id: 'b-cooking-class', kind: 'tour', title: 'Cooking class em Hoi An', date: '2026-11-30', priority: 'low', bookBy: '~1 semana antes', status: 'pending', notes: 'Dia 8, o dia mais lento da viagem.' },
  { id: 'b-cu-chi', kind: 'tour', title: 'Cu Chi Tunnels — meio dia', date: '2026-12-04', priority: 'medium', bookBy: '1–2 semanas antes', status: 'pending', notes: 'Preferência por passeio de meio dia, pela manhã.' },
  { id: 'b-mekong', kind: 'tour', title: 'Delta do Mekong — bate-volta a Ben Tre', date: '2026-12-05', priority: 'low', bookBy: 'perto da viagem, cancelável', status: 'pending', notes: 'Saída pela manhã, retorno no fim da tarde.' },
];

// ------------------------------------------------------------------ days
type A = Omit<Activity, 'status'> & { status?: Activity['status'] };
const sug = (xs: A[]): Activity[] => xs.map((a) => ({ status: 'suggestion', ...a }) as Activity);

const days: Day[] = [
  {
    date: '2026-11-23', cityIds: ['hanoi'], hotelId: 'h-oriental-jade',
    title: 'Chegada + primeiro contato com o Vietnã',
    summary: 'Não tentamos transformar o dia da chegada em uma maratona. O Old Quarter já entrega imediatamente o caos, a comida e a atmosfera de Hanói.',
    activities: sug([
      { id: 'd1-arrival', kind: 'flight', title: 'Chegada em Hanói', time: '12:20', flightId: 'doh-han', placeId: 'han-airport', status: 'confirmed' },
      { id: 'd1-visa', kind: 'note', title: 'Imigração: ter o visto em mãos', period: 'afternoon', bookingId: 'b-visa', status: 'pending' },
      { id: 'd1-transfer', kind: 'transfer', title: 'Imigração e transfer para o hotel', period: 'afternoon', bookingId: 'b-transfer-han-hotel', status: 'pending' },
      { id: 'd1-checkin', kind: 'check-in', title: 'Check-in no Oriental Jade', period: 'afternoon', hotelId: 'h-oriental-jade', placeId: 'oriental-jade', status: 'confirmed' },
      { id: 'd1-old-quarter', kind: 'activity', title: 'Old Quarter', period: 'afternoon', placeId: 'old-quarter', description: 'Tarde livre para o primeiro contato com a cidade.' },
      { id: 'd1-hoan-kiem', kind: 'activity', title: 'Hoan Kiem Lake', period: 'afternoon', placeId: 'hoan-kiem' },
      { id: 'd1-cafes', kind: 'meal', title: 'Cafés e egg coffee', period: 'afternoon' },
      { id: 'd1-dinner', kind: 'meal', title: 'Primeiro jantar vietnamita', period: 'evening' },
    ]),
  },
  {
    date: '2026-11-24', cityIds: ['hanoi'], hotelId: 'h-oriental-jade',
    title: 'História + cidade + gastronomia',
    summary: 'É o dia para realmente entender Hanói, misturando história com a vida cotidiana da cidade.',
    activities: sug([
      { id: 'd2-literature', kind: 'activity', title: 'Temple of Literature', placeId: 'temple-literature' },
      { id: 'd2-hcm-area', kind: 'activity', title: 'Área de Ho Chi Minh', placeId: 'ho-chi-minh-area' },
      { id: 'd2-old-quarter', kind: 'activity', title: 'Old Quarter', placeId: 'old-quarter' },
      { id: 'd2-markets', kind: 'activity', title: 'Mercados e cafés' },
      { id: 'd2-food-tour', kind: 'meal', title: 'Food tour', period: 'evening', bookingId: 'b-food-tour', description: 'No fim da tarde/noite.', status: 'pending' },
    ]),
  },
  {
    date: '2026-11-25', cityIds: ['hanoi', 'ninh-binh'], hotelId: 'h-la-lua',
    title: 'Começa a natureza',
    summary: 'Muda completamente o ritmo depois de Hanói e entrega algumas das paisagens mais bonitas da viagem.',
    activities: sug([
      { id: 'd3-checkout', kind: 'check-out', title: 'Check-out do Oriental Jade', period: 'morning', hotelId: 'h-oriental-jade', placeId: 'oriental-jade', status: 'confirmed' },
      { id: 'd3-transfer', kind: 'transfer', title: 'Transfer Hanói → Ninh Binh', period: 'morning', bookingId: 'b-transfer-han-nb', status: 'pending' },
      { id: 'd3-checkin', kind: 'check-in', title: 'Check-in no La Lua Resort', hotelId: 'h-la-lua', placeId: 'la-lua', status: 'confirmed', description: 'Hotel no meio da natureza.' },
      { id: 'd3-hang-mua', kind: 'activity', title: 'Hang Mua e seu mirante', placeId: 'hang-mua' },
      { id: 'd3-bike', kind: 'activity', title: 'Bicicleta pela região rural', description: 'Arrozais e vilarejos.' },
    ]),
  },
  {
    date: '2026-11-26', cityIds: ['ninh-binh'], hotelId: 'h-la-lua',
    title: 'Trang An',
    summary: 'Trang An é um dos grandes highlights da viagem. O passeio de barco atravessando as formações de calcário é uma experiência muito diferente de simplesmente visitar um mirante.',
    activities: sug([
      { id: 'd4-trang-an', kind: 'activity', title: 'Passeio de barco em Trang An', placeId: 'trang-an', highlight: true, description: 'Cavernas, rios e montanhas calcárias. Não precisa reservar.' },
      { id: 'd4-bich-dong', kind: 'activity', title: 'Bich Dong Pagoda', placeId: 'bich-dong' },
      { id: 'd4-free', kind: 'free-time', title: 'Bicicleta ou tempo livre no hotel' },
    ]),
  },
  {
    date: '2026-11-27', cityIds: ['ninh-binh', 'ha-long'], hotelId: 'h-orchid-cruise',
    title: 'Cruzeiro pela baía',
    summary: 'Ha Long é uma das paisagens mais icônicas do país e dormir na baía é muito melhor do que fazer bate-volta.',
    activities: sug([
      { id: 'd5-checkout', kind: 'check-out', title: 'Check-out do La Lua Resort', period: 'morning', hotelId: 'h-la-lua', placeId: 'la-lua', status: 'confirmed' },
      { id: 'd5-transfer', kind: 'transfer', title: 'Transfer para Ha Long', period: 'morning', bookingId: 'b-transfer-nb-tuan-chau', status: 'pending' },
      { id: 'd5-boarding', kind: 'check-in', title: 'Embarque no Orchid Cruise', period: 'afternoon', hotelId: 'h-orchid-cruise', placeId: 'tuan-chau', status: 'confirmed', description: 'Embarque próximo ao almoço (horário exato não informado).' },
      { id: 'd5-cruise', kind: 'activity', title: 'Navegação pela baía', period: 'afternoon', highlight: true, description: 'Normalmente inclui caiaque e cavernas ou ilhas.' },
      { id: 'd5-sunset', kind: 'activity', title: 'Sunset no deck', period: 'evening' },
      { id: 'd5-dinner', kind: 'meal', title: 'Jantar a bordo', period: 'evening' },
    ]),
  },
  {
    date: '2026-11-28', cityIds: ['ha-long', 'hoi-an'], hotelId: 'h-little-riverside',
    title: 'Dia de deslocamento',
    summary: 'Ha Long → Aeroporto de Cat Bi (Hai Phong) → voo direto para Da Nang → transfer até Hoi An. Assim evitamos voltar para Hanói depois do cruzeiro. Chegada em Hoi An no fim do dia.',
    activities: sug([
      { id: 'd6-cruise-morning', kind: 'activity', title: 'Manhã no cruzeiro', period: 'morning', description: 'Café, navegação, última atividade e brunch.' },
      { id: 'd6-disembark', kind: 'check-out', title: 'Desembarque', period: 'morning', hotelId: 'h-orchid-cruise', status: 'confirmed' },
      { id: 'd6-transfer-hph', kind: 'transfer', title: 'Transfer até o Aeroporto de Cat Bi (HPH)', period: 'afternoon', placeId: 'hph-airport', bookingId: 'b-transfer-halong-hph', status: 'pending' },
      { id: 'd6-flight', kind: 'flight', title: 'Voo Hai Phong → Da Nang', time: '16:15', endTime: '17:30', flightId: 'hph-dad', status: 'confirmed' },
      { id: 'd6-transfer-hoi-an', kind: 'transfer', title: 'Transfer Da Nang → Hoi An', period: 'evening', bookingId: 'b-transfer-dad-hoian', status: 'pending' },
      { id: 'd6-checkin', kind: 'check-in', title: 'Check-in no Little Riverside (a partir das 14:00)', period: 'evening', hotelId: 'h-little-riverside', placeId: 'little-riverside', status: 'confirmed' },
    ]),
  },
  {
    date: '2026-11-29', cityIds: ['hoi-an'], hotelId: 'h-little-riverside',
    title: 'Ancient Town + lanternas',
    summary: 'Uma das cidades mais charmosas e fotogênicas do Vietnã — e a experiência noturna é completamente diferente da diurna.',
    activities: sug([
      { id: 'd7-ancient-town', kind: 'activity', title: 'Centro histórico', placeId: 'ancient-town', description: 'Casas históricas, templos, cafés, lojinhas e restaurantes. Não precisa reservar.' },
      { id: 'd7-bridge', kind: 'activity', title: 'Japanese Covered Bridge', placeId: 'japanese-bridge' },
      { id: 'd7-lanterns', kind: 'activity', title: 'Hoi An iluminada por lanternas', period: 'evening', placeId: 'ancient-town', highlight: true },
    ]),
  },
  {
    date: '2026-11-30', cityIds: ['hoi-an'], hotelId: 'h-little-riverside',
    title: 'Campo + gastronomia + descanso',
    summary: 'Deliberadamente o dia mais lento da viagem. Última noite em Hoi An.',
    activities: sug([
      { id: 'd8-tra-que', kind: 'activity', title: 'Tra Que', placeId: 'tra-que' },
      { id: 'd8-bike', kind: 'activity', title: 'Bicicleta pela zona rural' },
      { id: 'd8-cooking', kind: 'activity', title: 'Cooking class', bookingId: 'b-cooking-class', status: 'pending' },
      { id: 'd8-spa', kind: 'free-time', title: 'Spa ou piscina · tarde sem compromisso', period: 'afternoon' },
      { id: 'd8-my-son', kind: 'note', title: 'Alternativa: My Son', placeId: 'my-son', description: 'Se houver bastante interesse por arqueologia. Opcional — com Hue no roteiro, não é considerado necessário.' },
    ]),
  },
  {
    date: '2026-12-01', cityIds: ['hoi-an', 'hue'], hotelId: 'h-melia-hue',
    title: 'Road trip pelo Hai Van Pass',
    summary: 'Em vez de perder um dia com deslocamento, a própria viagem entre Hoi An e Hue vira passeio.',
    activities: sug([
      { id: 'd9-checkout', kind: 'check-out', title: 'Check-out do Little Riverside (até 12:00)', period: 'morning', hotelId: 'h-little-riverside', placeId: 'little-riverside', status: 'confirmed' },
      { id: 'd9-road-trip', kind: 'transfer', title: 'Carro privado: Da Nang → Hai Van Pass → Lang Co → Hue', period: 'morning', bookingId: 'b-hai-van', placeId: 'hai-van', highlight: true, status: 'pending' },
      { id: 'd9-lang-co', kind: 'activity', title: 'Lang Co', period: 'morning', placeId: 'lang-co' },
      { id: 'd9-khai-dinh', kind: 'activity', title: 'Khai Dinh Tomb', period: 'afternoon', placeId: 'khai-dinh' },
      { id: 'd9-checkin', kind: 'check-in', title: 'Check-in no Meliá Vinpearl Hue', time: '14:00', hotelId: 'h-melia-hue', placeId: 'melia-vinpearl-hue', status: 'confirmed' },
    ]),
  },
  {
    date: '2026-12-02', cityIds: ['hue', 'ho-chi-minh'], hotelId: 'h-fusion-saigon',
    title: 'Vietnã imperial',
    summary: 'Hue acrescenta algo que não existe no restante do roteiro: a história imperial vietnamita. Depois, voo para Ho Chi Minh City.',
    activities: sug([
      { id: 'd10-checkout', kind: 'check-out', title: 'Check-out do Meliá Vinpearl Hue (até 12:00)', period: 'morning', hotelId: 'h-melia-hue', placeId: 'melia-vinpearl-hue', status: 'confirmed' },
      { id: 'd10-imperial', kind: 'activity', title: 'Imperial City / Citadel', period: 'morning', placeId: 'imperial-city', highlight: true },
      { id: 'd10-thien-mu', kind: 'activity', title: 'Thien Mu Pagoda', period: 'morning', placeId: 'thien-mu' },
      { id: 'd10-perfume', kind: 'activity', title: 'Perfume River', period: 'morning', placeId: 'perfume-river' },
      { id: 'd10-lunch', kind: 'meal', title: 'Almoço em Hue', period: 'afternoon' },
      { id: 'd10-to-airport', kind: 'transfer', title: 'Ida ao Aeroporto de Hue (Phu Bai)', period: 'afternoon', placeId: 'hui-airport' },
      { id: 'd10-flight', kind: 'flight', title: 'Voo Hue → Ho Chi Minh City', time: '17:50', endTime: '19:15', flightId: 'hui-sgn', status: 'confirmed' },
      { id: 'd10-checkin', kind: 'check-in', title: 'Check-in no Fusion Original Saigon Centre', period: 'evening', hotelId: 'h-fusion-saigon', placeId: 'fusion-saigon', status: 'confirmed', notes: 'Caução de VND 1.000.000 em dinheiro; levar o cartão físico do pré-pagamento.' },
      { id: 'd10-dinner', kind: 'meal', title: 'Jantar', period: 'evening' },
    ]),
  },
  {
    date: '2026-12-03', cityIds: ['ho-chi-minh'], hotelId: 'h-fusion-saigon',
    title: 'Guerra + Saigon moderna',
    summary: 'Provavelmente o dia historicamente mais forte da viagem — e também mostra o Vietnã moderno.',
    activities: sug([
      { id: 'd11-war-remnants', kind: 'activity', title: 'War Remnants Museum', placeId: 'war-remnants', highlight: true },
      { id: 'd11-independence', kind: 'activity', title: 'Independence Palace', placeId: 'independence-palace' },
      { id: 'd11-center', kind: 'activity', title: 'Centro histórico e Nguyen Hue', placeId: 'nguyen-hue', description: 'Cafés e restaurantes.' },
      { id: 'd11-rooftop', kind: 'activity', title: 'Rooftop', period: 'evening' },
    ]),
  },
  {
    date: '2026-12-04', cityIds: ['ho-chi-minh'], hotelId: 'h-fusion-saigon',
    title: 'Cu Chi Tunnels — a guerra na prática',
    summary: 'Depois do War Remnants Museum, os túneis tornam muito mais concreta a compreensão de como a guerra funcionava no terreno.',
    activities: sug([
      { id: 'd12-cu-chi', kind: 'activity', title: 'Cu Chi Tunnels', period: 'morning', placeId: 'cu-chi', bookingId: 'b-cu-chi', highlight: true, status: 'pending', description: 'Preferência por passeio de meio dia.' },
      { id: 'd12-return', kind: 'transfer', title: 'Volta para Ho Chi Minh City', period: 'afternoon' },
      { id: 'd12-free', kind: 'free-time', title: 'Spa, compras, cafés e tempo livre', period: 'afternoon' },
    ]),
  },
  {
    date: '2026-12-05', cityIds: ['ho-chi-minh'], hotelId: 'h-fusion-saigon',
    title: 'Delta do Mekong — bate-volta a Ben Tre',
    summary: 'Uma paisagem e um modo de vida que ainda não aparecem em nenhum outro momento da viagem. Ben Tre em vez de um roteiro gigantesco pelo Delta.',
    activities: sug([
      { id: 'd13-departure', kind: 'transfer', title: 'Saída de Ho Chi Minh City', period: 'morning' },
      { id: 'd13-mekong', kind: 'activity', title: 'Navegação pelo Mekong em Ben Tre', period: 'morning', placeId: 'ben-tre', bookingId: 'b-mekong', highlight: true, status: 'pending', description: 'Pequenos canais cercados por coqueiros, sampan tradicional, vilarejos, bicicleta ou caminhada pela zona rural e pequenos produtores locais.' },
      { id: 'd13-lunch', kind: 'meal', title: 'Almoço na região', period: 'afternoon' },
      { id: 'd13-return', kind: 'transfer', title: 'Retorno para Ho Chi Minh City', period: 'afternoon', description: 'No fim da tarde.' },
    ]),
  },
  {
    date: '2026-12-06', cityIds: ['ho-chi-minh'],
    title: 'Último dia sem correria',
    summary: 'Voo somente às 19h40, então ainda existe boa parte do dia para aproveitar.',
    summaryFor: { arthur: 'Último dia em Ho Chi Minh City, sem correria. O voo de saída do Arthur ainda não foi informado.' },
    activities: sug([
      { id: 'd14-breakfast', kind: 'meal', title: 'Café da manhã sem pressa / brunch', period: 'morning' },
      { id: 'd14-shopping', kind: 'activity', title: 'Últimas compras e café vietnamita', period: 'morning' },
      { id: 'd14-spa', kind: 'free-time', title: 'Massagem ou spa', period: 'morning' },
      { id: 'd14-lunch', kind: 'meal', title: 'Almoço', period: 'afternoon' },
      { id: 'd14-checkout', kind: 'check-out', title: 'Check-out do Fusion (até 12:00) — pedir late checkout', period: 'afternoon', hotelId: 'h-fusion-saigon', placeId: 'fusion-saigon', notes: 'Banho e troca de roupa antes do voo. Pegar de volta a caução.' },
      { id: 'd14-to-airport', parties: ['casal'], kind: 'transfer', title: 'Sair do hotel para o aeroporto', time: '15:15', placeId: 'sgn-airport', notes: 'Entre 15h15 e 15h30, para chegar com boa antecedência para o voo internacional.' },
      { id: 'd14-arthur-exit', parties: ['arthur'], kind: 'flight', title: 'Saída do Arthur do Vietnã', period: 'evening', bookingId: 'b-arthur-saida', status: 'pending', notes: 'Voo e horário ainda não informados.' },
      { id: 'd14-flight', parties: ['casal'], kind: 'flight', title: 'Voo Ho Chi Minh City → Doha', time: '19:40', flightId: 'sgn-doh', status: 'confirmed' },
      { id: 'd14-flight-gru', parties: ['casal'], kind: 'flight', title: 'Conexão Doha → São Paulo', period: 'evening', flightId: 'doh-gru', status: 'confirmed', description: 'Chegada em Doha às 23:40 (horário de Doha); voo para São Paulo às 00:25 de 07/12, chegada 09:30.' },
    ]),
  },
];

export const tripData: TripData = {
  trip: {
    id: 'vietnam-2026',
    title: 'Our Vietnam Trip',
    subtitle: 'Vietnã · 2026',
    startDate: '2026-11-23',
    endDate: '2026-12-06',
    datesConfirmed: true,
    timeZone: 'Asia/Ho_Chi_Minh',
    dataStatus: 'imported',
    parties: [
      { id: 'casal', name: 'Débora e Renato' },
      { id: 'arthur', name: 'Arthur' },
    ],
    intro: 'Hanói → Ninh Binh → Ha Long Bay → Hoi An → Hue → Ho Chi Minh City: 13 noites no Vietnã.',
  },
  cities,
  places,
  hotels,
  airports,
  flights,
  bookings,
  days,
};
