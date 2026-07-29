import React from 'react';

/**
 * IntegerRenderer — INTEGER / BIGINT / SERIAL
 * Right-aligned, monospace, with thousands separator.
 */
const IntegerRenderer = ({ value, style = {} }) => {
  if (value === null || value === undefined) {
    return (
      <span style={{ color: 'rgba(139,148,158,0.45)', fontStyle: 'italic', width: '100%', textAlign: 'right', ...style }}>
        NULL
      </span>
    );
  }
  const num = Number(value);
  const display = Number.isFinite(num)
    ? num.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : String(value);

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

export default IntegerRenderer;
