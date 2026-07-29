import React, { useRef, useEffect } from 'react';

/** Shared base style for all input editors */
export const inputBase = {
  width: '100%',
  height: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--text-primary)',
  fontSize: '0.82rem',
  padding: '0 10px',
  boxSizing: 'border-box',
  fontFamily: 'var(--font-sans)',
};

/**
 * TextInputEditor — text / varchar / char / uuid / name
 */
const TextInputEditor = ({ value, onChange, onCommit, onCancel, autoFocus, onKeyDown: fwdKeyDown }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      const len = ref.current.value ? String(ref.current.value).length : 0;
      try { ref.current.setSelectionRange(len, len); } catch {}
    }
  }, [autoFocus]);

  return (
    <input
      ref={ref}
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onCommit?.()}
      onKeyDown={(e) => {
        // Let Tab and Enter bubble to grid for navigation
        // Escape is also handled by grid
        fwdKeyDown?.(e);
      }}
      style={inputBase}
    />
  );
};

export default TextInputEditor;
