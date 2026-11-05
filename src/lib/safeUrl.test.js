import { safeHttpUrl } from './safeUrl';

test('only http and https links are kept', () => {
  expect(safeHttpUrl('https://lawiswiskawayanresort.com/news')).toBe('https://lawiswiskawayanresort.com/news');
  expect(safeHttpUrl('http://example.com')).toBe('http://example.com/');
  expect(safeHttpUrl('javascript:alert(1)')).toBe('');
  expect(safeHttpUrl(' JavaScript:alert(1)')).toBe('');
  expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe('');
  expect(safeHttpUrl('not a link')).toBe('');
  expect(safeHttpUrl('')).toBe('');
});
