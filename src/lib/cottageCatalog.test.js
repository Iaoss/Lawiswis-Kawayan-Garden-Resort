import { COTTAGE_IDS, COTTAGE_OPTIONS, applyCottageCatalog, calculateBookingPrice, getCottageCatalogError, getCottageFee, getCottageLabel } from './bookingPricing';

const room = { type: 'Standard', name: 'Couple', price: 3000, capacity: 2 };

describe('editable cottage list', () => {
  test('defaults are the four resort cottages', () => {
    expect(COTTAGE_IDS).toEqual(['umbrella-hut', 'garden-cabana', 'poolside-cabana', 'pavilion']);
    expect(getCottageFee('pavilion')).toBe(3000);
  });

  test('a saved list replaces them; removed cottages stay for old bookings', () => {
    applyCottageCatalog({ cottages: [
      { id: 'umbrella-hut', name: 'Umbrella Hut', maxGuests: 6, price: 600 },
      { id: 'kubo', name: 'Bamboo Kubo', maxGuests: 8, price: 800 },
      { id: 'pavilion', name: 'Pavilion', maxGuests: 20, price: 3000, archived: true },
    ] });
    expect(COTTAGE_IDS).toEqual(['umbrella-hut', 'kubo']);
    expect(COTTAGE_OPTIONS.map(o => o.id)).toEqual(['', 'umbrella-hut', 'kubo']);
    expect(getCottageFee('kubo')).toBe(800);
    expect(getCottageFee('pavilion')).toBeNull(); // can't be booked any more
    expect(getCottageLabel('pavilion')).toBe('Pavilion (up to 20 guests)');
    // An old booking with the removed cottage can still be repriced.
    expect(calculateBookingPrice({ room, bookingType: 'overnight', nights: 1, adults: 2, children: 0, cottageId: 'pavilion', cottageFee: 3000 }).subtotalAmount).toBe(6000);
  });

  test('bad entries are rejected', () => {
    expect(getCottageCatalogError({ name: 'K', maxGuests: 5, price: 100 })).toMatch(/name/);
    expect(getCottageCatalogError({ name: 'Kubo', maxGuests: 0, price: 100 })).toMatch(/guests/);
    expect(getCottageCatalogError({ name: 'Kubo', maxGuests: 5, price: 0 })).toMatch(/price/);
    expect(getCottageCatalogError({ id: 'b', name: 'kubo', maxGuests: 5, price: 100 }, [{ id: 'a', name: 'Kubo' }])).toMatch(/already/);
    expect(applyCottageCatalog(null)).toBe(false);
  });
});

test('an existing booking keeps its cottage fee after the admin changes the price', () => {
  applyCottageCatalog({ cottages: [{ id: 'umbrella-hut', name: 'Umbrella Hut', maxGuests: 6, price: 700 }] });
  expect(() => calculateBookingPrice({ room, bookingType: 'overnight', nights: 1, adults: 2, children: 0, cottageId: 'umbrella-hut', cottageFee: 500 })).toThrow(/cottage rate/);
  expect(calculateBookingPrice({ room, bookingType: 'overnight', nights: 1, adults: 2, children: 0, cottageId: 'umbrella-hut', cottageFee: 500, keepCottageFee: true }).subtotalAmount).toBe(3500);
});
