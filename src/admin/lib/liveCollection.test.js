import { getCollectionSnapshot, subscribeCollection } from './liveCollection';

jest.mock('../../firebase/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => {
  const listeners = [];
  return {
    collection: (_, name) => name,
    // Plain function (the test runner resets jest.fn mocks between tests).
    onSnapshot: (name, next) => {
      const entry = { name, next, stopped: false };
      listeners.push(entry);
      return () => { entry.stopped = true; };
    },
    __listeners: listeners,
  };
});

const { __listeners } = jest.requireMock('firebase/firestore');
const snap = docs => ({ docs: docs.map(id => ({ id, data: () => ({}) })) });

const opened = () => __listeners.length;
beforeEach(() => { jest.useFakeTimers(); __listeners.length = 0; });
afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });

test('many pages share one database listener', () => {
  const a = jest.fn();
  const b = jest.fn();
  const stopA = subscribeCollection('rooms', a);
  const stopB = subscribeCollection('rooms', b);
  expect(opened()).toBe(1);
  __listeners[0].next(snap(['r1']));
  expect(a).toHaveBeenCalledTimes(1);
  expect(b).toHaveBeenCalledTimes(1);
  stopA(); stopB();
});

test('coming back to a page reuses the loaded list (no new read)', async () => {
  const stop = subscribeCollection('reservations', () => {});
  __listeners[0].next(snap(['x', 'y']));
  stop();
  jest.advanceTimersByTime(5 * 60 * 1000); // 5 minutes on another page
  const again = jest.fn();
  subscribeCollection('reservations', again)();
  expect(opened()).toBe(1);
  expect(again).toHaveBeenCalledWith(expect.objectContaining({ docs: expect.any(Array) }));
  const latest = await getCollectionSnapshot('reservations');
  expect(latest.docs.map(d => d.id)).toEqual(['x', 'y']);
});

test('the listener closes after the keep-alive time with nobody using it', () => {
  const stop = subscribeCollection('payments', () => {});
  stop();
  jest.advanceTimersByTime(21 * 60 * 1000);
  expect(__listeners[0].stopped).toBe(true);
  subscribeCollection('payments', () => {})();
  expect(opened()).toBe(2);
});
