import React from 'react';

/**
 * Page title block. `eyebrow` is a small overline (e.g. the section in Hindi),
 * `actions` renders right-aligned buttons.
 */
export default function PageHeader({ title, subtitle, actions, eyebrow, icon: Icon }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <span className="hidden sm:flex w-11 h-11 rounded-lg bg-navy text-saffron-500 items-center justify-center shrink-0 shadow-sm">
            <Icon className="w-5 h-5" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-saffron-700 mb-0.5">{eyebrow}</div>}
          <h1 className="text-[22px] sm:text-2xl font-extrabold text-navy tracking-tight leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-slate-600 mt-1 max-w-3xl">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
