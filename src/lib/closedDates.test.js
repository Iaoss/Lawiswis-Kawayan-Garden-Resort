import { closedPeriodMessage, findClosedPeriod, formatClosedRange, normalizeClosedDates, upcomingClosedDates } from './closedDates';

const list = [{ id: 'm', from: '2026-11-23', to: '2026-11-25', reason: 'Maintenance' }];

test('blocks stays that touch the closed days, allows others', () => {
  expect(findClosedPeriod(list, '2026-11-24', '2026-11-24')).toBeTruthy();   // day tour inside
  expect(findClosedPeriod(list, '2026-11-22', '2026-11-23')).toBeTruthy();   // checks out on a closed day
  expect(findClosedPeriod(list, '2026-11-25', '2026-11-26')).toBeTruthy();   // checks in on the last closed day
  expect(findClosedPeriod(list, '2026-11-21', '2026-11-22')).toBeNull();
  expect(findClosedPeriod(list, '2026-11-26', '2026-11-27')).toBeNull();
});

test('labels and filtering', () => {
  expect(formatClosedRange(list[0])).toBe('Nov 23 – Nov 25, 2026');
  expect(closedPeriodMessage(list[0])).toMatch(/closed Nov 23 – Nov 25, 2026 \(Maintenance\)/);
  expect(upcomingClosedDates(list, '2026-11-26')).toEqual([]);
  expect(normalizeClosedDates([{ from: '2026-11-25', to: '2026-11-23' }])).toEqual([]);
});
