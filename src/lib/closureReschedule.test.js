import { canClosureReschedule, isAffectedByClosure, getClosureMoveError, getSamePriceSuggestions, sameLengthCheckOut } from './closureReschedule';

const booking = { status: 'confirmed', bookingType: 'overnight', checkIn: '2026-11-10', checkOut: '2026-11-12', closureNotice: { closedFrom: '2026-11-09', closedTo: '2026-11-11' } };

describe('closure rescheduling', () => {
  test('only bookings that got a closure notice and are still active', () => {
    expect(canClosureReschedule(booking)).toBe(true);
    expect(canClosureReschedule({ ...booking, closureNotice: null })).toBe(false);
    expect(canClosureReschedule({ ...booking, status: 'cancelled' })).toBe(false);
  });

  test('keeps the same length and avoids the closed dates', () => {
    expect(sameLengthCheckOut(booking, '2026-11-20')).toBe('2026-11-22');
    expect(getClosureMoveError(booking, '2026-11-10', { today: '2026-11-06' })).toMatch(/closed/);
    expect(getClosureMoveError(booking, '2026-11-20', { today: '2026-11-06', maxDate: '2027-01-06' })).toBe('');
    expect(getClosureMoveError(booking, '2026-11-05', { today: '2026-11-06' })).toMatch(/tomorrow/);
  });

  test('suggests free dates with the same price, outside the closure', () => {
    const suggestions = getSamePriceSuggestions({
      reservation: booking, requestedCheckIn: '2026-11-20', today: '2026-11-06', maxDate: '2027-01-06',
      bookedRanges: [{ checkIn: '2026-11-20', checkOut: '2026-11-22' }],
      seasonPeriods: [{ id: 'h', name: 'Holiday', from: '2026-11-21', to: '2026-11-21', percent: 20 }],
    });
    expect(suggestions.length).toBe(3);
    suggestions.forEach(s => {
      expect(s.checkOut).toBe(sameLengthCheckOut(booking, s.checkIn));
      expect(s.checkIn > '2026-11-11' || s.checkOut <= '2026-11-09').toBe(true);
    });
    // No suggestion includes the holiday night (it would change the price).
    expect(suggestions.some(s => s.checkIn <= '2026-11-21' && '2026-11-21' < s.checkOut)).toBe(false);
  });
});

test('isAffectedByClosure finds bookings on the closed days', () => {
  expect(isAffectedByClosure({ checkIn: '2026-11-08', checkOut: '2026-11-08' }, '2026-11-08', '2026-11-08')).toBe(true);
  expect(isAffectedByClosure({ checkIn: '2026-11-07', checkOut: '2026-11-09' }, '2026-11-08', '2026-11-08')).toBe(true);
  expect(isAffectedByClosure({ checkIn: '2026-11-09', checkOut: '2026-11-10' }, '2026-11-07', '2026-11-08')).toBe(false);
  expect(isAffectedByClosure({ checkIn: '2026-11-05', checkOut: '2026-11-06' }, '2026-11-07', '2026-11-08')).toBe(false);
});
