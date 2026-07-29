import React, { useRef, useEffect } from 'react';
import { inputBase } from './TextInputEditor';

/** TimeInputEditor — time / timetz */
const TimeInputEditor = ({ value, onChange, onCommit, onCancel, autoFocus, onKeyDown: fwdKeyDown }) => {
  const ref = useRef(null);
  useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, [autoFocus]);

  const timeStr = value ? String(value).slice(0, 8) : '';

  return (
    <input
      ref={ref}
      type="time"
      step="1"
      value={timeStr}
      onChange={(e) => onChange(e.target.value || null)}
      onBlur={() => onCommit?.()}
      onKeyDown={fwdKeyDown}
      style={{ ...inputBase, fontFamily: 'var(--font-mono)', color: '#a5d6ff', colorScheme: 'dark' }}
    />
  );
};

export default TimeInputEditor;
