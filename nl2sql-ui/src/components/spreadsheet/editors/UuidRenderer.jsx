import React from 'react';

/**
 * UuidRenderer — UUID
 * Splits UUID into segments with subtle dimming on the non-significant part.
 * e.g.  550e8400  -e29b-41d4-  a716  -446655440000
 */
const UuidRenderer = ({ value, style = {} }) => {
  if (value === null || value === undefined) {
    return (
      <span style={{ color: 'rgba(139,148,158,0.45)', fontStyle: 'italic', ...style }}>NULL</span>
    );
  }

  const raw = String(value).toLowerCase();

  // Highlight the first 8 chars (time_low), dim the rest
  const first = raw.slice(0, 8);
  const rest  = raw.slice(8);

  return (
    <span
      title={raw}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.78rem',
        whiteSpace: 'nowrap',
        letterSpacing: '0.01em',
        ...style,
      }}
    >
      <span style={{ color: '#d2a8ff' }}>{first}</span>
      <span style={{ color: 'rgba(210,168,255,0.45)' }}>{rest}</span>
    </span>
  );
};

export default UuidRenderer;
