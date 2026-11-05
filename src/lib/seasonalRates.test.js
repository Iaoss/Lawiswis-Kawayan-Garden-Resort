import { chargedDates, getSeasonPeriodError, getSeasonalAdjustment, normalizeSeasonPeriods } from './seasonalRates';
import { calculateBookingPrice } from './bookingPricing';

const holyWeek = { id: 'hw', name: 'Holy Week', from: '2027-03-21', to: '2027-03-28', percent: 20 };
const room = { type: 'FamilyRoom', price: 4600, capacity: 4 };

describe('seasonal rates', () => {
  test('nights are charged from check-in to the night before check-out', () => {
    expect(chargedDates('2027-03-27', '2027-03-30', 'overnight')).toEqual(['2027-03-27', '2027-03-28', '2027-03-29']);
    expect(chargedDates('2027-03-27', '2027-03-27', 'daytour')).toEqual(['2027-03-27']);
  });

  test('only the nights inside the period get the change', () => {
    const result = getSeasonalAdjustment({ periods: [holyWeek], checkIn: '2027-03-27', checkOut: '2027-03-30', bookingType: 'overnight', roomCharge: 13800 });
    expect(result.amount).toBe(1840); // 2 of 3 nights × ₱4,600 × 20%
    expect(result.label).toBe('Holy Week +20% (2 nights)');
  });

  test('the price calculation adds it to the total, and nothing changes without periods', () => {
    const base = calculateBookingPrice({ room, bookingType: 'overnight', nights: 1, adults: 2, children: 0 });
    const peak = calculateBookingPrice({ room, bookingType: 'overnight', nights: 1, adults: 2, children: 0, season: { periods: [holyWeek], checkIn: '2027-03-25', checkOut: '2027-03-26' } });
    expect(base.seasonalSurcharge).toBe(0);
    expect(peak.seasonalSurcharge).toBe(920);
    expect(peak.subtotalAmount).toBe(base.subtotalAmount + 920);
  });

  test('bad or overlapping periods are rejected', () => {
    expect(getSeasonPeriodError({ ...holyWeek, id: 'x', from: '2027-03-25', to: '2027-04-02' }, [holyWeek])).toMatch(/overlap/);
    expect(getSeasonPeriodError({ ...holyWeek, percent: 0 })).toMatch(/percent/);
    expect(getSeasonPeriodError({ ...holyWeek, to: '2027-03-01' })).toMatch(/end date/);
    expect(getSeasonPeriodError(holyWeek, [holyWeek])).toBe('');
    expect(normalizeSeasonPeriods({ periods: [holyWeek, { id: 'bad', name: 'x', from: 'no', to: 'no', percent: 5 }] })).toHaveLength(1);
  });
});
