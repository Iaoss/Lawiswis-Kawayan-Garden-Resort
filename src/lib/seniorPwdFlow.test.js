import { roomAccessLabel, roomFloor, roomHasStairs, roomIsStepFree } from './roomAccess';

const mockSent = [];
jest.mock('nodemailer', () => ({ createTransport: () => ({ sendMail: async mail => { mockSent.push(mail); return {}; } }) }));
jest.mock('../../lib/firebaseAdmin', () => ({ adminDb: null, FieldValue: {} }));

describe('rooms for seniors / PWD', () => {
  test('the floor staff set wins over the description', () => {
    expect(roomFloor({ floor: 'ground', description: 'second floor of the old building' })).toBe('ground');
    expect(roomHasStairs({ floor: 'upper' })).toBe(true);
    expect(roomIsStepFree({ location: 'First floor, new building' })).toBe(true);
  });

  test('a room with no floor recorded is not treated as stair-free', () => {
    const tryy2 = { roomNumber: 'TRYY2', type: 'JuniorSuite4' };
    expect(roomHasStairs(tryy2)).toBe(false);
    expect(roomIsStepFree(tryy2)).toBe(false);
    expect(roomAccessLabel(tryy2)).toEqual({ tone: 'unknown', text: 'Floor not confirmed · ask the resort' });
    expect(roomAccessLabel({ floor: 'ground' }).text).toBe('No stairs · ground floor');
  });
});

describe('Senior / PWD decision email', () => {
  test('shows the price line by line, with each discount and the amount to pay', async () => {
    const { sendDiscountDecisionEmail } = require('../../lib/email');
    mockSent.length = 0;
    const reservation = {
      guestName: 'Lito Reyes', email: 'lito@example.ph', roomNumber: 'Hirang', roomType: 'Couple',
      checkIn: '2026-12-05', checkOut: '2026-12-06', bookingType: 'overnight', nights: 1,
      baseRate: 3000, baseCapacity: 2, totalAmount: 3000, amountPaid: 0, extraCharges: -642.86,
      extraChargeItems: [{ id: 'd1', kind: 'discount', amount: -642.86, description: 'Senior citizen discount (20% + VAT-free) · Lito Reyes · ID 0314100000003045' }],
    };
    await sendDiscountDecisionEmail({ reservation, bookingRef: 'ABCD1234', approved: true, amount: 2357.14, paymentUrl: 'https://pay.example/x' });
    const html = mockSent[0].html;
    expect(html).toContain('Your price with the discount');
    expect(html).toContain('Senior citizen discount');
    expect(html).toContain('− ₱642.86');
    expect(html).toContain('Amount to pay now');
    expect(html).toContain('₱2,357.14');
    // The ID number is shortened in the email.
    expect(html).not.toContain('0314100000003045');
    expect(html).toContain('ID ••••3045');
  });
});
