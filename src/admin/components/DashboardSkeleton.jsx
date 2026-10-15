import React from 'react';
import { Pattern } from '../../components/ui/v-skeleton-8.tsx';

export default function DashboardSkeleton() {
  return (
    <div style={{ padding: '20px' }}>
      <Pattern className="h-[calc(100vh-160px)] min-h-[420px] max-w-none" />
    </div>
  );
}
