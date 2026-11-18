import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import RoomSchedule, { bookingDays, bookingsByMonth, bookingSlots, roomBookings } from './RoomSchedule';

jest.mock('../lib/roomOccupancy', () => ({
  loadRooms: () => Promise.resolve([
    { id: 'r1', roomNumber: 'Paraiso', type: 'Suite', status: 'available' },
    { id: 'r2', roomNumber: 'Ligaya', type: 'Standard', status: 'maintenance' },
  ]),
  isRoomOutOfService: status => status === 'maintenance',
}));

// Slot 2d = morning of day d, 2d+1 = afternoon/evening (days counted from the start date).
describe('room schedule slots', () => {
  const from = '2026-11-15';

  it('overnight: from the check-in afternoon to the check-out morning', () => {
    expect(bookingSlots({ checkIn: '2026-11-16', checkOut: '2026-11-17', checkInTime: '3:00 PM', checkOutTime: '12:00 PM' }, from))
      .toEqual({ start: 3, end: 5 });
  });

  it('a morning check-in starts in the morning; a 4 PM check-out keeps the afternoon', () => {
    expect(bookingSlots({ checkIn: '2026-11-15', checkOut: '2026-11-16', checkInTime: '11:00 AM', checkOutTime: '4:00 PM' }, from))
      .toEqual({ start: 0, end: 4 });
  });

  it('day tour covers the whole day; night tour only the evening', () => {
    expect(bookingSlots({ checkIn: '2026-11-15', checkOut: '2026-11-15', checkInTime: '8:00 AM', checkOutTime: '5:00 PM' }, from)).toEqual({ start: 0, end: 2 });
    expect(bookingSlots({ checkIn: '2026-11-15', checkOut: '2026-11-15', checkInTime: '5:00 PM', checkOutTime: '10:00 PM' }, from)).toEqual({ start: 1, end: 2 });
  });

  it('late arrival after 9 PM counts as the evening', () => {
    expect(bookingSlots({ checkIn: '2026-11-15', checkOut: '2026-11-16', checkInTime: 'After 9:00 PM', checkOutTime: '12:00 PM' }, from)).toEqual({ start: 1, end: 3 });
  });
});

describe('room schedule view', () => {
  it('shows each room with its bookings and status', async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const onSelect = jest.fn();
    render(<RoomSchedule onSelect={onSelect} t={{ CARD: '#fff', CARD2: '#fff', BORDER: '#eee', BORDER2: '#ddd', TEXT: '#111', MUTED: '#666' }}
      reservations={[
        { id: 'b1', roomId: 'r1', guestName: 'Ana Cruz', status: 'confirmed', checkIn: today, checkOut: today, checkInTime: '8:00 AM', checkOutTime: '5:00 PM' },
        { id: 'b2', roomId: 'r1', guestName: 'Cancelled Guest', status: 'cancelled', checkIn: today, checkOut: today },
      ]} />);
    expect(await screen.findByText('Paraiso')).toBeTruthy();
    expect(screen.getByText('Maintenance')).toBeTruthy();
    expect(screen.getByText('Taken today')).toBeTruthy();
    const bar = screen.getByTitle(/Ana Cruz · Confirmed/);
    bar.click();
    expect(onSelect).toHaveBeenCalledWith('b1');
    expect(screen.queryByText(/Cancelled Guest/)).toBeNull();
  });
});

describe('finding a room', () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const later = '2099-01-10';
  const t = { CARD: '#fff', CARD2: '#fff', BORDER: '#eee', BORDER2: '#ddd', TEXT: '#111', MUTED: '#666' };
  const bookings = [
    { id: 'late', roomId: 'r1', guestName: 'Later Guest', status: 'pending', checkIn: later, checkOut: later },
    { id: 'now', roomId: 'r1', guestName: 'Staying Guest', status: 'checked-in', checkIn: today, checkOut: later },
    { id: 'gone', roomId: 'r1', guestName: 'Gone Guest', status: 'checked-out', checkIn: today, checkOut: today },
    { id: 'other', roomId: 'r2', guestName: 'Other Room', status: 'confirmed', checkIn: today, checkOut: today },
  ];

  it('lists current and upcoming bookings of a room, earliest first', () => {
    expect(roomBookings(bookings, { id: 'r1', roomNumber: 'Paraiso' }, today).map(r => r.id)).toEqual(['now', 'late']);
  });

  it('search shows only that room, its bookings, and new bookings as they arrive', async () => {
    const onSelect = jest.fn();
    const { rerender } = render(<RoomSchedule reservations={bookings} onSelect={onSelect} t={t} />);
    await screen.findByText('Paraiso');
    fireEvent.change(screen.getByLabelText('Search room'), { target: { value: 'para' } });
    expect(screen.queryByText('Ligaya')).toBeNull();
    const panel = screen.getByRole('region', { name: 'Bookings in Paraiso' });
    const list = within(panel).getByRole('group', { name: 'Current and upcoming bookings' });
    expect(within(panel).getByText('Occupied by Staying Guest')).toBeTruthy();
    expect(within(list).queryByText('Gone Guest')).toBeNull();
    fireEvent.click(within(list).getByText('Later Guest'));
    expect(onSelect).toHaveBeenCalledWith('late');
    rerender(<RoomSchedule onSelect={onSelect} t={t} reservations={[...bookings, { id: 'new', roomId: 'r1', guestName: 'New Guest', status: 'confirmed', checkIn: later, checkOut: later }]} />);
    expect(within(screen.getByRole('group', { name: 'Current and upcoming bookings' })).getByText('New Guest')).toBeTruthy();
  });

  it('finds the months a room is booked, including stays across two months', () => {
    const across = { id: 'a', checkIn: '2026-11-30', checkOut: '2026-12-02', checkInTime: '3:00 PM', checkOutTime: '12:00 PM' };
    const leavesMorning = { id: 'b', checkIn: '2027-01-31', checkOut: '2027-02-01', checkInTime: '3:00 PM', checkOutTime: '12:00 PM' };
    expect(bookingDays(across)).toEqual(['2026-11-30', '2026-12-01', '2026-12-02']);
    expect(bookingsByMonth([across, leavesMorning])).toEqual([
      { month: '2026-11', count: 1 }, { month: '2026-12', count: 1 }, { month: '2027-01', count: 1 }, { month: '2027-02', count: 1 },
    ]);
  });

  it('jumps to a month with bookings and shows them on the calendar', async () => {
    const onSelect = jest.fn();
    render(<RoomSchedule onSelect={onSelect} t={t} reservations={[{ id: 'far', roomId: 'r1', guestName: 'Far Guest', status: 'confirmed', checkIn: later, checkOut: later }]} />);
    fireEvent.click(await screen.findByText('Paraiso'));
    const months = screen.getByRole('group', { name: 'Months with bookings' });
    fireEvent.click(within(months).getByRole('button'));
    expect(screen.getByText('January 2099')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Far Guest · Confirmed', { selector: 'button[style*="9.5px"]' }));
    expect(onSelect).toHaveBeenCalledWith('far');
  });
});
