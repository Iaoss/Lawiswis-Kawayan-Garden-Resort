import React from 'react';
import { render, screen } from '@testing-library/react';
import RoomSchedule, { bookingSlots } from './RoomSchedule';

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
