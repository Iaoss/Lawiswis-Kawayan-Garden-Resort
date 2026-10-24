import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Pagination, getPageNumbers, usePagination } from './pagination';

describe('getPageNumbers', () => {
  test('shows every page when there are few', () => {
    expect(getPageNumbers(1, 3)).toEqual([1, 2, 3]);
  });
  test('collapses distant pages into gaps', () => {
    expect(getPageNumbers(5, 10)).toEqual([1, '…', 4, 5, 6, '…', 10]);
    expect(getPageNumbers(1, 10)).toEqual([1, 2, '…', 10]);
  });
});

function Harness({ items, resetKey }) {
  const pagination = usePagination(items, { pageSize: 10, resetKey });
  return (
    <div>
      <ul>{pagination.pageItems.map(item => <li key={item}>{item}</li>)}</ul>
      <Pagination pagination={pagination} />
    </div>
  );
}

describe('Pagination', () => {
  const items = Array.from({ length: 23 }, (_, i) => `Item ${i + 1}`);

  test('shows one page at a time and moves between pages', () => {
    render(<Harness items={items} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByText('Showing 1–10 of 23 records')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Page 3'));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Item 21')).toBeInTheDocument();
    expect(screen.getByLabelText('Next page')).toBeDisabled();
  });

  test('returns to page 1 when the reset key changes', () => {
    const { rerender } = render(<Harness items={items} resetKey="a" />);
    fireEvent.click(screen.getByLabelText('Next page'));
    expect(screen.getByText('Item 11')).toBeInTheDocument();
    act(() => { rerender(<Harness items={items} resetKey="b" />); });
    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });
});
