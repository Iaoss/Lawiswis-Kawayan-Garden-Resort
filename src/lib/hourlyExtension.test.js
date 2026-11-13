import { getHourlyExtensionFee, getScheduledCheckOutMs } from './reservationStatus';
import handler from '../../apiHandlers/reservation-status';
import { adminDb } from '../../lib/firebaseAdmin';
import { verifyStaff } from '../../lib/verifyStaff';

jest.mock('../../lib/firebaseAdmin', () => ({
  adminDb: { collection: jest.fn(), runTransaction: jest.fn() },
  FieldValue: { arrayUnion: value => value, increment: value => value, serverTimestamp: () => 'timestamp' },
}));
jest.mock('../../lib/verifyStaff', () => ({ verifyStaff: jest.fn(), staffCan: jest.fn() }));
jest.mock('../../lib/activityLog', () => ({ logActivity: jest.fn() }));
jest.mock('../../lib/corporateRooms', () => ({ syncCorporateRoomBlocks: jest.fn() }));

const stay = { status: 'checked-in', checkIn: '2026-11-11', checkOut: '2026-11-12', checkOutTime: '12:00 PM', baseRate: 3000, totalAmount: 3000, amountPaid: 3000 };
const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), setHeader: jest.fn() });

beforeEach(() => {
  jest.clearAllMocks();
  verifyStaff.mockResolvedValue({ uid: 'staff', role: 'admin' });
});

test('calculates 10% of the booked room rate for each hour', () => {
  expect(getHourlyExtensionFee(stay, 1)).toBe(300);
  expect(getHourlyExtensionFee(stay, 3)).toBe(900);
  expect(getHourlyExtensionFee({ ...stay, baseRate: 0, totalAmount: 6000 }, 2)).toBeNull();
  expect(getHourlyExtensionFee({ ...stay, baseRate: 0, totalAmount: 0 }, 1)).toBeNull();
  expect(getHourlyExtensionFee(stay, 7)).toBeNull();
});

test('server charges the required fee and extends from the scheduled time even if it is in the past', async () => {
  const ref = { id: 'one' };
  const update = jest.fn();
  adminDb.collection.mockReturnValue({ doc: () => ref });
  adminDb.runTransaction.mockImplementation(fn => fn({ get: async () => ({ exists: true, data: () => stay }), update }));
  const response = res();
  await handler({ method: 'POST', body: { action: 'extend-checkout', reservationId: 'one', hours: 2, amount: 0 } }, response);
  expect(response.status).toHaveBeenCalledWith(200);
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ fee: 600, until: getScheduledCheckOutMs(stay) + 2 * 3600000 }));
  expect(update).toHaveBeenCalledWith(ref, expect.objectContaining({ extraCharges: 600, paymentStatus: 'partial', lateCheckoutCharges: expect.objectContaining({ kind: 'hourly-extension', hours: 2, amount: 600 }) }));
});

test('extends and charges all checked-in group rooms in a single transaction', async () => {
  const first = { id: 'one' };
  const second = { id: 'two' };
  const groupStay = { ...stay, groupId: 'group' };
  const secondStay = { ...groupStay, baseRate: 4000 };
  const query = {};
  const update = jest.fn();
  adminDb.collection.mockReturnValue({ doc: () => first, where: () => query });
  adminDb.runTransaction.mockImplementation(fn => fn({
    get: async target => target === first
      ? { exists: true, data: () => groupStay }
      : { docs: [{ ref: first, data: () => groupStay }, { ref: second, data: () => secondStay }] },
    update,
  }));
  const response = res();
  await handler({ method: 'PATCH', body: { action: 'extend-checkout', reservationId: 'one', extendGroup: true, hours: 2 } }, response);
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ fee: 1400, roomCount: 2 }));
  expect(update).toHaveBeenCalledWith(first, expect.objectContaining({ extraCharges: 600 }));
  expect(update).toHaveBeenCalledWith(second, expect.objectContaining({ extraCharges: 800 }));
  expect(adminDb.runTransaction).toHaveBeenCalledTimes(1);
});

test('rejects extension when a rate cannot be calculated', async () => {
  const ref = { id: 'one' };
  const update = jest.fn();
  adminDb.collection.mockReturnValue({ doc: () => ref });
  adminDb.runTransaction.mockImplementation(fn => fn({ get: async () => ({ exists: true, data: () => ({ ...stay, baseRate: 0, totalAmount: 0 }) }), update }));
  const response = res();
  await handler({ method: 'POST', body: { action: 'extend-checkout', reservationId: 'one', hours: 1 } }, response);
  expect(response.status).toHaveBeenCalledWith(409);
  expect(update).not.toHaveBeenCalled();
});
