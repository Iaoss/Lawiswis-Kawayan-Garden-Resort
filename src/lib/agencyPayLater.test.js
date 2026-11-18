import { agencyPromiseText, formatTermsLength, groupBillsByAgency } from './agencyBilling';
import { buildBookingNotifications } from '../admin/lib/bookingNotifications';

const now = new Date('2026-11-14T02:00:00Z'); // Nov 14, 10 AM in Manila
const deped = (id, extra = {}) => ({
  id, chargeToAgency: true, companyName: 'Department of Education', status: 'checked-out',
  checkIn: '2026-10-01', checkOut: '2026-10-03', totalAmount: 50000, amountPaid: 0,
  agencyBilling: { poNumber: 'PO-1', paymentTermsDays: 30 }, ...extra,
});

test('payment terms read in days and weeks', () => {
  expect(formatTermsLength(30)).toBe('30 days (about 4 weeks)');
  expect(formatTermsLength(14)).toBe('14 days (2 weeks)');
  expect(formatTermsLength(5)).toBe('5 days');
  expect(formatTermsLength(0)).toBe('on check-out');
});

test('the promise names the agency, the terms and the due date', () => {
  expect(agencyPromiseText(deped('a'), { now })).toBe('Department of Education promised to pay within 30 days (about 4 weeks) after check-out, by Nov 2, 2026.');
  expect(agencyPromiseText({ id: 'x', chargeToAgency: false })).toBe('');
});

test('pay-later bills are grouped per agency, overdue first', () => {
  const groups = groupBillsByAgency([
    deped('a'),
    deped('b', { checkOut: '2026-11-20', checkIn: '2026-11-18', agencyBilling: { poNumber: '', paymentTermsDays: 14 } }),
    deped('c', { companyName: 'DOH Region III', checkOut: '2026-11-10', totalAmount: 8000 }),
    { id: 'walkin', chargeToAgency: false, totalAmount: 999 },
  ], r => r.totalAmount - r.amountPaid, { now });
  expect(groups.map(g => g.agency)).toEqual(['Department of Education', 'DOH Region III']);
  expect(groups[0]).toMatchObject({ owed: 100000, overdueCount: 1, overdueAmount: 50000, waitingPo: 1 });
  expect(groups[1]).toMatchObject({ owed: 8000, overdueCount: 0, nextDue: '2026-12-10' });
});

test('the bell shows new pay-later bookings and overdue agency payments', () => {
  const fresh = deped('new1', { status: 'pending', checkIn: '2026-12-01', checkOut: '2026-12-02', createdAt: { toMillis: () => now.getTime() - 60000 } });
  const items = buildBookingNotifications([fresh, deped('old1')], { prefix: '/admin', now: now.getTime() });
  const badges = items.map(i => i.badge);
  expect(badges).toContain('New Pay-Later Booking · Agency');
  expect(badges).toContain('Agency Payment Overdue');
  expect(items.find(i => i.badge.startsWith('New Pay-Later')).details).toContain('pays within 30 days (about 4 weeks) after check-out');
  expect(items.every(i => i.path === '/admin/billing' || !i.badge.includes('Agency'))).toBe(true);
});
