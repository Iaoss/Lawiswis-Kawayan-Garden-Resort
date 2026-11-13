import staffUsers from '../../apiHandlers/staff-users';
import resortAvailability from '../../apiHandlers/resort-availability';
import { getAuth } from 'firebase-admin/auth';
import { adminDb } from '../../lib/firebaseAdmin';
import { verifyStaff } from '../../lib/verifyStaff';

jest.mock('firebase-admin/auth', () => ({ getAuth: jest.fn() }), { virtual: true });
jest.mock('../../lib/firebaseAdmin', () => ({
  adminDb: { doc: jest.fn(), collection: jest.fn() },
  FieldValue: { serverTimestamp: jest.fn() },
}));
jest.mock('../../lib/verifyStaff', () => ({ verifyStaff: jest.fn() }));
jest.mock('../../lib/activityLog', () => ({ logActivity: jest.fn() }));
jest.mock('../../lib/email', () => ({ sendClosureNoticeEmail: jest.fn() }));

function response() {
  return {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

beforeEach(() => jest.clearAllMocks());

test('staff deletion distinguishes a verification outage from an invalid session', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = response();
  verifyStaff.mockRejectedValueOnce(Object.assign(new Error('Quota exceeded'), { code: 8 }));
  await staffUsers({ method: 'POST' }, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith({ error: expect.stringMatching(/temporarily unavailable/i) });

  verifyStaff.mockResolvedValueOnce(null);
  await staffUsers({ method: 'POST' }, res);
  expect(res.status).toHaveBeenLastCalledWith(401);
  log.mockRestore();
});

test('an active admin can delete another staff account', async () => {
  const res = response();
  const removeLogin = jest.fn().mockResolvedValue();
  const removeRecord = jest.fn().mockResolvedValue();
  getAuth.mockReturnValue({ deleteUser: removeLogin });
  verifyStaff.mockResolvedValue({ uid: 'admin-id', role: 'admin' });
  adminDb.collection.mockReturnValue({
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ name: 'Staff member', role: 'receptionist' }) }),
      delete: removeRecord,
    }),
  });
  await staffUsers({ method: 'POST', body: { action: 'delete-user', uid: 'staff-id' } }, res);
  expect(removeLogin).toHaveBeenCalledWith('staff-id');
  expect(removeRecord).toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(200);
});

test('an admin cannot delete their own account', async () => {
  const res = response();
  verifyStaff.mockResolvedValue({ uid: 'admin-id', role: 'admin' });
  await staffUsers({ method: 'POST', body: { action: 'delete-user', uid: 'admin-id' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(adminDb.collection).not.toHaveBeenCalled();
});

test('availability fails closed when Firestore is unavailable', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = response();
  adminDb.doc.mockReturnValue({ get: jest.fn().mockRejectedValue(new Error('Quota exceeded')) });
  await resortAvailability({ method: 'GET' }, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith({ error: expect.stringMatching(/temporarily unavailable/i) });
  log.mockRestore();
});

test('availability returns the saved closure status', async () => {
  const res = response();
  adminDb.doc.mockReturnValue({
    get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ available: false, reason: 'Maintenance' }) }),
  });
  await resortAvailability({ method: 'GET' }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ available: false, reason: 'Maintenance' }));
});
