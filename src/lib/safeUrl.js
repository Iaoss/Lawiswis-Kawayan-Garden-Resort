// A web link that is safe to put in href/src: only http:// or https://.
// Anything else (javascript:, data:, vbscript:, …) gives ''. Use it for any
// link that staff or guests typed in, so it can't run code when clicked.
export function safeHttpUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}
