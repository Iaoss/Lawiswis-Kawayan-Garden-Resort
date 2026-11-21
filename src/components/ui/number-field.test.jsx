import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import NumberField from './number-field';

function Harness({ min = 1, max = 14 }) {
  const [value, setValue] = useState(2);
  return <NumberField value={value} onChange={setValue} min={min} max={max} label="Adults" />;
}

test('takes digits only', () => {
  render(<Harness />);
  const box = screen.getByLabelText('Adults');
  fireEvent.change(box, { target: { value: '1e-4.' } });
  expect(box).toHaveValue('14');
});

test('can be cleared while typing and is kept within the limits on leaving', () => {
  render(<Harness />);
  const box = screen.getByLabelText('Adults');
  fireEvent.change(box, { target: { value: '' } });
  expect(box).toHaveValue('');
  fireEvent.blur(box);
  expect(box).toHaveValue('1');
  fireEvent.change(box, { target: { value: '99' } });
  fireEvent.blur(box);
  expect(box).toHaveValue('14');
});

test('the − and + buttons still work and stop at the limits', () => {
  render(<Harness max={3} />);
  fireEvent.click(screen.getByLabelText('More adults'));
  expect(screen.getByLabelText('Adults')).toHaveValue('3');
  expect(screen.getByLabelText('More adults')).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Fewer adults'));
  expect(screen.getByLabelText('Adults')).toHaveValue('2');
});
