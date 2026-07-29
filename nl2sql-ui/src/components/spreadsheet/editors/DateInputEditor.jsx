import React, { useRef, useEffect } from 'react';
import { inputBase } from './TextInputEditor';

/**
 * DateInputEditor — date
 * Converts ISO datetime strings to YYYY-MM-DD for the input.
 */
const DateInputEditor = ({ value, onChange, onCommit, onCancel, autoFocus, onKeyDown: fwdKeyDown }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (autoFocus && ref.current) ref.current.focus();
  }, [autoFocus]);

  // Normalise to YYYY-MM-DD
  let dateStr = '';
  if (value) {
    const s = String(value);
    dateStr = s.includes('T') ? s.slice(0, 10) : s.slice(0, 10);
  }

  return (
    <input
      ref={ref}
      type="date"
      value={dateStr}
      onChange={(e) => onChange(e.target.value || null)}
      onBlur={() => onCommit?.()}
      onKeyDown={fwdKeyDown}
      style={{
        ...inputBase,
        fontFamily: 'var(--font-mono)',
        color: '#a5d6ff',
        colorScheme: 'dark',
      }}
    />
  );
};

export default DateInputEditor;
