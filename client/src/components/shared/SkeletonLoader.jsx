import React from 'react';

export function SkeletonLine({ className = '' }) {
  return (
    <div className={`h-4 bg-slate-200 rounded animate-pulse ${className}`} />
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3 ${className}`}>
      <div className="h-3 bg-slate-200 rounded animate-pulse w-1/3" />
      <div className="h-8 bg-slate-200 rounded animate-pulse w-1/2" />
      <div className="h-3 bg-slate-200 rounded animate-pulse w-2/3" />
    </div>
  );
}

export function SkeletonTableRow({ cols = 5 }) {
  return (
    <tr>
      {[...Array(cols)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-slate-200 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

export default function SkeletonLoader({ type = 'card', count = 3, cols = 5 }) {
  if (type === 'card') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(count)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }
  if (type === 'table') {
    return (
      <>
        {[...Array(count)].map((_, i) => <SkeletonTableRow key={i} cols={cols} />)}
      </>
    );
  }
  return <SkeletonCard />;
}
