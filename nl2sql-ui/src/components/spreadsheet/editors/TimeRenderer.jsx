import React from 'react';

/**
 * TimeRenderer — TIME / TIMETZ
 * Displays time values (e.g. "14:30:00") with a clock icon.
 */
const TimeRenderer = ({ value, style = {} }) => {
  if (value === null || value === undefined) {
    return (
      <span style={{ color: 'rgba(139,148,158,0.45)', fontStyle: 'italic', ...style }}>NULL</span>
    );
  }

  const raw = String(value);

  return (
    <span
      title={raw}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8rem',
        color: '#a5d6ff',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.6, flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      {raw}
    </span>
  );
};

export default TimeRenderer;
