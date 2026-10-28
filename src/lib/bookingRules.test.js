import {
  getCorporateNights, getCorporatePackage, getEarliestGroupDate, getGroupAdvanceNoticeError, getGroupGuestError, MAX_GROUP_GUESTS,
} from './corporatePackages';
import { getOvernightCutoffError } from './bookingPricing';
import { getReceiptLineItems } from './receiptItems';
import { buildBookingNotifications } from '../admin/lib/bookingNotifications';

// 2026-10-27, 3:00 PM Philippine time (07:00 UTC).
const now = new Date('2026-10-27T07:00:00Z');

describe('group booking price', () => {
  test('multiplies guests × rate per guest × nights', () => {
    // 11/04 to 11/30 is 26 nights: 15 × ₱2,000 × 26 = ₱780,000.
    expect(getCorporateNights('overnight', '2026-11-04', '2026-11-30')).toBe(26);
    expect(getCorporatePackage(15, 26)).toMatchObject({ id: 'core', perNightAmount: 30000, totalAmount: 780000, nights: 26 });
  });
  test('counts a day tour as one', () => {
    expect(getCorporateNights('daytour', '2026-11-04', '2026-11-04')).toBe(1);
    expect(getCorporatePackage(15, 1).totalAmount).toBe(30000);
  });
  test('gives 0 nights until the dates are valid', () => {
    expect(getCorporateNights('overnight', '2026-11-04', '')).toBe(0);
    expect(getCorporateNights('overnight', '2026-11-04', '2026-11-04')).toBe(0);
  });
});

describe('group bookings', () => {
  test('allow 15 to 250 guests', () => {
    expect(MAX_GROUP_GUESTS).toBe(250);
    expect(getCorporatePackage(250)).toMatchObject({ id: 'flex', totalAmount: 750000 });
    expect(getCorporatePackage(251)).toBeNull();
    expect(getGroupGuestError(250)).toBe('');
    expect(getGroupGuestError(251)).toMatch(/up to 250/);
    expect(getGroupGuestError(14)).toMatch(/start at 15/);
  });

  test('must be booked at least a week ahead', () => {
    expect(getEarliestGroupDate(now)).toBe('2026-11-03');
    expect(getGroupAdvanceNoticeError('2026-11-03', now)).toBe('');
    expect(getGroupAdvanceNoticeError('2026-11-02', now)).toMatch(/at least 7 days/);
    expect(getGroupAdvanceNoticeError('2026-10-27', now)).toMatch(/November 3, 2026/);
  });

  test('use the Philippine date, even just after midnight', () => {
    // 12:30 AM on Oct 28 in Manila is still Oct 27 in UTC.
    const earlyMorning = new Date('2026-10-27T16:30:00Z');
    expect(getEarliestGroupDate(earlyMorning)).toBe('2026-11-04');
  });
});

describe('overnight check-in cutoff', () => {
  test('rejects a check-in time that has already passed today', () => {
    expect(getOvernightCutoffError('2026-10-27', 'morning', now)).toMatch(/has passed/);
    expect(getOvernightCutoffError('2026-10-27', 'afternoon', now)).toMatch(/has passed/);
    expect(getOvernightCutoffError('2026-10-27', 'evening', now)).toBe('');
    expect(getOvernightCutoffError('2026-10-28', 'morning', now)).toBe('');
  });

  test('says when every check-in time today is over', () => {
    const late = new Date('2026-10-27T11:30:00Z'); // 7:30 PM
    expect(getOvernightCutoffError('2026-10-27', 'evening', late)).toMatch(/All of today/);
  });
});

describe('itemized receipts', () => {
  test('list the room, cottage, discount, and every service', () => {
    const items = getReceiptLineItems({
      roomNumber: '5', roomType: 'Family Room', bookingType: 'overnight', nights: 2,
      baseRate: 3600, extraGuestCharge: 500, cottageId: 'cabana', cottageFee: 1500,
      promoCode: 'SUMMER', promoDiscount: 600, totalAmount: 8600,
      extraCharges: 1800,
      extraChargeItems: [
        { description: 'Spa · 1 hour (20% off)', amount: 800, serviceId: 'spa' },
        { description: 'Minibar', amount: 500 },
      ],
      lateCheckoutCharges: [{ amount: 500, note: '1 h late' }],
    });
    expect(items.booking.map(i => i.amount)).toEqual([7200, 500, 1500, -600]);
    expect(items.booking[2].label).toBe('Cottage: Cabana');
    expect(items.extras.map(i => i.label)).toEqual(['Spa · 1 hour (20% off)', 'Minibar', 'Late check-out (1 h late)']);
    expect(items.extrasTotal).toBe(1800);
    expect(items.grandTotal).toBe(10400);
  });

  test('leave out the services section when nothing was added', () => {
    const items = getReceiptLineItems({ roomNumber: '2', nights: 1, baseRate: 2000, totalAmount: 2000 });
    expect(items.booking).toHaveLength(1);
    expect(items.extras).toEqual([]);
  });

  test('show group packages as one line', () => {
    const items = getReceiptLineItems({ type: 'corporate', packageName: 'Bamboo Grand', totalGuests: 40, packageRate: 2500, nights: 2, totalAmount: 200000 });
    expect(items.booking).toEqual([{ label: 'Bamboo Grand · 40 guests × ₱2,500 × 2 nights', amount: 200000 }]);
  });
});

describe('staff notifications', () => {
  const nowMs = now.getTime();
  const at = msAgo => ({ seconds: (nowMs - msAgo) / 1000 });
  const reservations = [
    { id: 'aaaaaaaa1', type: 'online', status: 'confirmed', paymentStatus: 'paid', guestName: 'Paid Guest', createdAt: at(60000) },
    { id: 'bbbbbbbb2', type: 'corporate', status: 'pending', guestName: 'Group Lead', createdAt: at(3600000) },
    { id: 'cccccccc3', type: 'walk-in', status: 'confirmed', guestName: 'Walk In', createdAt: at(60000) },
    { id: 'dddddddd4', type: 'online', status: 'confirmed', guestName: 'Old Booking', createdAt: at(30 * 86400000), refundRequestStatus: 'eligible', refundRequestedAt: at(120000) },
  ];

  test('include paid and group bookings, not just pending online ones', () => {
    const list = buildBookingNotifications(reservations, { prefix: '/receptionist', now: nowMs });
    const ids = list.map(n => n.id);
    expect(ids).toContain('new-booking_aaaaaaaa1');
    expect(ids).toContain('new-booking_bbbbbbbb2');
    expect(ids).not.toContain('new-booking_cccccccc3'); // staff made it
    expect(ids).not.toContain('new-booking_dddddddd4'); // older than 7 days
    expect(ids).toContain('refund-requested_dddddddd4');
    expect(list.find(n => n.id === 'new-booking_bbbbbbbb2').badge).toBe('New Group Booking');
    expect(list[0].path).toBe('/receptionist/reservations');
  });

  test('newest first', () => {
    const list = buildBookingNotifications(reservations, { now: nowMs });
    expect(list.map(n => n.timeMs)).toEqual([...list.map(n => n.timeMs)].sort((a, b) => b - a));
  });
});
