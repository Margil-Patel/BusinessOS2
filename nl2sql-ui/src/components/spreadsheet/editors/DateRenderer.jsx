import React from 'react';

/**
 * DateRenderer — DATE
 * Formats ISO date strings into locale-friendly display (e.g. "Jul 28, 2026").
 * Preserves raw value in tooltip.
 */
const DateRenderer = ({ value, style = {} }) => {
  if (value === null || value === undefined) {
    return (
      <span style={{ color: 'rgba(139,148,158,0.45)', fontStyle: 'italic', ...style }}>NULL</span>
    );
  }

  const raw = String(value);
  let display = raw;
  try {
    // Parse as UTC date to avoid timezone shifting the displayed day
    const d = new Date(raw.includes('T') ? raw : `${raw}T00:00:00Z`);
    if (!isNaN(d.getTime())) {
      display = d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
    }
  } catch {
    // fall through to raw
  }

  return (
    <span
      title={raw}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8rem',
        color: '#79c0ff',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {/* Calendar icon */}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.6, flexShrink: 0 }}>
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      {display}
    </span>
  );
};

export default DateRenderer;
