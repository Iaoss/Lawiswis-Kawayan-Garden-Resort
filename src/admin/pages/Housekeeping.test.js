import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Housekeeping from './Housekeeping';

const mockSendStaffRequest = jest.fn();
const mockFlushOutbox = jest.fn();
const mockRetryItem = jest.fn();
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
let mockRooms = [mockRoom];

jest.mock('../../firebase/firebase', () => ({ auth: { currentUser: { uid: 'staff-1' } }, db: {} }));
jest.mock('../components/PageLayout', () => ({ children }) => <div>{children}</div>);
jest.mock('../components/SettingsContext', () => ({ useSettings: () => ({ settings: {} }) }));
jest.mock('../lib/liveCollection', () => ({
  subscribeCollection: (_name, onNext) => {
    onNext({ docs: mockRooms.map(room => ({ id: room.id, data: () => room })) });
    return () => {};
  },
  subscribeLive: (_key, _makeQuery, onNext) => {
    onNext({ docs: [] });
    return () => {};
  },
}));
jest.mock('../lib/offlineOutbox', () => ({
  getOutbox: () => mockQueue,
  retryItem: id => {
    mockRetryItem(id);
    mockQueue = mockQueue.map(item => item.id === id ? { ...item, status: 'pending', error: '' } : item);
    mockOutboxListener?.(mockQueue);
  },
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
  mockRooms = [mockRoom];
  mockRoom.status = 'cleaning';
  mockOutboxListener = null;
  mockSendStaffRequest.mockReset();
  mockFlushOutbox.mockReset().mockImplementation(async () => {
    mockQueue = [];
    mockOutboxListener?.(mockQueue);
    return { sent: 1, failed: 0, pending: 0 };
  });
  mockRetryItem.mockReset();
});

test('confirms the cleaning-to-available update', async () => {
  render(<Housekeeping />);
  expect(screen.getByText('Room Ground 1')).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Mark Available' }));
  });
  expect(mockFlushOutbox).toHaveBeenCalled();
  expect(mockQueue).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: /All rooms/ }));
  expect(screen.getByText(/Synced/)).toBeInTheDocument();
  expect(mockEnqueued[0]).toMatchObject({
    path: 'housekeeping',
    uid: 'staff-1',
    body: { action: 'set-room-status', roomId: 'ground-1', status: 'available' },
  });
});

test('housekeepers only see rooms needing attention without staff filters', () => {
  mockRooms = [
    { ...mockRoom, status: 'cleaning' },
    { ...mockRoom, id: 'room-2', roomNumber: 'Room 2', type: 'Deluxe', status: 'available' },
    { ...mockRoom, id: 'room-3', roomNumber: 'Room 3', status: 'maintenance', maintenanceNote: 'Leaking pipe' },
  ];
  window.history.pushState({}, '', '/housekeeper/housekeeping');
  render(<Housekeeping />);
  expect(screen.getByRole('heading', { name: 'Rooms to clean' })).toBeInTheDocument();
  expect(screen.getByText('Room Ground 1')).toBeInTheDocument();
  expect(screen.queryByText('Room Room 2')).not.toBeInTheDocument();
  expect(screen.getByText('Room Room 3')).toBeInTheDocument();
  expect(screen.getByText('Leaking pipe')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /All rooms/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Filter by room type')).not.toBeInTheDocument();
  window.history.pushState({}, '', '/');
});

test('allows staff to notify housekeeping that an available room needs cleaning', async () => {
  mockRoom.status = 'available';
  render(<Housekeeping />);
  fireEvent.click(screen.getByRole('button', { name: /All rooms/ }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Notify Housekeeper to Clean' }));
  });
  expect(mockSendStaffRequest).toHaveBeenCalledWith('housekeeping', {
    action: 'set-room-status',
    roomId: 'ground-1',
    status: 'cleaning',
  });
  expect(mockEnqueued).toHaveLength(0);
});

test('does not queue a cleaning notification when offline', async () => {
  mockRoom.status = 'available';
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  render(<Housekeeping />);
  fireEvent.click(screen.getByRole('button', { name: /All rooms/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Notify Housekeeper to Clean' }));
  expect(mockEnqueued).toHaveLength(0);
  expect(screen.getByRole('alert')).toHaveTextContent(/Connect to the internet to notify a housekeeper/);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

test('opens on rooms needing attention and keeps maintenance forms collapsed until requested', () => {
  mockRooms = [
    { ...mockRoom, status: 'cleaning' },
    { ...mockRoom, id: 'room-2', roomNumber: 'Room 2', status: 'available' },
  ];
  render(<Housekeeping />);
  expect(screen.getByText('Room Ground 1')).toBeInTheDocument();
  expect(screen.queryByText('Room Room 2')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Maintenance issue type for Room Ground 1')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /All rooms/ }));
  expect(screen.getByText('Room Room 2')).toBeInTheDocument();
});

test('shows the failed sync reason and lets staff retry the queued room update', async () => {
  mockQueue = [{
    id: 'failed-update',
    path: 'housekeeping',
    uid: 'staff-1',
    body: { action: 'set-room-status', roomId: 'ground-1', status: 'available' },
    status: 'failed',
    error: 'Please sign in again.',
  }];
  mockFlushOutbox.mockImplementation(async () => ({ sent: 0, failed: 0, pending: 1 }));
  render(<Housekeeping />);
  expect(document.querySelector('.housekeeping-sync')).toHaveTextContent(/Sync failed: Please sign in again\./);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Retry sync' }));
  });
  expect(mockRetryItem).toHaveBeenCalledWith('failed-update');
  expect(mockFlushOutbox).toHaveBeenCalled();
});

test('saves an offline maintenance report and immediately marks the room out of order', async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  render(<Housekeeping />);
  fireEvent.click(screen.getByRole('button', { name: 'Report issue' }));
  fireEvent.change(screen.getByLabelText('Maintenance issue type for Room Ground 1'), { target: { value: 'air-conditioning' } });
  fireEvent.change(screen.getByLabelText('Maintenance note for Room Ground 1'), { target: { value: 'AC is leaking' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Report & Block Room' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Report issue' }));
  fireEvent.change(screen.getByLabelText('Maintenance issue type for Room Ground 1'), { target: { value: 'air-conditioning' } });
  fireEvent.change(screen.getByLabelText('Maintenance note for Room Ground 1'), { target: { value: 'AC is leaking' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Report & Block Room' }));
  });
  expect(screen.getByText('Saved Offline (Pending Sync)')).toBeInTheDocument();

  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  await act(async () => {
    fireEvent(window, new Event('online'));
  });
  expect(mockFlushOutbox).toHaveBeenCalled();
  expect(screen.getByText(/Synced/)).toBeInTheDocument();
});
