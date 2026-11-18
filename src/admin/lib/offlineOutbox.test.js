import { enqueue, flushOutbox, getOutbox, isQueueable, OFFLINE_PREFIX } from './offlineOutbox';

beforeEach(() => window.localStorage.clear());

describe('offline outbox', () => {
  it('only keeps actions that can safely wait for the internet', () => {
    expect(isQueueable('staff-billing', { action: 'record-payment' })).toBe(true);
    expect(isQueueable('staff-billing', { action: 'create-walk-in' })).toBe(true);
    expect(isQueueable('reservation-status', { action: 'set-status' })).toBe(true);
    expect(isQueueable('staff-billing', { action: 'apply-discount' })).toBe(false);
    expect(isQueueable('staff-billing', { action: 'edit-booking', preview: true })).toBe(false);
  });

  it('sends saved changes in order and swaps in the real booking number of an offline walk-in', async () => {
    const walkIn = enqueue('staff-billing', { action: 'create-walk-in', booking: { firstName: 'Ana' } });
    enqueue('staff-billing', { action: 'record-payment', reservationId: `${OFFLINE_PREFIX}${walkIn.id}`, amount: 2000, method: 'cash' });
    const sent = [];
    const send = async (path, body) => {
      sent.push(body);
      return body.action === 'create-walk-in' ? { reservationId: 'REAL123' } : { ok: true };
    };
    const result = await flushOutbox(send);
    expect(result).toMatchObject({ sent: 2, failed: 0, pending: 0 });
    expect(sent.map(body => body.action)).toEqual(['create-walk-in', 'record-payment']);
    expect(sent[1].reservationId).toBe('REAL123');
    expect(sent.every(body => body.offlineRequestId)).toBe(true);
    expect(getOutbox()).toEqual([]);
  });

  it('keeps changes for later when the connection drops, and flags ones the server refuses', async () => {
    enqueue('reservation-status', { action: 'set-status', reservationId: 'A', status: 'checked-in' });
    const dropped = await flushOutbox(async () => { throw new TypeError('Failed to fetch'); });
    expect(dropped).toMatchObject({ sent: 0, pending: 1 });

    const refused = await flushOutbox(async () => { throw Object.assign(new Error('The guest still owes ₱500.'), { status: 409 }); });
    expect(refused).toMatchObject({ sent: 0, failed: 1, pending: 0 });
    expect(getOutbox()[0]).toMatchObject({ status: 'failed', error: 'The guest still owes ₱500.' });
  });

  it('flags a payment whose offline walk-in was refused', async () => {
    const walkIn = enqueue('staff-billing', { action: 'create-walk-in', booking: {} });
    enqueue('staff-billing', { action: 'record-payment', reservationId: `${OFFLINE_PREFIX}${walkIn.id}`, amount: 500 });
    await flushOutbox(async () => { throw Object.assign(new Error('Room taken'), { status: 409 }); });
    expect(getOutbox().map(item => item.status)).toEqual(['failed', 'failed']);
  });
});
