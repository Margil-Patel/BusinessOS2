import React from 'react';

/**
 * MoneyRenderer — MONEY type
 * Right-aligned with currency formatting.
 */
const MoneyRenderer = ({ value, style = {} }) => {
  if (value === null || value === undefined) {
    return (
      <span style={{ color: 'rgba(139,148,158,0.45)', fontStyle: 'italic', width: '100%', textAlign: 'right', ...style }}>
        NULL
      </span>
    );
  }

  // PG money comes back as a string like "$1,234.56" — display as-is
  const str = String(value);

  return (
    <span
      title={str}
      style={{
        fontFamily: 'var(--font-mono)',
        width: '100%',
        textAlign: 'right',
        whiteSpace: 'nowrap',
        color: '#3fb950',
        ...style,
      }}
    >
      {str}
    </span>
  );
};

export default MoneyRenderer;
