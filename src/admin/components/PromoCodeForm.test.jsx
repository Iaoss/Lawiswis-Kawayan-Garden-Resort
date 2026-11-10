import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PromoCodeForm from './PromoCodeForm';
import { staffApi } from '../lib/staffApi';

jest.mock('../lib/staffApi', () => ({ staffApi: jest.fn() }));

const props = { colors: { TEXT: '#000', SUBTEXT: '#333', MUTED: '#666', BORDER: '#ccc' }, inp: {}, btn: () => ({}) };

beforeEach(() => staffApi.mockReset());

test('sends only the code to the server and reports the discount', async () => {
  staffApi.mockResolvedValue({ code: 'SUMMER10', discount: 300, label: '10% off' });
  const onApplied = jest.fn();
  render(<PromoCodeForm {...props} reservation={{ id: 'abc', status: 'pending', totalAmount: 3000 }} onApplied={onApplied} />);
  fireEvent.click(screen.getByText('Add promo'));
  fireEvent.change(screen.getByLabelText('Promo code'), { target: { value: 'summer10' } });
  fireEvent.click(screen.getByText('Apply promo'));
  await waitFor(() => expect(onApplied).toHaveBeenCalled());
  expect(staffApi).toHaveBeenCalledWith('staff-billing', { action: 'apply-promo', reservationId: 'abc', code: 'SUMMER10' });
});

test('shows the server error, e.g. an expired code', async () => {
  staffApi.mockRejectedValue(new Error('Code expired'));
  render(<PromoCodeForm {...props} reservation={{ id: 'abc', status: 'pending' }} />);
  fireEvent.click(screen.getByText('Add promo'));
  fireEvent.change(screen.getByLabelText('Promo code'), { target: { value: 'OLD5' } });
  fireEvent.click(screen.getByText('Apply promo'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Code expired');
});

test('shows an applied promo and hides the button', () => {
  render(<PromoCodeForm {...props} reservation={{ id: 'abc', status: 'pending', promoCode: 'SUMMER10', promoDiscount: 300 }} />);
  expect(screen.getByText(/SUMMER10/)).toBeInTheDocument();
  expect(screen.queryByText('Add promo')).toBeNull();
});
