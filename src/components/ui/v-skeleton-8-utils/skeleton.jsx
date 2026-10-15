import React from 'react';

export function Skeleton({ className = '', ...props }) {
  return (
    <div
      className={`skeleton-shimmer relative overflow-hidden rounded-md bg-muted ${className}`}
      aria-hidden="true"
      {...props}
    />
  );
}
