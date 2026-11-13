import { buildChatNotifications, buildPaymentNotifications } from './bookingNotifications';

const now = Date.parse('2026-11-13T08:00:00Z');
const at = ms => ({ toMillis: () => ms });

test('payments from the last week show in the bell, newest data kept', () => {
  const items = buildPaymentNotifications([
    { id: 'p1', amount: 1500, method: 'gcash', guestName: 'Ana Cruz', reservationId: 'abcdefgh123', createdAt: at(now - 3600000), recordedByName: 'Front desk' },
    { id: 'p2', amount: 9000, provider: 'paymongo', method: 'card', guestName: 'Ben', reservationId: 'zz', createdAt: at(now - 60000) },
    { id: 'old', amount: 100, createdAt: at(now - 9 * 86400000) },
  ], { prefix: '/admin', now });
  expect(items.map(i => i.id)).toEqual(['payment_p1', 'payment_p2']);
  expect(items[0]).toMatchObject({ badge: 'Payment Recorded', bookingId: 'abcdefgh123' });
  expect(items[0].message).toContain('Ana Cruz');
  expect(items[0].details).toContain('#ABCDEFGH');
  expect(items[1].badge).toBe('Online Payment Received');
});

test('rooms paid together show once with the full amount', () => {
  const items = buildPaymentNotifications([
    { id: 'a', amount: 3000, groupPaymentKey: 'g1', groupLead: true, groupPaymentTotal: 9000, guestName: 'Group', reservationId: 'r1', createdAt: at(now) },
    { id: 'b', amount: 6000, groupPaymentKey: 'g1', groupLead: false, groupPaymentTotal: 9000, reservationId: 'r2', createdAt: at(now) },
  ], { now });
  expect(items).toHaveLength(1);
  expect(items[0].id).toBe('payment_g1');
  expect(items[0].message).toMatch(/9,000/);
});

test('an unread chat stays one notification even after the bot replies', () => {
  const first = buildChatNotifications([{ id: 'c1', unread: true, guestName: 'Liza', lastMessage: 'Hi', lastMessageAt: at(now) }], { c1: now });
  const afterBot = buildChatNotifications([{ id: 'c1', unread: true, guestName: 'Liza', lastMessage: 'Our rates are…', lastMessageAt: at(now + 2000) }], { c1: now });
  expect(first[0].id).toBe(afterBot[0].id);
  expect(buildChatNotifications([{ id: 'c1', unread: false }], {})).toEqual([]);
});
