import React from 'react';
import { render, waitFor } from '@testing-library/react';
import CheckInReminder from './CheckInReminder';
import { pushToast } from '../lib/staffToasts';

let mockToday;

jest.mock('../../firebase/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
}));
jest.mock('../../lib/bookingPricing', () => ({
  getResortNow: () => ({ dateKey: mockToday }),
}));
jest.mock('../../lib/stayTimes', () => ({
  getUpcomingCheckIns: () => [{
    key: 'booking-1_today',
    id: 'booking-1',
    ids: ['booking-1'],
    guest: 'Test Guest',
    place: 'Room 101',
    timeText: '4:00 PM',
    whenText: 'now',
  }],
}));
jest.mock('../lib/staffToasts', () => ({ pushToast: jest.fn(() => 'toast-1') }));
jest.mock('../lib/checkInGuest', () => ({ checkInGuest: jest.fn() }));
jest.mock('../../lib/serverClock', () => ({ serverNow: () => Date.now() }));
jest.mock('../lib/liveCollection', () => ({
  subscribeLive: (_key, _makeQuery, onNext) => {
    onNext({
      docs: [{
        id: 'booking-1',
        data: () => ({
          id: 'booking-1',
          status: 'confirmed',
          checkIn: mockToday,
          checkOut: mockToday,
          totalAmount: 2500,
          amountPaid: 2500,
        }),
      }],
    });
    return () => {};
  },
}));

beforeEach(() => {
  mockToday = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  pushToast.mockClear();
});

test('shows a check-in reminder for a paid booking without crashing the portal', async () => {
  render(<CheckInReminder />);

  await waitFor(() => {
    expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Check-in now: Test Guest',
      primary: expect.objectContaining({ label: 'Check in' }),
    }));
  });
});
