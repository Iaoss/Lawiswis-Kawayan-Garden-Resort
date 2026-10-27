import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import GrillPOS from './GrillPOS';

const mockAddDoc = jest.fn(() => Promise.resolve());
jest.mock('../../firebase/firebase', () => ({ auth: { currentUser: { uid: 'u1', email: 'staff@x.com' } }, db: {} }));
jest.mock('../components/PageLayout', () => ({ children }) => <div>{children}</div>);
jest.mock('../components/SettingsContext', () => ({ useSettings: () => ({ settings: {} }) }));
jest.mock('../lib/useStaffAccess', () => ({ useStaffAccess: () => ({ user: { role: 'receptionist', name: 'Ana' } }) }));
jest.mock('firebase/firestore', () => ({
  collection: (db, name) => ({ name }),
  query: ref => ref,
  where: () => null,
  doc: () => ({}),
  serverTimestamp: () => 'now',
  addDoc: (...args) => mockAddDoc(...args),
  updateDoc: jest.fn(), deleteDoc: jest.fn(), writeBatch: jest.fn(),
  onSnapshot: (ref, next) => {
    const docs = ref.name === 'grillProducts'
      ? [{ id: 'bbq', data: () => ({ name: 'Pork BBQ', price: 30, category: 'Ihaw' }) },
         { id: 'rice', data: () => ({ name: 'Rice', price: 15, category: 'Extras' }) }]
      : [];
    next({ docs });
    return () => {};
  },
}));

test('tapping products builds the receipt and saves an unpaid order with an identifier', async () => {
  render(<GrillPOS />);
  fireEvent.click(screen.getByRole('button', { name: /Add Pork BBQ/ }));
  fireEvent.click(screen.getByRole('button', { name: /Add Pork BBQ/ }));
  fireEvent.click(screen.getByRole('button', { name: /Add Rice/ }));

  const receipt = screen.getByRole('complementary', { name: 'Receipt' });
  expect(within(receipt).getByText('₱75')).toBeInTheDocument();
  expect(within(receipt).getByText('₱30 × 2')).toBeInTheDocument();

  fireEvent.click(within(receipt).getByRole('button', { name: 'Guy in cap' }));
  fireEvent.click(within(receipt).getByRole('button', { name: 'Red shirt' }));
  expect(screen.getByLabelText(/Who is this/)).toHaveValue('Guy in cap, Red shirt');

  fireEvent.click(within(receipt).getByRole('button', { name: 'Save order' }));
  expect(mockAddDoc).toHaveBeenCalledWith({ name: 'grillOrders' }, expect.objectContaining({
    identifier: 'Guy in cap, Red shirt', total: 75, status: 'unpaid', orderNo: 1, staffUid: 'u1',
  }));
  expect(await screen.findByText(/Order #1 saved/)).toBeInTheDocument();
});
