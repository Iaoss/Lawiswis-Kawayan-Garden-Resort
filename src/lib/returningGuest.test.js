import { findReturningGuests, guestKeyOf, prepareBookAgain } from '../admin/lib/returningGuests';
import { linkToBooking } from '../../apiHandlers/staff-billing';

jest.mock('../../lib/firebaseAdmin', () => {
  const store = new Map();
  const docRef = path => ({ path, id: path.split('/')[1], get: async () => ({ exists: store.has(path), id: path.split('/')[1], data: () => store.get(path) }) });
  return {
    __store: store,
    FieldValue: { serverTimestamp: () => 'now', delete: () => null, arrayUnion: () => null },
    adminDb: {
      collection: name => ({ doc: id => docRef(`${name}/${id}`) }),
      runTransaction: async fn => fn({ get: ref => ref.get(), update: (ref, patch) => store.set(ref.path, { ...store.get(ref.path), ...patch }) }),
    },
  };
});
jest.mock('../../lib/verifyStaff', () => ({ verifyStaff: jest.fn(), staffCan: () => true }));
jest.mock('../../lib/activityLog', () => ({ logActivity: jest.fn(), describeBillingAction: () => null }));
jest.mock('../../lib/email', () => ({}));

const { __store: store } = jest.requireMock('../../lib/firebaseAdmin');
const at = ms => ({ toMillis: () => ms });

describe('returning guest search', () => {
  const bookings = [
    { id: 'a1', guestName: 'Ana Cruz', firstName: 'Ana', lastName: 'Cruz', phone: '09171234567', email: 'ana@x.ph', preferredContactMethod: 'SMS', status: 'checked-out', checkIn: '2026-10-01', createdAt: at(1) },
    { id: 'a2', guestName: 'Ana Cruz', phone: '+63 917 123 4567', status: 'confirmed', checkIn: '2026-12-01', roomNumber: 'Hirang', createdAt: at(2) },
    { id: 'b1', guestName: 'Ben Santos', phone: '09990001111', status: 'pending', checkIn: '2026-12-05', createdAt: at(3) },
  ];

  test('one entry per guest, matched by name, mobile or email, with their active bookings', () => {
    const [ana] = findReturningGuests(bookings, 'ana');
    expect(ana).toMatchObject({ guestName: 'Ana Cruz', bookingCount: 2, phone: '+63 917 123 4567' });
    expect(ana.activeBookings.map(b => b.id)).toEqual(['a2']);
    expect(findReturningGuests(bookings, '0917123').map(g => g.guestName)).toEqual(['Ana Cruz']);
    expect(findReturningGuests(bookings, 'ana@x').map(g => g.guestName)).toEqual(['Ana Cruz']);
    expect(findReturningGuests(bookings, 'a')).toEqual([]);
    expect(guestKeyOf(bookings[0])).toBe(guestKeyOf(bookings[1]));
  });
});

describe('putting a new stay on the same bill', () => {
  beforeEach(() => {
    store.clear();
    store.set('reservations/old', { guestName: 'Ana Cruz', phone: '09171234567', status: 'confirmed', checkIn: '2026-12-01', checkOut: '2026-12-02' });
    store.set('reservations/new', { guestName: 'Ana Cruz', phone: '09171234567', status: 'pending', checkIn: '2026-12-10', checkOut: '2026-12-11' });
    store.set('reservations/other', { guestName: 'Ben Santos', phone: '09990001111', status: 'pending', checkIn: '2026-12-10', checkOut: '2026-12-11' });
  });

  test('links the same guest’s bookings (different dates are fine)', async () => {
    const result = await linkToBooking({ reservationId: 'new', targetId: 'old' });
    expect(result).toMatchObject({ linked: true, groupId: 'old', count: 2 });
    expect(store.get('reservations/new')).toMatchObject({ groupId: 'old', groupReservationIds: ['old', 'new'], groupRoomCount: 2 });
    expect(store.get('reservations/old').groupReservationIds).toEqual(['old', 'new']);
  });

  test('refuses a different guest or a finished booking', async () => {
    await expect(linkToBooking({ reservationId: 'other', targetId: 'old' })).rejects.toThrow(/different guests/);
    store.set('reservations/old', { ...store.get('reservations/old'), status: 'checked-out' });
    await expect(linkToBooking({ reservationId: 'new', targetId: 'old' })).rejects.toThrow(/pending, confirmed or checked-in/);
  });
});

test('Book again (Customers / Reservations) opens Walk-In with the guest and their active bookings', () => {
  const stays = [
    { id: 'old', guestName: 'Ana Cruz', phone: '09171234567', status: 'checked-out', checkIn: '2026-10-01' },
    { id: 'now', guestName: 'Ana Cruz', phone: '09171234567', status: 'confirmed', checkIn: '2026-12-01', checkOut: '2026-12-02', roomNumber: 'Hirang' },
  ];
  const path = prepareBookAgain({ ...stays[1], email: 'ana@x.ph', preferredContactMethod: 'SMS' }, stays);
  expect(path).toBe('/admin/walkin');
  const saved = JSON.parse(sessionStorage.getItem('lkgr_walkin_prefill'));
  expect(saved.reservation).toMatchObject({ guestName: 'Ana Cruz', phone: '09171234567', email: 'ana@x.ph', preferredContactMethod: 'SMS' });
  expect(saved.activeBookings).toEqual([{ id: 'now', roomNumber: 'Hirang', checkIn: '2026-12-01', checkOut: '2026-12-02', status: 'confirmed' }]);
});
