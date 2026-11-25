import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Housekeeping from './Housekeeping';

const mockSendStaffRequest = jest.fn();
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
}));
jest.mock('../lib/offlineOutbox', () => ({
  getOutbox: () => mockQueue,
  subscribeOutbox: listener => {
    mockOutboxListener = listener;
    listener(mockQueue);
    return () => {};
  },
  enqueue: (path, body, method, uid) => {
    const item = { id: 'queued-1', path, body: { ...body, offlineRequestId: 'queued-1' }, method, uid, status: 'pending' };
    mockEnqueued.push(item);
    mockQueue = [...mockQueue, item];
    mockOutboxListener?.(mockQueue);
    return item;
  },
  flushOutbox: async () => {
    mockQueue = [];
    mockOutboxListener?.(mockQueue);
    return { sent: 1, failed: 0, pending: 0 };
  },
}));
jest.mock('../lib/staffApi', () => ({ sendStaffRequest: (...args) => mockSendStaffRequest(...args) }));

beforeEach(() => {
  mockQueue = [];
  mockEnqueued = [];
  mockOutboxListener = null;
  mockSendStaffRequest.mockReset();
});

test('shows step-free/PWD tags and confirms the cleaning-to-available update', async () => {
  render(<Housekeeping />);
  expect(screen.getByText('No stairs · ground floor')).toBeInTheDocument();
  expect(screen.getByText('PWD-friendly')).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Available' }));
  });
  expect(screen.getByText(/Synced/)).toBeInTheDocument();
  expect(mockEnqueued[0]).toMatchObject({
    path: 'housekeeping',
    uid: 'staff-1',
    body: { action: 'set-room-status', roomId: 'ground-1', status: 'available' },
  });
});

test('submits a maintenance note when marking a room out of order', async () => {
  render(<Housekeeping />);
  fireEvent.change(screen.getByLabelText('Maintenance issue for Room Ground 1'), { target: { value: 'AC leaking' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Mark Out of Order' }));
  });
  expect(mockEnqueued[0]).toMatchObject({
    body: { status: 'out-of-order', maintenanceNote: 'AC leaking' },
  });
});
