import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Housekeeping from './Housekeeping';

const mockSendStaffRequest = jest.fn();
const mockFlushOutbox = jest.fn();
const mockRoom = {
  id: 'ground-1',
  roomNumber: 'Ground 1',
  type: 'Standard',
  floor: 'ground',
  amenities: 'Wheelchair accessible',
  status: 'cleaning',
};
let mockQueue = [];
let mockEnqueued = [];
let mockOutboxListener;

jest.mock('../../firebase/firebase', () => ({ auth: { currentUser: { uid: 'staff-1' } }, db: {} }));
jest.mock('../components/PageLayout', () => ({ children }) => <div>{children}</div>);
jest.mock('../components/SettingsContext', () => ({ useSettings: () => ({ settings: {} }) }));
jest.mock('../lib/liveCollection', () => ({
  subscribeCollection: (_name, onNext) => {
    onNext({ docs: [{ id: mockRoom.id, data: () => mockRoom }] });
    return () => {};
  },
  subscribeLive: (_key, _makeQuery, onNext) => {
    onNext({ docs: [] });
    return () => {};
  },
}));
jest.mock('../lib/offlineOutbox', () => ({
  getOutbox: () => mockQueue,
  subscribeOutbox: listener => {
    mockOutboxListener = listener;
    listener(mockQueue);
    return () => {};
  },
  enqueue: (path, body, method, uid) => {
    const item = { id: 'queued-1', path, body: { ...body, offlineRequestId: 'queued-1' }, method, uid, status: 'pending', createdAt: new Date().toISOString() };
    mockEnqueued.push(item);
    mockQueue = [...mockQueue, item];
    mockOutboxListener?.(mockQueue);
    return item;
  },
  flushOutbox: (...args) => mockFlushOutbox(...args),
}));
jest.mock('../lib/staffApi', () => ({ sendStaffRequest: (...args) => mockSendStaffRequest(...args) }));

beforeEach(() => {
  mockQueue = [];
  mockEnqueued = [];
  mockOutboxListener = null;
  mockSendStaffRequest.mockReset();
  mockFlushOutbox.mockReset().mockImplementation(async () => {
    mockQueue = [];
    mockOutboxListener?.(mockQueue);
    return { sent: 1, failed: 0, pending: 0 };
  });
});

test('shows step-free/PWD tags and confirms the cleaning-to-available update', async () => {
  render(<Housekeeping />);
  expect(screen.getByText('No stairs · ground floor')).toBeInTheDocument();
  expect(screen.getByText('PWD-friendly')).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Available' }));
  });
  expect(mockFlushOutbox).toHaveBeenCalled();
  expect(mockQueue).toHaveLength(0);
  expect(screen.getByText(/Synced/)).toBeInTheDocument();
  expect(mockEnqueued[0]).toMatchObject({
    path: 'housekeeping',
    uid: 'staff-1',
    body: { action: 'set-room-status', roomId: 'ground-1', status: 'available' },
  });
});

test('saves an offline maintenance report and immediately marks the room out of order', async () => {
  render(<Housekeeping />);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  fireEvent.change(screen.getByLabelText('Maintenance issue type for Room Ground 1'), { target: { value: 'air-conditioning' } });
  fireEvent.change(screen.getByLabelText('Maintenance note for Room Ground 1'), { target: { value: 'AC is leaking' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Report Issue & Block Room' }));
  });
  expect(mockEnqueued[0]).toMatchObject({
    path: 'housekeeping',
    uid: 'staff-1',
    body: {
      action: 'report-issue',
      roomId: 'ground-1',
      issueType: 'air-conditioning',
      note: 'AC is leaking',
    },
  });
  expect(screen.getAllByText('Out of Order').length).toBeGreaterThan(1);
  expect(screen.getByText('Saved Offline (Pending Sync)')).toBeInTheDocument();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

test('automatically syncs a queued maintenance report when the device reconnects', async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  render(<Housekeeping />);
  fireEvent.change(screen.getByLabelText('Maintenance issue type for Room Ground 1'), { target: { value: 'air-conditioning' } });
  fireEvent.change(screen.getByLabelText('Maintenance note for Room Ground 1'), { target: { value: 'AC is leaking' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Report Issue & Block Room' }));
  });
  expect(screen.getByText('Saved Offline (Pending Sync)')).toBeInTheDocument();

  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  await act(async () => {
    fireEvent(window, new Event('online'));
  });
  expect(mockFlushOutbox).toHaveBeenCalled();
  expect(screen.getByText(/Synced/)).toBeInTheDocument();
});
