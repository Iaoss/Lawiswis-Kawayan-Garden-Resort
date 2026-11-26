import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import OfflineStatus from './OfflineStatus';

let mockItems = [];
let mockListener;
const mockDismissItem = jest.fn();
const mockFlushOutbox = jest.fn();
const mockRetryItem = jest.fn();

jest.mock('../../firebase/firebase', () => ({ auth: { currentUser: { uid: 'staff-1' } } }));
jest.mock('../lib/staffApi', () => ({ sendStaffRequest: jest.fn() }));
jest.mock('../lib/offlineOutbox', () => ({
  dismissItem: (...args) => mockDismissItem(...args),
  flushOutbox: (...args) => mockFlushOutbox(...args),
  getOutbox: () => mockItems,
  retryItem: id => {
    mockRetryItem(id);
    mockItems = mockItems.map(item => item.id === id ? { ...item, status: 'pending', error: '' } : item);
    mockListener?.(mockItems);
  },
  subscribeOutbox: listener => {
    mockListener = listener;
    listener(mockItems);
    return () => { mockListener = null; };
  },
}));

beforeEach(() => {
  mockItems = [{
    id: 'old-clean-request',
    uid: 'staff-1',
    path: 'housekeeping',
    body: { action: 'set-room-status', roomId: 'room-1', status: 'cleaning' },
    label: 'Room 1 status: cleaning',
    createdAt: new Date().toISOString(),
    status: 'failed',
    error: 'Failed to fetch',
  }];
  mockListener = null;
  mockDismissItem.mockReset();
  mockRetryItem.mockReset();
  mockFlushOutbox.mockReset().mockImplementation(async () => {
    mockItems = [];
    mockListener?.(mockItems);
    return { sent: 1, failed: 0, pending: 0 };
  });
});

test('offers retry for previously rejected housekeeping changes', async () => {
  render(<OfflineStatus />);
  expect(screen.getByText(/Failed to fetch/)).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Retry sync' }));
  });
  expect(mockRetryItem).toHaveBeenCalledWith('old-clean-request');
  expect(mockFlushOutbox).toHaveBeenCalled();
  expect(screen.getByText('The room update was saved.')).toBeInTheDocument();
});

test('does not blindly retry a rejected clean request after the room state changed', () => {
  mockItems[0].error = 'Only an available room can be sent for cleaning.';
  mockItems[0].errorStatus = 409;
  render(<OfflineStatus />);
  expect(screen.getByText(/room state changed/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry sync' })).not.toBeInTheDocument();
});
