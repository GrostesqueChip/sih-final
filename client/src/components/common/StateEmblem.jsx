import React from 'react';

/**
 * State Emblem of India (Lion Capital of Ashoka with "Satyameva Jayate").
 * Uses the official artwork; `light` renders the white variant for dark backgrounds.
 */
const HEIGHTS = { xs: 28, sm: 40, md: 56, lg: 76, xl: 104 };

export default function StateEmblem({ size = 'md', light = false, color, className = '', height }) {
  const h = height || HEIGHTS[size] || HEIGHTS.md;
  const isLight = light || (typeof color === 'string' && /^#?f{3,6}$/i.test(color.replace('#', '')));
  return (
    <img
      src={isLight ? '/assets/gov/emblem-white-240.png' : '/assets/gov/emblem-240.png'}
      alt="State Emblem of India — Satyameva Jayate"
      style={{ height: h, width: 'auto' }}
      className={`inline-block select-none shrink-0 ${className}`}
      draggable={false}
    />
  );
}

export function AshokaChakra({ size = 24, className = '', spin = false }) {
  return (
    <img
      src="/assets/gov/ashoka-chakra.svg"
      alt="Ashoka Chakra"
      style={{ width: size, height: size }}
      className={`inline-block select-none ${spin ? 'animate-[spin_12s_linear_infinite]' : ''} ${className}`}
      draggable={false}
    />
  );
}

export function TricolorBar({ className = '', thickness = 3 }) {
  return (
    <div className={`flex w-full ${className}`} aria-hidden="true">
      <div className="flex-1 bg-[#FF9933]" style={{ height: thickness }} />
      <div className="flex-1 bg-white" style={{ height: thickness }} />
      <div className="flex-1 bg-[#138808]" style={{ height: thickness }} />
    </div>
  );
}
