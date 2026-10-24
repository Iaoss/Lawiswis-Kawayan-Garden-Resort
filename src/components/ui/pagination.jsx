import React, { useEffect, useMemo, useState } from 'react';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Splits a list into pages. The page goes back to 1 whenever `resetKey`
// changes (e.g. a new search or filter), and is clamped when the list shrinks.
export function usePagination(items, { pageSize: initialPageSize = 10, resetKey = '' } = {}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);

  useEffect(() => { setPage(1); }, [resetKey, pageSize]);

  const pageItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage, pageSize],
  );

  return {
    page: currentPage,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    pageItems,
    total,
    start: total === 0 ? 0 : (currentPage - 1) * pageSize + 1,
    end: Math.min(currentPage * pageSize, total),
  };
}

// Page numbers to show, with '…' gaps: 1 … 4 5 6 … 20
export function getPageNumbers(page, pageCount, siblings = 1) {
  const pages = new Set([1, pageCount]);
  for (let p = page - siblings; p <= page + siblings; p += 1) {
    if (p >= 1 && p <= pageCount) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  sorted.forEach((p, index) => {
    if (index > 0 && p - sorted[index - 1] > 1) result.push('…');
    result.push(p);
  });
  return result;
}

const DEFAULT_COLORS = {
  text: '#1f2937',
  muted: '#6b7280',
  border: '#e5e7eb',
  background: '#ffffff',
  accent: '#1a3a1a',
  accentText: '#ffffff',
};

// Pagination controls. Pass the object returned by usePagination as `pagination`.
export function Pagination({ pagination, colors, pageSizeOptions = PAGE_SIZE_OPTIONS, itemLabel = 'records', style }) {
  const { page, setPage, pageCount, pageSize, setPageSize, total, start, end } = pagination;
  const c = { ...DEFAULT_COLORS, ...colors };
  if (total === 0) return null;

  const button = (active, disabled) => ({
    minWidth: 32,
    height: 32,
    padding: '0 10px',
    borderRadius: 8,
    border: `1px solid ${active ? c.accent : c.border}`,
    background: active ? c.accent : c.background,
    color: active ? c.accentText : disabled ? c.muted : c.text,
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    fontFamily: 'inherit',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  });

  const goTo = p => setPage(Math.min(pageCount, Math.max(1, p)));

  return (
    <nav
      aria-label="Pagination"
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', fontSize: 12, color: c.muted, ...style }}
    >
      <span>Showing {start}–{end} of {total} {itemLabel}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => goTo(page - 1)} style={button(false, page <= 1)}>‹ Prev</button>
        {getPageNumbers(page, pageCount).map((p, index) => (p === '…'
          ? <span key={`gap-${index}`} style={{ padding: '0 4px' }}>…</span>
          : (
            <button
              key={p}
              type="button"
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => goTo(p)}
              style={button(p === page, false)}
            >
              {p}
            </button>
          )))}
        <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => goTo(page + 1)} style={button(false, page >= pageCount)}>Next ›</button>
        {setPageSize && pageSizeOptions.length > 1 && (
          <select
            aria-label="Rows per page"
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            style={{ ...button(false, false), marginLeft: 6 }}
          >
            {pageSizeOptions.map(size => <option key={size} value={size}>{size} / page</option>)}
          </select>
        )}
      </div>
    </nav>
  );
}

export default Pagination;
