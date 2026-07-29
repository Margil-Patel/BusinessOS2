import React, { useRef, useEffect } from 'react';
import { inputBase } from './TextInputEditor';

/**
 * DateTimeInputEditor — timestamp / timestamptz
 * Uses <input type="datetime-local">. Converts ISO strings to local format.
 */
const DateTimeInputEditor = ({ value, onChange, onCommit, onCancel, autoFocus, onKeyDown: fwdKeyDown }) => {
  const ref = useRef(null);
  useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, [autoFocus]);

  // datetime-local needs "YYYY-MM-DDTHH:MM:SS" format (no Z)
  let dtStr = '';
  if (value) {
    try {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        // toISOString gives UTC — use local time offsets
        const pad = (n) => String(n).padStart(2, '0');
        dtStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      }
    } catch { dtStr = String(value).slice(0, 19); }
  }

  return (
    <input
      ref={ref}
      type="datetime-local"
      step="1"
      value={dtStr}
      onChange={(e) => onChange(e.target.value || null)}
      onBlur={() => onCommit?.()}
      onKeyDown={fwdKeyDown}
      style={{ ...inputBase, fontFamily: 'var(--font-mono)', color: '#79c0ff', colorScheme: 'dark' }}
    />
  );
};

export default DateTimeInputEditor;
