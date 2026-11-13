import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import WalkIn from './WalkIn';

jest.mock('firebase/firestore', () => ({
  collection: (_, name) => name,
  // Walk-in reads only active reservations: query(collection, where(...)).
  query: name => name,
  where: () => null,
  onSnapshot: (name, callback) => {
    const rooms = [
      { id: 'one', roomNumber: 'Hirang', type: 'Standard', capacity: 2, price: 3000, status: 'vacant' },
      { id: 'two', roomNumber: 'Panaginip', type: 'Deluxe', capacity: 3, price: 3500, status: 'vacant' },
    ];
    callback({ docs: name === 'rooms' ? rooms.map(room => ({ id: room.id, data: () => room })) : [] });
    return () => {};
  },
  doc: jest.fn(),
}), { virtual: true });
jest.mock('../../firebase/firebase', () => ({ db: {}, auth: {} }));
jest.mock('../components/PageLayout', () => ({ children }) => <div>{children}</div>);
jest.mock('../components/SettingsContext', () => ({ useSettings: () => ({ settings: {}, formatDate: value => value }) }));
jest.mock('../../components/ui/date-occupancy', () => () => null);
jest.mock('../../lib/useSeasonPeriods', () => ({ useSeasonPeriods: () => [] }));
jest.mock('../../lib/useCottageCatalog', () => ({ useCottageCatalog: jest.fn() }));
jest.mock('../lib/leaveGuard', () => ({ useLeaveGuard: jest.fn() }));
jest.mock('../components/CorporateWalkInForm', () => () => null);
jest.mock('../components/AssignRoomsDialog', () => () => null);
jest.mock('../components/OnlinePaymentQr', () => () => null);
jest.mock('../components/SeniorPwdDiscountForm', () => () => null);
jest.mock('../components/PromoCodeForm', () => () => null);

beforeEach(() => {
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ availability: {} }) });
});

afterEach(() => jest.restoreAllMocks());

test('switches between suggested rooms and can reselect the first room', async () => {
  render(<WalkIn />);
  const dates = document.querySelectorAll('input[type="date"]');
  fireEvent.change(dates[0], { target: { value: '2099-01-01' } });
  fireEvent.change(dates[1], { target: { value: '2099-01-02' } });
  const heading = screen.getByText(/Suggested for 1 guest/);
  const suggestions = heading.parentElement;
  const first = within(suggestions).getByText(/Hirang/).closest('div').parentElement;
  const second = within(suggestions).getByText(/Panaginip/).closest('div').parentElement;
  fireEvent.click(within(first).getByRole('button', { name: 'Choose' }));
  expect(within(first).getByRole('button', { name: 'Selected' })).toBeInTheDocument();
  fireEvent.click(within(second).getByRole('button', { name: 'Choose' }));
  expect(within(second).getByRole('button', { name: 'Selected' })).toBeInTheDocument();
  fireEvent.click(within(first).getByRole('button', { name: 'Choose' }));
  expect(within(first).getByRole('button', { name: 'Selected' })).toBeInTheDocument();
  fireEvent.click(within(first).getByRole('button', { name: 'Continue to guest details' }));
  expect(await screen.findByText('Guest Information')).toBeInTheDocument();
});
