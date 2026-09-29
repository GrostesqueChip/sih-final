import React from 'react';

export default function LoadingSpinner({ size = 'md', message = '' }) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-3',
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 space-y-3">
      <div
        className={`${sizeClasses[size] || sizeClasses.md} rounded-full border-slate-300 border-t-primary-600 animate-spin`}
        role="status"
        aria-label="Loading"
      />
      {message && <p className="text-sm font-medium text-slate-600">{message}</p>}
    </div>
  );
}
