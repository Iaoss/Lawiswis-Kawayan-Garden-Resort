import { getAuth } from 'firebase-admin/auth';
import { adminDb } from '../../lib/firebaseAdmin';
import { verifyStaff } from '../../lib/verifyStaff';

jest.mock('firebase-admin/auth', () => ({ getAuth: jest.fn() }), { virtual: true });
jest.mock('../../lib/firebaseAdmin', () => ({
  adminDb: { collection: jest.fn() },
}));

const request = { headers: { authorization: 'Bearer test-token' } };
const verifyIdToken = jest.fn();
const getUser = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  getAuth.mockReturnValue({ verifyIdToken });
  verifyIdToken.mockResolvedValue({ uid: 'admin-id', email: 'admin@example.test' });
  adminDb.collection.mockReturnValue({ doc: jest.fn().mockReturnValue({ get: getUser }) });
  getUser.mockResolvedValue({ data: () => ({ role: 'admin', status: 'active' }) });
});

test('verifies active staff', async () => {
  await expect(verifyStaff(request)).resolves.toMatchObject({ uid: 'admin-id', role: 'admin' });
});

test('rejects invalid tokens and inactive staff', async () => {
  verifyIdToken.mockRejectedValueOnce({ code: 'auth/id-token-expired' });
  await expect(verifyStaff(request)).resolves.toBeNull();
  getUser.mockResolvedValueOnce({ data: () => ({ role: 'admin', status: 'inactive' }) });
  await expect(verifyStaff(request)).resolves.toBeNull();
});

test('propagates Firestore and authentication service failures', async () => {
  const quotaError = Object.assign(new Error('Quota exceeded'), { code: 8 });
  getUser.mockRejectedValueOnce(quotaError);
  await expect(verifyStaff(request)).rejects.toBe(quotaError);
  const serviceError = Object.assign(new Error('Service unavailable'), { code: 'auth/internal-error' });
  verifyIdToken.mockRejectedValueOnce(serviceError);
  await expect(verifyStaff(request)).rejects.toBe(serviceError);
});
