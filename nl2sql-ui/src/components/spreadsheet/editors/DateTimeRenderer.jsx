import React from 'react';

/**
 * DateTimeRenderer — TIMESTAMP / TIMESTAMPTZ
 * Formats ISO timestamp strings into human-readable date + time.
 * E.g. "2026-07-28T09:14:00Z" → "Jul 28, 2026  09:14:00"
 */
const DateTimeRenderer = ({ value, style = {} }) => {
  if (value === null || value === undefined) {
    return (
      <span style={{ color: 'rgba(139,148,158,0.45)', fontStyle: 'italic', ...style }}>NULL</span>
    );
  }

  const raw = String(value);
  let datePart = raw;
  let timePart = '';

  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      datePart = d.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
      timePart = d.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      });
    }
  } catch {
    // fall through
  }

  return (
    <span
      title={raw}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8rem',
        color: '#79c0ff',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {/* Clock icon */}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.6, flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      <span>{datePart}</span>
      {timePart && (
        <span style={{ color: '#a5d6ff', opacity: 0.9 }}>{timePart}</span>
      )}
    </span>
  );
};

export default DateTimeRenderer;
