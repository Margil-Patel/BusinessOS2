import React, { useRef, useEffect, useState } from 'react';

/**
 * JsonInputEditor — json / jsonb / array
 * <textarea> that allows multi-line JSON editing.
 * Enter = newline (does NOT commit).
 * Ctrl+Enter = commit.
 * Validates JSON on blur before committing.
 */
const JsonInputEditor = ({ value, onChange, onCommit, onCancel, autoFocus, onKeyDown: fwdKeyDown }) => {
  const ref = useRef(null);
  const [parseError, setParseError] = useState(false);

  let initial = '';
  try {
    initial = value === null || value === undefined
      ? ''
      : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  } catch { initial = String(value ?? ''); }

  const [raw, setRaw] = useState(initial);

  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [autoFocus]);

  const tryCommit = () => {
    if (raw.trim() === '') { onChange(null); onCommit(); return; }
    try {
      const parsed = JSON.parse(raw);
      setParseError(false);
      onChange(parsed);
      onCommit();
    } catch {
      setParseError(true);
      // Don't commit — keep editing
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <textarea
        ref={ref}
        value={raw}
        onChange={(e) => { setRaw(e.target.value); setParseError(false); }}
        onBlur={tryCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            tryCommit();
            e.preventDefault();
            return;
          }
          if (e.key === 'Enter') {
            // Allow newline — stop propagation so grid doesn't commit
            e.stopPropagation();
            return;
          }
          if (e.key === 'Escape') {
            setParseError(false);
            onCancel?.();
            e.preventDefault();
            return;
          }
          fwdKeyDown?.(e);
        }}
        style={{
          width: '100%',
          height: 80,
          background: '#1c2128',
          border: parseError ? '1px solid var(--danger)' : '1px solid rgba(47,129,247,0.3)',
          borderRadius: 4,
          color: parseError ? 'var(--danger)' : '#e3b341',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          padding: '6px 8px',
          outline: 'none',
          resize: 'vertical',
          position: 'relative',
          zIndex: 30,
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        }}
        spellCheck={false}
      />
      {parseError && (
        <div style={{
          position: 'absolute',
          bottom: -18,
          left: 0,
          fontSize: '0.65rem',
          color: 'var(--danger)',
          whiteSpace: 'nowrap',
        }}>
          Invalid JSON — press Ctrl+Enter to commit anyway, Escape to cancel
        </div>
      )}
    </div>
  );
};

export default JsonInputEditor;
