import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import PortalSidebar from './PortalSidebar';
import { AnimatedSidebarProvider } from '../../components/ui/animated-sidebar.tsx';

jest.mock('react-router-dom', () => ({ useNavigate: jest.fn() }), { virtual: true });
jest.mock('firebase/firestore', () => ({ collection: () => ({}), collectionGroup: () => ({}), getDocs: () => Promise.resolve({ docs: [] }) }), { virtual: true });
jest.mock('../../firebase/firebase', () => ({ db: {}, auth: {} }));
jest.mock('../../components/ui/beam-avatar.tsx', () => ({ StaffAvatar: () => null }));
jest.mock('./AvatarPickerDialog', () => ({ __esModule: true, default: () => null, openAvatarPicker: () => {} }));
jest.mock('../lib/useStaffAccess', () => ({ useStaffAccess: () => ({ can: () => true }) }));

const mockNavigate = jest.fn();

beforeAll(() => {
  // The test browser has no screen-size detection; the sidebar asks for it.
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }));
});

beforeEach(() => {
  mockNavigate.mockClear();
  useNavigate.mockReturnValue(mockNavigate);
});

const receptionistNav = [
  { label: 'Dashboard', path: '/receptionist/dashboard', icon: 'ti-layout-dashboard' },
  { label: 'Reservations', path: '/receptionist/reservations', icon: 'ti-calendar-event' },
  { label: 'Walk-in', path: '/receptionist/walkin', icon: 'ti-walk' },
  { label: 'Room Management', path: '/receptionist/rooms', icon: 'ti-bed' },
  { label: 'Billing', path: '/receptionist/billing', icon: 'ti-receipt' },
  { label: 'Messages', path: '/receptionist/messages', icon: 'ti-message-circle-2' },
  { label: 'Settings', path: '/receptionist/settings', icon: 'ti-settings' },
];

const renderSidebar = flat => render(
  <AnimatedSidebarProvider open onOpenChange={() => {}} navigate={() => {}}>
    <PortalSidebar navItems={receptionistNav} currentPath="/receptionist/billing" portalName="Receptionist" name="Ana" role="receptionist" initials="A" onLogout={() => {}} flat={flat} />
  </AnimatedSidebarProvider>,
);

test('receptionists get a simple list: no grouped dropdowns', () => {
  renderSidebar(true);
  ['Dashboard', 'Reservations', 'Walk-in', 'Billing', 'Messages', 'Settings'].forEach(label => {
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  });
  expect(screen.queryByText(/Front Desk/)).toBeNull();
  expect(screen.queryByText(/Financials/)).toBeNull();
  expect(screen.queryAllByRole('button', { expanded: false })).toHaveLength(0);
});

test('the admin menu keeps its groups', () => {
  renderSidebar(false);
  expect(screen.getAllByText(/Front Desk/).length).toBeGreaterThan(0);
});

test('mouse selection keeps a search result open until navigation', () => {
  renderSidebar(true);
  const search = screen.getByRole('searchbox', { name: /Search pages/ });
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'Room Management' } });

  const result = screen.getAllByRole('link', { name: /Room Management/ })[0];
  fireEvent.mouseDown(result);
  expect(result).toBeInTheDocument();
  fireEvent.click(result);

  expect(mockNavigate.mock.calls[0][0]).toBe('/receptionist/rooms');
});
