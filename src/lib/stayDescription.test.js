import { describeBooking, formatDateRange } from './stayDescription';

test('group bookings show the guests, nights and dates', () => {
  expect(describeBooking({ type: 'corporate', packageName: 'Bamboo Core', totalGuests: 20, checkIn: '2026-11-22', checkOut: '2026-12-07' }))
    .toBe('Bamboo Core · 20 guests · 15 nights (Nov 22 – Dec 7, 2026)');
  expect(describeBooking({ type: 'corporate', packageName: 'Bamboo Grand', totalGuests: 35, bookingType: 'corporate', checkIn: '2026-11-22', checkOut: '2026-11-22' }))
    .toBe('Bamboo Grand · 35 guests · day tour (Nov 22, 2026)');
});

test('rooms, several rooms and tours', () => {
  expect(describeBooking({ roomNumber: 'Hirang', roomType: 'Couple', bookingType: 'overnight', checkIn: '2026-11-22', checkOut: '2026-11-24' }))
    .toBe('Room Hirang (Couple) · 2 nights (Nov 22 – 24, 2026)');
  expect(describeBooking({ roomNumber: 'Hirang', bookingType: 'daytour', tourPeriod: 'night', checkIn: '2026-11-22', checkOut: '2026-11-22' }))
    .toBe('Room Hirang · night tour (Nov 22, 2026)');
  expect(describeBooking({ roomNumber: 'Hirang', bookingType: 'overnight', checkIn: '2026-12-30', checkOut: '2027-01-02' }, { rooms: ['Hirang', 'Aruga'] }))
    .toBe('2 rooms (Room Hirang, Room Aruga) · 3 nights (Dec 30, 2026 – Jan 2, 2027)');
  expect(formatDateRange('2026-11-22', '')).toBe('Nov 22, 2026');
});
