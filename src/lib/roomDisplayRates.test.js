import { calculateBookingPrice, getRoomDisplayRates } from './bookingPricing';

test('a Junior Suite shows the rate-list prices it is charged, not the typed price', () => {
  const room = { roomNumber: 'TRYY2', type: 'JuniorSuite4', price: 4000 };
  expect(getRoomDisplayRates(room)).toEqual({ overnight: 8000, daytour: 6500, baseCapacity: 4, fromRateList: true });
  // What a 2-guest day tour is charged matches what is shown.
  const charged = calculateBookingPrice({ room, bookingType: 'daytour', nights: 1, adults: 2, children: 0 });
  expect(charged.subtotalAmount).toBe(6500);
});

test('a room type not on the rate list uses the typed price', () => {
  expect(getRoomDisplayRates({ roomNumber: 'Kubo 1', type: 'Standard', price: 4000, baseCapacity: 3 }))
    .toEqual({ overnight: 4000, daytour: 4000, baseCapacity: 3, fromRateList: false });
});
