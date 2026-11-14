import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import RoomManagement from './RoomManagement';

jest.mock('../../firebase/firebase', () => ({ db: {}, auth: {} }));
jest.mock('firebase/firestore', () => ({
  onSnapshot: () => () => {},
  collection: () => ({}), doc: () => ({}), query: () => ({}), where: () => ({}),
  addDoc: () => Promise.resolve(), updateDoc: () => Promise.resolve(), deleteDoc: () => Promise.resolve(),
}), { virtual: true });
jest.mock('../components/PageLayout', () => ({ children }) => <div>{children}</div>);
jest.mock('../components/RoomExcelImport', () => () => null);
jest.mock('../components/SeasonalRatesManager', () => () => null);
jest.mock('../components/SettingsContext', () => ({ useSettings: () => ({ settings: {}, formatDate: v => v }) }));
jest.mock('../lib/activityLog', () => ({ logStaffActivity: () => {} }));
jest.mock('../lib/uploadImage', () => ({ uploadImage: () => Promise.resolve('') }));
jest.mock('../lib/liveCollection', () => ({
  subscribeLive: () => () => {},
  subscribeCollection: (name, next) => {
    const rooms = [
      { id: 'r1', roomNumber: 'Hirang', type: 'Standard', price: 3000, status: 'available' },
      { id: 'r2', roomNumber: 'Panaginip', type: 'Deluxe', price: 3500, status: 'available' },
    ];
    next({ docs: rooms.map(room => ({ id: room.id, data: () => room })) });
    return () => {};
  },
}));

test('one click on Edit scrolls to the edit form', () => {
  jest.useFakeTimers();
  const scrolled = [];
  Element.prototype.scrollIntoView = function scrollIntoView() { scrolled.push(this); };
  window.scrollTo = () => {};
  render(<RoomManagement />);
  fireEvent.click(screen.getAllByLabelText('Room actions')[0]);
  fireEvent.click(screen.getByText('Edit'));
  act(() => { jest.advanceTimersByTime(400); });
  expect(screen.getByText('Edit Room')).toBeInTheDocument();
  expect(scrolled.length).toBeGreaterThan(0);
  expect(scrolled[0].textContent).toContain('Edit Room');
  jest.useRealTimers();
});

test('Edit inside the room details window also goes straight to the form', () => {
  jest.useFakeTimers();
  const scrolled = [];
  Element.prototype.scrollIntoView = function scrollIntoView() { scrolled.push(this); };
  window.scrollTo = () => {};
  render(<RoomManagement />);
  fireEvent.click(screen.getAllByText('Panaginip')[0]);
  fireEvent.click(within(screen.getByRole('dialog')).getByText('Edit'));
  act(() => { jest.advanceTimersByTime(400); });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(scrolled.length).toBeGreaterThan(0);
  jest.useRealTimers();
});
