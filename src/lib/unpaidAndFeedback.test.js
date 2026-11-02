import { canShowOnWebsite, isShownOnWebsite, awaitsWebsiteDecision } from './feedbackPublishing';
import { describeUnpaidFollowUp, isUnpaidOnlineBooking } from './unpaidBookings';
import { buildBookingNotifications } from '../admin/lib/bookingNotifications';
import { shouldAutoConfirm } from '../../lib/recordPayMongoPayment';

describe('feedback on the website', () => {
  const good = { rating: 5, comment: 'Lovely garden and kind staff.' };

  it('keeps positive reviews off the website until an admin approves them', () => {
    expect(canShowOnWebsite(good)).toBe(true);
    expect(isShownOnWebsite(good)).toBe(false);
    expect(awaitsWebsiteDecision(good)).toBe(true);
    expect(isShownOnWebsite({ ...good, publicStatus: 'approved' })).toBe(true);
  });

  it('never shows a review the admin kept private, or a low rating', () => {
    expect(isShownOnWebsite({ ...good, publicStatus: 'hidden' })).toBe(false);
    expect(awaitsWebsiteDecision({ ...good, publicStatus: 'hidden' })).toBe(false);
    expect(canShowOnWebsite({ rating: 2, comment: 'Dirty pool' })).toBe(false);
    expect(isShownOnWebsite({ rating: 2, comment: 'Dirty pool', publicStatus: 'approved' })).toBe(false);
    expect(canShowOnWebsite({ rating: 5, comment: '' })).toBe(false);
  });
});

describe('unpaid online bookings', () => {
  it('finds pending online bookings with nothing paid', () => {
    expect(isUnpaidOnlineBooking({ type: 'online', status: 'pending', amountPaid: 0 })).toBe(true);
    expect(isUnpaidOnlineBooking({ type: 'online', status: 'pending', amountPaid: 1500 })).toBe(false);
    expect(isUnpaidOnlineBooking({ type: 'online', status: 'confirmed' })).toBe(false);
    expect(isUnpaidOnlineBooking({ type: 'walk-in', status: 'pending' })).toBe(false);
    expect(isUnpaidOnlineBooking({ type: 'online', status: 'cancelled' })).toBe(false);
  });

  it('describes the latest follow-up step', () => {
    const t = () => 'Nov 2';
    expect(describeUnpaidFollowUp({}, t)).toMatch(/No payment yet/);
    expect(describeUnpaidFollowUp({ verifySentAt: 1 }, t)).toMatch(/Asked the guest to confirm Nov 2/);
    expect(describeUnpaidFollowUp({ verifySentAt: 1, guestReply: 'yes', guestRepliedAt: 2 }, t)).toMatch(/theirs/);
    expect(describeUnpaidFollowUp({ guestReply: 'yes', paymentLinkSentAt: 3, paymentLinkAmount: 1500, paymentLinkChoice: 'deposit' }, t))
      .toMatch(/Payment link sent \(deposit, ₱1,500\)/);
  });

  it('flags unpaid bookings and guest replies in the bell', () => {
    const now = Date.parse('2026-11-02T08:00:00Z');
    const createdAt = { seconds: (now - 3600000) / 1000 };
    const list = buildBookingNotifications([
      { id: 'abc12345xyz', type: 'online', status: 'pending', amountPaid: 0, createdAt, guestName: 'Ana',
        unpaidFollowUp: { guestReply: 'yes', guestRepliedAt: { seconds: (now - 60000) / 1000 } } },
      { id: 'paid12345xy', type: 'online', status: 'confirmed', amountPaid: 1500, paymentStatus: 'partial', createdAt, guestName: 'Ben' },
    ], { now });
    const badges = list.map(item => item.badge);
    expect(badges).toContain('New Booking · Unpaid');
    expect(badges).toContain('Guest Replied');
    expect(badges).toContain('New Booking');
  });

  it('confirms a pending booking when a counter or link payment covers the deposit', () => {
    const pending = { status: 'pending', type: 'online', totalAmount: 3000 };
    expect(shouldAutoConfirm(pending, {}, 3000)).toBe(true);
    expect(shouldAutoConfirm(pending, { paymentType: 'booking' }, 1500)).toBe(true);
    expect(shouldAutoConfirm(pending, {}, 100)).toBe(false);
    expect(shouldAutoConfirm({ ...pending, type: 'corporate' }, {}, 3000)).toBe(false);
  });
});
