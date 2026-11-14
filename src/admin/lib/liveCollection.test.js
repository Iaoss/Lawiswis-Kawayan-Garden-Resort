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

const snap = docs => ({ docs: docs.map(id => ({ id, data: () => ({}) })) });

// Each test gets a fresh copy of the module (no shared lists between tests).
let live;
let listeners;
beforeEach(() => {
  jest.useFakeTimers();
  jest.isolateModules(() => {
    live = require('./liveCollection');
    listeners = require('firebase/firestore').__listeners;
  });
  listeners.length = 0;
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('many pages share one database listener', () => {
  const a = jest.fn();
  const b = jest.fn();
  const stopA = live.subscribeCollection('rooms', a);
  const stopB = live.subscribeCollection('rooms', b);
  expect(listeners).toHaveLength(1);
  listeners[0].next(snap(['r1']));
  expect(a).toHaveBeenCalledTimes(1);
  expect(b).toHaveBeenCalledTimes(1);
  stopA(); stopB();
});

test('coming back to a page reuses the loaded list (no new read)', async () => {
  const stop = live.subscribeCollection('reservations', () => {});
  listeners[0].next(snap(['x', 'y']));
  stop();
  jest.advanceTimersByTime(5 * 60 * 1000); // 5 minutes on another page
  const again = jest.fn();
  live.subscribeCollection('reservations', again)();
  expect(listeners).toHaveLength(1);
  expect(again).toHaveBeenCalledWith(expect.objectContaining({ docs: expect.any(Array) }));
  const latest = await live.getCollectionSnapshot('reservations');
  expect(latest.docs.map(d => d.id)).toEqual(['x', 'y']);
});

test('the listener closes after the keep-alive time with nobody using it', () => {
  const stop = live.subscribeCollection('payments', () => {});
  stop();
  jest.advanceTimersByTime(21 * 60 * 1000);
  expect(listeners[0].stopped).toBe(true);
  live.subscribeCollection('payments', () => {})();
  expect(listeners).toHaveLength(2);
});
