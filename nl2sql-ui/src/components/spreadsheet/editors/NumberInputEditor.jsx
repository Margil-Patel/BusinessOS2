import React, { useRef, useEffect } from 'react';
import { inputBase } from './TextInputEditor';

/**
 * NumberInputEditor — integer / decimal / money / float
 * Passes `step` prop to distinguish int vs decimal.
 */
const NumberInputEditor = ({ value, onChange, onCommit, onCancel, autoFocus, onKeyDown: fwdKeyDown, step = 'any' }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
    }
  }, [autoFocus]);

  return (
    <input
      ref={ref}
      type="number"
      step={step}
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '' || raw === '-') { onChange(raw); return; }
        const parsed = step === '1' ? parseInt(raw, 10) : parseFloat(raw);
        onChange(Number.isFinite(parsed) ? parsed : raw);
      }}
      onBlur={() => onCommit?.()}
      onKeyDown={fwdKeyDown}
      style={{
        ...inputBase,
        fontFamily: 'var(--font-mono)',
        textAlign: 'right',
        padding: '0 10px',
        MozAppearance: 'textfield',
      }}
    />
  );
};

export default NumberInputEditor;
