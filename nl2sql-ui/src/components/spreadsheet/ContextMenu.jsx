import React, { useEffect, useRef } from 'react';

/**
 * ContextMenu
 * Floating right-click context menu for spreadsheet cell/row actions.
 */
const ContextMenu = ({
  x,
  y,
  onClose,
  onEditCell,
  onDuplicateRow,
  onInsertRowAbove,
  onInsertRowBelow,
  onDeleteRow,
  onCopyCell,
  onPasteCell,
  onClearCell,
  selectedRowCount = 0,
}) => {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    const handleScrollOrKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleScrollOrKey);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleScrollOrKey);
    };
  }, [onClose]);

  const itemStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    fontSize: '0.78rem',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    borderRadius: 4,
    userSelect: 'none',
    transition: 'background 0.1s',
  };

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: Math.min(y, window.innerHeight - 280),
        left: Math.min(x, window.innerWidth - 200),
        zIndex: 9999,
        background: '#161b22',
        border: '1px solid var(--border-color)',
        borderRadius: 6,
        padding: 4,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        minWidth: 180,
      }}
    >
      <div
        className="ctx-item"
        style={itemStyle}
        onClick={() => { onEditCell?.(); onClose?.(); }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Edit Cell
      </div>

      <div
        className="ctx-item"
        style={itemStyle}
        onClick={() => { onCopyCell?.(); onClose?.(); }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        Copy Cell Value (Ctrl+C)
      </div>

      <div
        className="ctx-item"
        style={itemStyle}
        onClick={() => { onPasteCell?.(); onClose?.(); }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
          <rect x="8" y="2" width="8" height="4" rx="1"/>
        </svg>
        Paste Cell Value (Ctrl+V)
      </div>

      <div
        className="ctx-item"
        style={itemStyle}
        onClick={() => { onClearCell?.(); onClose?.(); }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
        </svg>
        Clear Cell Value
      </div>

      <div style={{ height: 1, background: 'var(--border-color)', margin: '4px 0' }} />

      <div
        className="ctx-item"
        style={itemStyle}
        onClick={() => { onDuplicateRow?.(); onClose?.(); }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2"/><rect x="2" y="2" width="13" height="13" rx="2"/>
        </svg>
        Duplicate Row{selectedRowCount > 1 ? 's' : ''}
      </div>

      <div
        className="ctx-item"
        style={itemStyle}
        onClick={() => { onInsertRowAbove?.(); onClose?.(); }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Insert Row Above
      </div>

      <div
        className="ctx-item"
        style={itemStyle}
        onClick={() => { onInsertRowBelow?.(); onClose?.(); }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Insert Row Below
      </div>

      <div style={{ height: 1, background: 'var(--border-color)', margin: '4px 0' }} />

      <div
        className="ctx-item"
        style={{ ...itemStyle, color: '#f85149' }}
        onClick={() => { onDeleteRow?.(); onClose?.(); }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
        </svg>
        Delete Row{selectedRowCount > 1 ? `s (${selectedRowCount})` : ''}
      </div>
    </div>
  );
};

export default ContextMenu;
