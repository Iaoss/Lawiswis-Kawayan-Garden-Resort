import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StaffPushControl from './StaffPushControl';

const mockGetStaffPushEnabled = jest.fn();
const mockRegisterStaffPush = jest.fn();
const mockUnregisterStaffPush = jest.fn();

jest.mock('../../firebase/firebase', () => ({ auth: { currentUser: { uid: 'staff-1' } } }));
jest.mock('../lib/staffPush', () => ({
  getStaffPushEnabled: (...args) => mockGetStaffPushEnabled(...args),
  registerStaffPush: (...args) => mockRegisterStaffPush(...args),
  unregisterStaffPush: (...args) => mockUnregisterStaffPush(...args),
}));

beforeEach(() => {
  mockGetStaffPushEnabled.mockReset().mockResolvedValue(false);
  mockRegisterStaffPush.mockReset().mockResolvedValue(undefined);
  mockUnregisterStaffPush.mockReset().mockResolvedValue(undefined);
});

test('enables and disables phone alerts from the same switch', async () => {
  render(<StaffPushControl />);
  const toggle = await screen.findByRole('switch', { name: 'Phone alerts' });
  await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));

  await act(async () => { fireEvent.click(toggle); });
  expect(mockRegisterStaffPush).toHaveBeenCalledTimes(1);
  expect(toggle).toHaveAttribute('aria-checked', 'true');

  await act(async () => { fireEvent.click(toggle); });
  expect(mockUnregisterStaffPush).toHaveBeenCalledTimes(1);
  expect(toggle).toHaveAttribute('aria-checked', 'false');
});

test('loads enabled state from the current device registration', async () => {
  mockGetStaffPushEnabled.mockResolvedValue(true);
  render(<StaffPushControl />);
  expect(await screen.findByRole('switch', { name: 'Phone alerts' })).toHaveAttribute('aria-checked', 'true');
});
