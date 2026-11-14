import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Login from './Login';

const mockNavigate = jest.fn();
let mockGetDoc;
let mockSignIn;
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate, useLocation: () => ({ state: null }) }), { virtual: true });
jest.mock('../../firebase/firebase', () => ({ auth: {}, db: {} }));
jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...args) => mockSignIn(...args),
  signOut: () => Promise.resolve(),
  sendPasswordResetEmail: () => Promise.resolve(),
}), { virtual: true });
jest.mock('firebase/firestore', () => ({ doc: () => ({}), getDoc: (...args) => mockGetDoc(...args) }), { virtual: true });
jest.mock('../../components/ui/image-slider.tsx', () => ({ ImageSlider: () => null }));
jest.mock('../components/StaffPortalIntro', () => () => null);
jest.mock('framer-motion', () => {
  const React = require('react');
  const tag = name => React.forwardRef(({ initial, animate, exit, transition, variants, whileHover, whileTap, layout, ...rest }, ref) => React.createElement(name, { ...rest, ref }));
  return { motion: new Proxy({}, { get: (_, name) => tag(name) }), AnimatePresence: ({ children }) => children };
});

beforeEach(() => {
  mockNavigate.mockReset();
  global.fetch = () => Promise.resolve({ status: 200, json: () => Promise.resolve({}) });
});

const signIn = async () => {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'staff@resort.ph' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
  fireEvent.click(screen.getByRole('button', { name: /Sign in to staff portal/ }));
  // Wait for the button to stop saying "Signing in..." (or for the hang test, the request to start).
  await act(() => Promise.resolve());
};

test('logs in staff and opens their dashboard', async () => {
  mockSignIn = () => Promise.resolve({ user: { uid: 'u1' } });
  mockGetDoc = () => Promise.resolve({ exists: () => true, data: () => ({ role: 'admin' }) });
  render(<Login />);
  await signIn();
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard', { replace: true }));
});

test('never hangs: a database that does not answer shows a clear message', async () => {
  jest.useFakeTimers();
  mockSignIn = () => Promise.resolve({ user: { uid: 'u1' } });
  mockGetDoc = () => new Promise(() => {}); // never answers
  render(<Login />);
  await signIn();
  await act(async () => { jest.advanceTimersByTime(16000); });
  expect(await screen.findByText(/system isn’t answering/)).toBeInTheDocument();
  expect(mockNavigate).not.toHaveBeenCalled();
  jest.useRealTimers();
});

test('a network problem is not reported as a wrong password', async () => {
  mockSignIn = () => Promise.reject(Object.assign(new Error('offline'), { code: 'auth/network-request-failed' }));
  render(<Login />);
  await signIn();
  expect(await screen.findByText(/Check your internet connection/)).toBeInTheDocument();
  expect(screen.queryByText('Invalid email or password.')).toBeNull();
});

test('a wrong password still says so', async () => {
  mockSignIn = () => Promise.reject(Object.assign(new Error('bad'), { code: 'auth/invalid-credential' }));
  render(<Login />);
  await signIn();
  expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
});
