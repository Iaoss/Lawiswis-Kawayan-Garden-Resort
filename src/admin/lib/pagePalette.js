// Light and dark colors for staff pages that draw their own panels
// (Messages, Email). Matches the dark colors used on Reports.
export function pagePalette(dark) {
  return dark
    ? {
        card: '#1c1c1c', card2: '#282827', border: '#2a2a28', line: '#242422',
        text: '#f0f0f0', sub: '#c7c7c0',
        soft: 'rgba(156,181,111,0.14)', softBorder: 'rgba(156,181,111,0.4)', green: '#b5cf86',
        chatBg: '#161615', panel: '#191918',
        errBg: 'rgba(239,68,68,0.12)', errBorder: 'rgba(239,68,68,0.35)', errText: '#fca5a5',
      }
    : {
        card: '#fff', card2: '#f9fafb', border: '#e5e7eb', line: '#f3f4f6',
        text: '#111', sub: '#6b7280',
        soft: '#f0fdf4', softBorder: '#86efac', green: '#428475',
        chatBg: '#fafafa', panel: '#fafffe',
        errBg: '#fef2f2', errBorder: '#fecaca', errText: '#b91c1c',
      };
}
