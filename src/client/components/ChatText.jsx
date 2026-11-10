import React from 'react';

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
const SITE = 'https://lawiswis-kawayan-garden-resort.vercel.app';

// Short labels for the resort's own links in automatic answers.
function linkLabel(url) {
  if (!url.startsWith(SITE)) return url;
  const path = url.slice(SITE.length);
  if (path.startsWith('/book?')) return 'Book these dates';
  if (path.startsWith('/corporate-booking')) return 'Group / corporate booking';
  if (path.startsWith('/my-bookings')) return 'My bookings';
  return url;
}

// Chat message text with clickable links.
export default function ChatText({ text }) {
  const parts = String(text || '').split(URL_PATTERN);
  return parts.map((part, index) => (index % 2 === 1
    ? (
      <a key={index} href={part} target={part.startsWith(SITE) ? '_self' : '_blank'} rel="noopener noreferrer"
        style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline', overflowWrap: 'anywhere' }}>
        {linkLabel(part)}
      </a>
    )
    : <React.Fragment key={index}>{part}</React.Fragment>));
}
