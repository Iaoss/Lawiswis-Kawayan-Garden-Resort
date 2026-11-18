import crypto from 'crypto';
import handler from '../../apiHandlers/discount-review';
import { sendDiscountDecisionEmail } from '../../lib/email';
import { createPayMongoCheckoutSession } from '../../lib/paymongoCheckout';
import { verifyStaff } from '../../lib/verifyStaff';
import { applyDiscount } from '../../apiHandlers/staff-billing';

// A small in-memory stand-in for Firestore.
jest.mock('../../lib/firebaseAdmin', () => {
  const store = new Map();
  const DELETE = Symbol('delete');
  const apply = (path, patch) => {
    const next = JSON.parse(JSON.stringify(store.get(path) || {}));
    Object.entries(patch).forEach(([key, value]) => {
      const parts = key.split('.');
      const last = parts.pop();
      const target = parts.reduce((node, part) => { node[part] = node[part] || {}; return node[part]; }, next);
      if (value === DELETE) delete target[last]; else target[last] = value;
    });
    store.set(path, next);
  };
  const docRef = path => ({
    path,
    id: path.split('/')[1],
    get: async () => ({ exists: store.has(path), id: path.split('/')[1], data: () => store.get(path) }),
    update: async patch => apply(path, patch),
  });
  const writer = {
    set: (ref, value) => store.set(ref.path, value),
    update: (ref, patch) => apply(ref.path, patch),
    delete: ref => store.delete(ref.path),
  };
  return {
    __store: store,
    FieldValue: { delete: () => DELETE, serverTimestamp: () => 'now' },
    adminDb: {
      collection: name => ({ doc: id => docRef(`${name}/${id}`) }),
      getAll: async (...refs) => Promise.all(refs.map(ref => ref.get())),
      runTransaction: async fn => fn({ get: ref => ref.get(), ...writer }),
      batch: () => { const jobs = []; return { update: (r, p) => jobs.push(() => writer.update(r, p)), delete: r => jobs.push(() => writer.delete(r)), commit: async () => jobs.forEach(job => job()) }; },
    },
  };
}, { virtual: false });
jest.mock('../../lib/verifyStaff', () => ({ verifyStaff: jest.fn() }));
jest.mock('../../lib/activityLog', () => ({ logActivity: jest.fn(async () => {}) }));
jest.mock('../../lib/email', () => ({ sendDiscountDecisionEmail: jest.fn(async () => {}) }));
jest.mock('../../lib/paymongoCheckout', () => ({ createPayMongoCheckoutSession: jest.fn() }));
jest.mock('../../apiHandlers/staff-billing', () => ({ applyDiscount: jest.fn() }));

const { __store: store } = jest.requireMock('../../lib/firebaseAdmin');
const RES = 'booking12345';
const TOKEN = 'guest-token';
const entry = { holderName: 'Ana Cruz', idNumber: 'OSCA-12345', birthDate: '1950-01-01', photo: 'data:image/jpeg;base64,AAAA' };

const call = async body => {
  const out = {};
  const res = { setHeader() {}, status(code) { out.status = code; return this; }, json(data) { out.body = data; return this; } };
  await handler({ method: 'POST', body: { reservationId: RES, ...body }, headers: { host: 'test' } }, res);
  return out;
};

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
  verifyStaff.mockResolvedValue({ uid: 'staff1', name: 'Maria', role: 'receptionist' });
  createPayMongoCheckoutSession.mockResolvedValue({ checkoutSessionId: 'cs_1', checkoutUrl: 'https://pay.example/1' });
  // The real discount lowers the bill.
  applyDiscount.mockImplementation(async () => { store.get(`reservations/${RES}`).extraCharges = -800; });
  store.set(`reservations/${RES}`, {
    type: 'online', status: 'pending', guestName: 'Ana Cruz', email: 'ana@example.com', roomNumber: 'Dilag', totalAmount: 4000, amountPaid: 0, extraCharges: 0,
    discountReview: { status: 'uploading', kinds: ['senior'], uploaded: [], tokenHash: crypto.createHash('sha256').update(TOKEN).digest('hex') },
  });
});

describe('Senior / PWD ID review', () => {
  it('only accepts IDs with the guest\'s token, then queues the booking for staff', async () => {
    expect((await call({ action: 'upload', token: 'wrong', index: 0, entry })).status).toBe(403);
    expect((await call({ action: 'upload', token: TOKEN, index: 0, entry: { ...entry, birthDate: '2010-01-01' } })).status).toBe(400);
    expect((await call({ action: 'upload', token: TOKEN, index: 0, entry })).body).toMatchObject({ complete: true });
    const review = store.get(`reservations/${RES}`).discountReview;
    expect(review.status).toBe('pending');
    expect(review.tokenHash).toBeUndefined();
    expect(store.get(`discountIdUploads/${RES}_0`).photo).toBe(entry.photo);
  });

  it('keeps ID photos from anyone who is not staff', async () => {
    await call({ action: 'upload', token: TOKEN, index: 0, entry });
    verifyStaff.mockResolvedValue(null);
    expect((await call({ action: 'view' })).status).toBe(401);
    verifyStaff.mockResolvedValue({ uid: 'staff1', name: 'Maria', role: 'receptionist' });
    expect((await call({ action: 'view' })).body.ids[0].photo).toBe(entry.photo);
  });

  it('approval applies the discount, links the discounted amount, emails the guest and deletes the photo', async () => {
    await call({ action: 'upload', token: TOKEN, index: 0, entry });
    expect((await call({ action: 'approve', checkMethod: 'doh', checked: false })).status).toBe(400);
    const { status, body } = await call({ action: 'approve', checkMethod: 'doh', checked: true });
    expect(status).toBe(200);
    expect(applyDiscount).toHaveBeenCalledTimes(1);
    expect(createPayMongoCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ amount: 3200, paymentType: 'booking', paymentChoice: 'full' }));
    expect(body).toMatchObject({ status: 'approved', amount: 3200, emailed: true, paymentUrl: 'https://pay.example/1' });
    expect(sendDiscountDecisionEmail).toHaveBeenCalledWith(expect.objectContaining({ approved: true, amount: 3200 }));
    expect(store.get(`reservations/${RES}`).discountReview.status).toBe('approved');
    expect(store.has(`discountIdUploads/${RES}_0`)).toBe(false);
  });

  it('gives staff the link to send when the guest has no email', async () => {
    store.get(`reservations/${RES}`).email = '';
    store.get(`reservations/${RES}`).phone = '09171234567';
    store.get(`reservations/${RES}`).preferredContactMethod = 'Phone';
    await call({ action: 'upload', token: TOKEN, index: 0, entry });
    const { body } = await call({ action: 'reject', reason: 'The photo is not readable' });
    expect(applyDiscount).not.toHaveBeenCalled();
    expect(sendDiscountDecisionEmail).not.toHaveBeenCalled();
    expect(body).toMatchObject({ status: 'rejected', amount: 4000, emailed: false, contact: { method: 'Phone', phone: '09171234567' } });
    expect(store.has(`discountIdUploads/${RES}_0`)).toBe(false);
  });
});
