import React from 'react';

/**
 * DecimalRenderer — NUMERIC / DECIMAL / FLOAT
 * Right-aligned, monospace, up to 6 significant decimal places.
 */
const DecimalRenderer = ({ value, style = {} }) => {
  if (value === null || value === undefined) {
    return (
      <span style={{ color: 'rgba(139,148,158,0.45)', fontStyle: 'italic', width: '100%', textAlign: 'right', ...style }}>
        NULL
      </span>
    );
  }
  const num = Number(value);
  let display;
  if (!Number.isFinite(num)) {
    display = String(value);
  } else {
    // Show up to 6 decimal places, strip trailing zeros
    display = num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    });
  }

  return (
    <span
      title={String(value)}
      style={{
        fontFamily: 'var(--font-mono)',
        width: '100%',
        textAlign: 'right',
        whiteSpace: 'nowrap',
        color: 'var(--text-primary)',
        ...style,
      }}
    >
      {display}
    </span>
  );
};

export default DecimalRenderer;
