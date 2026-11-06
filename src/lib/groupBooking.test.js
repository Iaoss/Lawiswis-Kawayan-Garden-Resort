import { getAdditionalRoomsError, splitGroupPayment } from './groupBooking';

test('splits one payment across rooms by their totals', () => {
  expect(splitGroupPayment(4000, [5000, 3000])).toEqual([2500, 1500]);
  expect(splitGroupPayment(100, [1, 1, 1])).toEqual([33.33, 33.33, 33.34]);
  expect(splitGroupPayment(500, [999])).toEqual([500]);
});

test('extra room checks', () => {
  expect(getAdditionalRoomsError('a', [{ roomId: 'b', adults: 2, children: 1 }])).toBe('');
  expect(getAdditionalRoomsError('a', [{ roomId: 'a', adults: 2, children: 0 }])).toMatch(/only be added once/);
  expect(getAdditionalRoomsError('a', [{ roomId: 'b', adults: 0, children: 0 }])).toMatch(/1 adult/);
  expect(getAdditionalRoomsError('a', [{ roomId: 'b', adults: 1, children: 0 }, { roomId: 'c', adults: 1, children: 0 }, { roomId: 'd', adults: 1, children: 0 }])).toMatch(/up to 3/);
});
