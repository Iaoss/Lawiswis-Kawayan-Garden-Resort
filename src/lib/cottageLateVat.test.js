import {
  OVERNIGHT_TIME_SLOTS, calculateBookingPrice, calculateCottageTourPrice, getOvernightCutoffError,
  getVatBreakdown, isCheckInPassed, isLateArrivalTime,
} from './bookingPricing';
import { countCottagesInUse, cottageAvailabilityError, getCottageAvailability, normalizeCottageInventory } from './cottages';
import { getReceiptLineItems } from './receiptItems';
import { normalizeBookingDetails, priceBookingDetails } from './bookingDetails';

const couple = { type: 'Couple Room', roomNumber: '101' };
const manila = (h, m = 0) => new Date(Date.UTC(2026, 10, 10, h - 8, m)); // Nov 10, Manila time

describe('12% VAT (prices include VAT)', () => {
  it('splits ₱3,000 into net and VAT', () => {
    expect(getVatBreakdown(3000)).toEqual({ total: 3000, net: 2678.57, vat: 321.43 });
    expect(getVatBreakdown(0)).toEqual({ total: 0, net: 0, vat: 0 });
  });

  it('adds the VAT breakdown to receipts', () => {
    const items = getReceiptLineItems({ roomNumber: '101', baseRate: 3000, nights: 1, totalAmount: 3000 });
    expect(items.vat).toEqual({ total: 3000, net: 2678.57, vat: 321.43 });
  });
});

describe('late arrival after 9 PM', () => {
  const late = OVERNIGHT_TIME_SLOTS.find(slot => slot.lateArrival);

  it('adds 10% of the room rate', () => {
    const price = calculateBookingPrice({ room: couple, bookingType: 'overnight', nights: 1, adults: 2, children: 0, lateArrival: true });
    expect(price.lateArrivalSurcharge).toBe(300);
    expect(price.subtotalAmount).toBe(3300);
    // Only once, for the arrival night.
    expect(calculateBookingPrice({ room: couple, bookingType: 'overnight', nights: 2, adults: 2, children: 0, lateArrival: true }).subtotalAmount).toBe(6300);
    // Tours never get it.
    expect(calculateBookingPrice({ room: couple, bookingType: 'daytour', nights: 1, adults: 2, children: 0, lateArrival: true }).lateArrivalSurcharge).toBe(0);
  });

  it('is applied when the late arrival time is chosen', () => {
    const { details } = normalizeBookingDetails({ bookingType: 'overnight', overnightTimeSlot: 'late', checkIn: '2026-12-01', checkOut: '2026-12-02', adults: 2 }, { now: manila(10) });
    expect(isLateArrivalTime(details.checkInTime)).toBe(true);
    expect(priceBookingDetails(couple, details).lateArrivalSurcharge).toBe(300);
  });

  it('can still be booked for tonight until midnight; earlier slots stay open until the next one', () => {
    expect(isCheckInPassed('2026-11-10', late, manila(23, 30))).toBe(false);
    const evening = OVERNIGHT_TIME_SLOTS.find(slot => slot.id === 'evening');
    expect(isCheckInPassed('2026-11-10', evening, manila(19, 30))).toBe(false);
    expect(isCheckInPassed('2026-11-10', evening, manila(21, 5))).toBe(true);
    expect(getOvernightCutoffError('2026-11-10', 'late', manila(23, 50))).toBe('');
  });
});

describe('cottage-only day and night tours', () => {
  it('charges the entrance per person plus the cottage', () => {
    const price = calculateCottageTourPrice({ adults: 4, children: 2, tourPeriod: 'day', cottageId: 'daybed' });
    expect(price.entranceFee).toBe(4 * 375 + 2 * 275);
    expect(price.subtotalAmount).toBe(2050 + 1000);
    expect(calculateCottageTourPrice({ adults: 2, children: 0, tourPeriod: 'night', cottageId: 'cabana' }).subtotalAmount).toBe(950 + 1500);
  });

  it('needs a cottage that fits the group', () => {
    expect(() => calculateCottageTourPrice({ adults: 2, tourPeriod: 'day', cottageId: '' })).toThrow(/Choose a cottage/);
    expect(() => calculateCottageTourPrice({ adults: 7, tourPeriod: 'day', cottageId: 'daybed' })).toThrow(/seats up to 6/);
  });

  it('lists the entrance and the cottage on the receipt', () => {
    const items = getReceiptLineItems({
      cottageOnly: true, adults: 2, children: 1, tourPeriod: 'day', entranceAdultRate: 375, entranceChildRate: 275,
      entranceFee: 1025, cottageId: 'cabana', cottageFee: 1500, totalAmount: 2525,
    }).booking;
    expect(items).toEqual([
      { label: 'Day tour entrance · 2 adults × ₱375, 1 child × ₱275', amount: 1025 },
      { label: 'Cottage: Cabana', amount: 1500 },
    ]);
  });
});

describe('cottage availability', () => {
  const reservations = [
    { id: 'a', status: 'confirmed', cottageId: 'cabana', bookingType: 'daytour', tourPeriod: 'day', checkIn: '2026-11-10', checkOut: '2026-11-10' },
    { id: 'b', status: 'pending', cottageId: 'cabana', bookingType: 'daytour', tourPeriod: 'night', checkIn: '2026-11-10', checkOut: '2026-11-10' },
    { id: 'c', status: 'checked-in', cottageId: 'cabana', bookingType: 'overnight', checkIn: '2026-11-09', checkOut: '2026-11-11' },
    { id: 'd', status: 'cancelled', cottageId: 'cabana', bookingType: 'daytour', tourPeriod: 'day', checkIn: '2026-11-10', checkOut: '2026-11-10' },
  ];

  it('counts tours by tour time and overnight stays for every day of the stay', () => {
    expect(countCottagesInUse(reservations, '2026-11-10', 'day').cabana).toBe(2);
    expect(countCottagesInUse(reservations, '2026-11-10', 'night').cabana).toBe(2);
    expect(countCottagesInUse(reservations, '2026-11-11', 'day').cabana).toBe(0);
  });

  it('blocks a cottage when all of them are taken, and never when there is no limit', () => {
    const counts = countCottagesInUse(reservations, '2026-11-10', 'day');
    expect(cottageAvailabilityError(getCottageAvailability({ cabana: 2 }, counts), 'cabana')).toMatch(/already booked/);
    expect(cottageAvailabilityError(getCottageAvailability({ cabana: 3 }, counts), 'cabana')).toBe('');
    expect(cottageAvailabilityError(getCottageAvailability({}, counts), 'cabana')).toBe('');
    expect(normalizeCottageInventory({ daybed: '6', cabana: '', pavilion: -1 })).toEqual({ daybed: 6, cabana: null, pavilion: null });
  });
});
