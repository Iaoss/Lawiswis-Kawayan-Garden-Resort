import { Timestamp } from 'firebase/firestore';
import { deserializeDocs, isSavedList, serializeDocs, toSnapshot } from './offlineCopy';

describe('offline copy of staff lists', () => {
  it('keeps only bookings, rooms and payments', () => {
    expect(isSavedList('reservations')).toBe(true);
    expect(isSavedList('rooms')).toBe(true);
    expect(isSavedList('conversations:unread')).toBe(false);
  });

  it('restores documents, including dates, as a list pages can read', () => {
    const createdAt = new Timestamp(1800000000, 5);
    const text = serializeDocs([{ id: 'b1', data: () => ({ guestName: 'Ana', createdAt, nested: { at: createdAt } }) }]);
    const snapshot = toSnapshot(deserializeDocs(text), 123);
    expect(snapshot.size).toBe(1);
    expect(snapshot.empty).toBe(false);
    expect(snapshot.metadata.fromCache).toBe(true);
    const [doc] = snapshot.docs;
    expect(doc.id).toBe('b1');
    expect(doc.data().guestName).toBe('Ana');
    expect(doc.data().createdAt).toBeInstanceOf(Timestamp);
    expect(doc.data().nested.at.seconds).toBe(1800000000);
  });
});
