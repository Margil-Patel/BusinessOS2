import React, { useRef, useEffect } from 'react';

/**
 * BooleanInputEditor — boolean
 * Three-state select: TRUE / FALSE / NULL
 */
const BooleanInputEditor = ({ value, onChange, onCommit, onCancel, autoFocus, onKeyDown: fwdKeyDown }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (autoFocus && ref.current) ref.current.focus();
  }, [autoFocus]);

  // Normalise incoming value to 'true' | 'false' | ''
  const strVal =
    value === true  || value === 'true'  || value === 't' || value === '1' ? 'true'
    : value === false || value === 'false' || value === 'f' || value === '0' ? 'false'
    : '';

  const handleChange = (e) => {
    const v = e.target.value;
    if (v === 'true')  { onChange(true);  return; }
    if (v === 'false') { onChange(false); return; }
    onChange(null);
  };

  return (
    <select
      ref={ref}
      value={strVal}
      onChange={handleChange}
      onBlur={() => onCommit?.()}
      onKeyDown={fwdKeyDown}
      style={{
        width: '100%',
        height: '100%',
        background: '#1c2128',
        border: 'none',
        outline: 'none',
        color: strVal === 'true' ? '#3fb950' : strVal === 'false' ? '#f85149' : 'rgba(139,148,158,0.6)',
        fontSize: '0.8rem',
        fontWeight: 600,
        padding: '0 10px',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <option value="">NULL</option>
      <option value="true">TRUE</option>
      <option value="false">FALSE</option>
    </select>
  );
};

export default BooleanInputEditor;
