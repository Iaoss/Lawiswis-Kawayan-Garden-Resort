import { calculateBookingPrice, getRoomBaseRate } from './bookingPricing';

describe('booking pricing', () => {
  it('uses the configured daytour and overnight room rates', () => {
    const coupleRoom = { type: 'Deluxe', price: 3000 };

    expect(getRoomBaseRate(coupleRoom, 'daytour')).toEqual({ amount: 2000, baseCapacity: 2 });
    expect(getRoomBaseRate(coupleRoom, 'overnight')).toEqual({ amount: 3000, baseCapacity: 2 });
  });

  it.each([
    [{ type: 'FamilyRoom', baseCapacity: 4 }, 3600, 4600, 4],
    [{ type: 'FamilyRoom', baseCapacity: 6 }, 5200, 6200, 6],
    [{ type: 'FamilySuite', baseCapacity: 4 }, 4100, 5600, 4],
    [{ type: 'FamilySuite', baseCapacity: 6 }, 5700, 7200, 6],
    [{ type: 'JuniorSuite4' }, 6500, 8000, 4],
    [{ name: 'Paraiso Suite for 8', type: 'PresidentialSuite' }, 10000, 12000, 8],
    [{ name: 'Halimuyak Suite for 8', type: 'PresidentialSuite' }, 10000, 12000, 8],
    [{ name: 'Main Villa for 20', type: 'MainVilla' }, 18500, 24500, 20],
  ])('configures %o at both stay rates', (room, daytour, overnight, capacity) => {
    expect(getRoomBaseRate(room, 'daytour')).toEqual({ amount: daytour, baseCapacity: capacity });
    expect(getRoomBaseRate(room, 'overnight')).toEqual({ amount: overnight, baseCapacity: capacity });
  });

  it('charges adult and child overnight extras per night and adds cottage fees', () => {
    expect(calculateBookingPrice({
      room: { type: 'FamilyRoom', baseCapacity: 4, price: 4600 },
      bookingType: 'overnight',
      nights: 2,
      adults: 5,
      children: 1,
      cottageId: 'umbrella-hut',
      cottageFee: 500,
    })).toMatchObject({
      baseRate: 4600,
      baseCapacity: 4,
      totalGuests: 6,
      extraGuests: 2,
      extraAdults: 1,
      extraChildren: 1,
      extraAdultRate: 800,
      extraChildRate: 400,
      extraGuestCharge: 2400,
      cottageFee: 500,
      subtotalAmount: 12100,
    });
  });

  it('uses child and adult night-swimming rates for daytour extra guests', () => {
    expect(calculateBookingPrice({
      room: { name: 'Hiwaga', type: 'JuniorSuite4', price: 8000 },
      bookingType: 'daytour',
      nights: 1,
      adults: 4,
      children: 2,
      tourPeriod: 'night',
    })).toMatchObject({
      baseRate: 6500,
      baseCapacity: 4,
      extraGuests: 2,
      extraGuestCharge: 750,
      subtotalAmount: 7250,
    });
  });

  it('multiplies daytour extra-adult and extra-child charges by the number of booked days', () => {
    expect(calculateBookingPrice({
      room: { name: 'Couple Room', price: 3000 },
      bookingType: 'daytour',
      nights: 2,
      adults: 3,
      children: 1,
      tourPeriod: 'day',
    })).toMatchObject({
      extraAdults: 1,
      extraChildren: 1,
      extraAdultRate: 375,
      extraChildRate: 275,
      extraGuestCharge: 1300,
      subtotalAmount: 5300,
    });
  });

  it('rejects cottage fees that do not match the selected cottage', () => {
    expect(() => calculateBookingPrice({
      room: { type: 'Deluxe', price: 3000 },
      bookingType: 'overnight',
      nights: 1,
      adults: 2,
      children: 0,
      cottageId: 'pavilion',
      cottageFee: 1000,
    })).toThrow('Choose a valid cottage rate.');
  });
});
