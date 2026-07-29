import React from 'react';

/**
 * BooleanRenderer — BOOLEAN
 * Displays a styled pill: green ✓ TRUE or red ✕ FALSE.
 * NULL is shown as a faded dash.
 */
const BooleanRenderer = ({ value, style = {} }) => {
  if (value === null || value === undefined) {
    return (
      <span style={{ color: 'rgba(139,148,158,0.4)', fontSize: '0.8rem', ...style }}>—</span>
    );
  }

  const bool = value === true || value === 'true' || value === 't' || value === '1' || value === 1;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 8px',
        borderRadius: 10,
        fontSize: '0.72rem',
        fontWeight: 600,
        letterSpacing: '0.02em',
        background: bool ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)',
        border: `1px solid ${bool ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)'}`,
        color: bool ? '#3fb950' : '#f85149',
        userSelect: 'none',
        ...style,
      }}
    >
      {bool ? '✓ TRUE' : '✕ FALSE'}
    </span>
  );
};

export default BooleanRenderer;
