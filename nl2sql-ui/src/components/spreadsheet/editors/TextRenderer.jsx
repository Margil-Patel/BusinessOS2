import React from 'react';

/**
 * TextRenderer — VARCHAR / CHAR / TEXT / NAME
 * Displays value as plain text with ellipsis overflow.
 * Full value shown in browser tooltip.
 */
const TextRenderer = ({ value, style = {} }) => {
  if (value === null || value === undefined) {
    return (
      <span style={{ color: 'rgba(139,148,158,0.45)', fontStyle: 'italic', ...style }}>
        NULL
      </span>
    );
  }
  const str = String(value);
  return (
    <span
      title={str}
      style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        width: '100%',
        ...style,
      }}
    >
      {str}
    </span>
  );
};

export default TextRenderer;
