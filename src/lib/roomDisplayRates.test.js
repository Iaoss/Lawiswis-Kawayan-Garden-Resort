import { calculateBookingPrice, getRoomDisplayRates } from './bookingPricing';

const tryy2 = { roomNumber: 'TRYY2', type: 'JuniorSuite4', baseCapacity: 4, price: 4000 };
const price = (room, extra) => calculateBookingPrice({ room, bookingType: 'overnight', nights: 1, adults: 2, children: 0, ...extra });

test('the price staff set covers the room for up to its guests', () => {
  expect(getRoomDisplayRates(tryy2)).toEqual({ overnight: 4000, daytour: 4000, baseCapacity: 4, fromRateList: false });
  expect(price(tryy2).subtotalAmount).toBe(4000);
  expect(price(tryy2, { adults: 4 }).subtotalAmount).toBe(4000);
});

test('each guest above the room count pays the extra-person rate', () => {
  const six = price(tryy2, { adults: 6 });
  expect(six).toMatchObject({ extraGuests: 2, extraGuestCharge: 1600, subtotalAmount: 5600 });
  expect(price(tryy2, { adults: 5, nights: 2 }).subtotalAmount).toBe(4000 * 2 + 800 * 2);
  // Day tour extra person (₱375).
  expect(price(tryy2, { bookingType: 'daytour', adults: 5 }).subtotalAmount).toBe(4000 + 375);
});

test('a separate day-tour price can be set', () => {
  expect(price({ ...tryy2, dayTourPrice: 3000 }, { bookingType: 'daytour' }).subtotalAmount).toBe(3000);
});

test('the built-in rate list only applies when no price is set', () => {
  expect(getRoomDisplayRates({ type: 'JuniorSuite4' })).toEqual({ overnight: 8000, daytour: 6500, baseCapacity: 4, fromRateList: true });
  // Day tour never costs more than the room's own nightly price.
  expect(getRoomDisplayRates({ type: 'JuniorSuite4', price: 5000 }).daytour).toBe(5000);
});

test('the receipt shows each extra person', () => {
  const { getReceiptLineItems } = require('./receiptItems');
  const p = calculateBookingPrice({ room: tryy2, bookingType: 'overnight', nights: 2, adults: 6, children: 0 });
  const items = getReceiptLineItems({ roomNumber: 'TRYY2', nights: 2, bookingType: 'overnight', baseRate: p.baseRate, baseCapacity: p.baseCapacity, extraGuests: p.extraGuests, extraGuestCharge: p.extraGuestCharge, totalAmount: p.subtotalAmount });
  expect(items.booking.map(i => i.label)).toEqual(['Room TRYY2 · ₱4,000 × 2 nights', 'Extra persons · 2 × ₱800 × 2 nights (room is for 4)']);
  expect(items.grandTotal).toBe(8000 + 3200);
});
