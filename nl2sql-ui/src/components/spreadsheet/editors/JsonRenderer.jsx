import React, { useState, useCallback } from 'react';

/**
 * JsonRenderer — JSON / JSONB / ARRAY
 * Shows a collapsed preview; click to expand inline.
 * Syntax-highlighted keys in gold, strings in green, numbers in blue.
 */

// Light syntax highlighting for a JSON string
function syntaxHighlight(json) {
  if (!json) return '';
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let cls = 'color:#79c0ff'; // number
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'color:#e3b341'; // key
          } else {
            cls = 'color:#a5d6ff'; // string value
          }
        } else if (/true|false/.test(match)) {
          cls = 'color:#3fb950';
        } else if (/null/.test(match)) {
          cls = 'color:rgba(139,148,158,0.6)';
        }
        return `<span style="${cls}">${match}</span>`;
      }
    );
}

const JsonRenderer = ({ value, style = {} }) => {
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback((e) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  }, []);

  if (value === null || value === undefined) {
    return (
      <span style={{ color: 'rgba(139,148,158,0.45)', fontStyle: 'italic', ...style }}>NULL</span>
    );
  }

  let parsed;
  let raw;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
    raw = JSON.stringify(parsed, null, 2);
  } catch {
    raw = String(value);
    parsed = null;
  }

  // Summary line
  let summary = raw;
  if (Array.isArray(parsed)) {
    summary = `[ ${parsed.length} item${parsed.length !== 1 ? 's' : ''} ]`;
  } else if (parsed && typeof parsed === 'object') {
    const keys = Object.keys(parsed);
    summary = `{ ${keys.slice(0, 2).join(', ')}${keys.length > 2 ? ', …' : ''} }`;
  } else if (raw.length > 40) {
    summary = raw.slice(0, 40) + '…';
  }

  if (!expanded) {
    return (
      <span
        title="Click to expand JSON"
        onClick={toggle}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontFamily: 'var(--font-mono)',
          fontSize: '0.78rem',
          color: '#e3b341',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          ...style,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.7, flexShrink: 0 }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        {summary}
      </span>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 20,
      }}
    >
      {/* Inline expanded panel */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          minWidth: 280,
          maxWidth: 480,
          maxHeight: 300,
          overflowY: 'auto',
          background: '#161b22',
          border: '1px solid rgba(47,129,247,0.3)',
          borderRadius: 6,
          padding: '10px 12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          zIndex: 100,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            JSON
          </span>
          <button
            onClick={toggle}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: '0.75rem', padding: '2px 6px',
            }}
          >
            ✕
          </button>
        </div>
        <pre
          style={{
            margin: 0,
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
          dangerouslySetInnerHTML={{ __html: syntaxHighlight(raw) }}
        />
      </div>
      {/* Collapsed trigger (still visible behind panel) */}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#e3b341' }}>
        {summary}
      </span>
    </div>
  );
};

export default JsonRenderer;
