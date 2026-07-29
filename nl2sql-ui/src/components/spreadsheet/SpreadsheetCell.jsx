import React from 'react';
import CellRenderer from './CellRenderer';
import CellEditor   from './CellEditor';

/**
 * SpreadsheetCell
 * Two rendering modes:
 *   VIEW  – shows CellRenderer (read-only display)
 *   EDIT  – shows CellEditor  (appropriate input for the PG type)
 *
 * Props:
 *   value            – current cell value (from localRows)
 *   editorDescriptor – { editorType, align, fontMono, label }
 *   loading          – show skeleton shimmer
 *   width            – column width in px
 *   isActive         – this cell has keyboard focus (blue border)
 *   isEditing        – this cell is in edit mode (input shown)
 *   editValue        – staged value for the input (only used when isEditing)
 *   isDirty          – this cell's row has been modified (show indicator)
 *   onEditChange     – (newValue) => void
 *   onEditCommit     – () => void
 *   onEditCancel     – () => void
 *   onCellClick      – () => void
 *   onCellDoubleClick – () => void
 *   onKeyDown        – (e) => void forwarded from grid
 */
const SpreadsheetCell = ({
  value,
  editorDescriptor,
  loading      = false,
  width,
  isActive     = false,
  isEditing    = false,
  editValue,
  isDirty      = false,
  errorMessage = null,   // validation error string or null
  onEditChange,
  onEditCommit,
  onEditCancel,
  onCellClick,
  onCellDoubleClick,
  onKeyDown,
}) => {
  const hasError = Boolean(errorMessage);
  const align    = editorDescriptor?.align    ?? 'left';
  const fontMono = editorDescriptor?.fontMono ?? false;

  const containerStyle = {
    width:       width ? `${width}px`  : undefined,
    minWidth:    width ? `${width}px`  : '120px',
    maxWidth:    width ? `${width}px`  : undefined,
    padding:     isEditing ? 0 : '0 10px',
    height:      34,
    display:     'flex',
    alignItems:  'center',
    justifyContent: align === 'right'  ? 'flex-end'
                  : align === 'center' ? 'center'
                  :                      'flex-start',
    borderRight: '1px solid rgba(48,54,61,0.6)',
    // Active / editing / error borders
    outline:     hasError
                   ? `2px solid rgba(248,81,73,0.9)`
                   : isEditing ? '2px solid var(--accent)'
                   : isActive  ? '1px solid rgba(47,129,247,0.6)'
                   :             'none',
    outlineOffset: isEditing ? '-2px' : '-1px',
    background:  hasError && isEditing ? 'rgba(248,81,73,0.07)'
               : isEditing             ? '#1c2128'
               : hasError              ? 'rgba(248,81,73,0.04)'
               : isActive              ? 'rgba(47,129,247,0.05)'
               :                        'transparent',
    overflow:    isEditing ? 'visible' : 'hidden',
    flexShrink:  0,
    fontSize:    '0.82rem',
    fontFamily:  fontMono ? 'var(--font-mono)' : 'var(--font-sans)',
    color:       'var(--text-primary)',
    whiteSpace:  'nowrap',
    position:    'relative',
    cursor:      isEditing ? 'text' : 'default',
    zIndex:      isEditing ? 15 : 1,
    transition:  'outline 0.08s, background 0.08s',
    boxSizing:   'border-box',
  };

  // ── Skeleton loading ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={containerStyle}>
        <div className="ss-skeleton" style={{ width: '70%', height: 12, borderRadius: 3 }} />
      </div>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div style={containerStyle} title={hasError ? errorMessage : undefined}>
        <CellEditor
          value={editValue}
          editorDescriptor={editorDescriptor}
          onChange={onEditChange}
          onCommit={onEditCommit}
          onCancel={onEditCancel}
          autoFocus
          onKeyDown={onKeyDown}
        />
        {/* Error / dirty indicator dot (top-right) */}
        <div style={{
          position: 'absolute', top: 2, right: 3,
          width: 5, height: 5, borderRadius: '50%',
          background: hasError ? 'var(--danger)' : isDirty ? 'var(--accent)' : 'transparent',
          opacity: (hasError || isDirty) ? 0.9 : 0,
        }} />
      </div>
    );
  }

  // ── View mode ────────────────────────────────────────────────────────────
  return (
    <div
      style={containerStyle}
      title={hasError ? errorMessage : undefined}
      onClick={onCellClick}
      onDoubleClick={onCellDoubleClick}
    >
      {hasError ? (
        <span style={{
          fontSize: '0.75rem',
          color: 'var(--danger)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          opacity: 0.9,
          fontStyle: 'italic',
        }}>
          ⚠ {errorMessage}
        </span>
      ) : (
        <CellRenderer value={value} editorDescriptor={editorDescriptor} />
      )}
      {(hasError || isDirty) && (
        <div style={{
          position: 'absolute', top: 2, right: 3,
          width: 5, height: 5, borderRadius: '50%',
          background: hasError ? 'var(--danger)' : 'var(--accent)',
          opacity: 0.8,
        }} />
      )}
    </div>
  );
};

export default React.memo(SpreadsheetCell, (prev, next) => {
  return (
    prev.value === next.value &&
    prev.loading === next.loading &&
    prev.width === next.width &&
    prev.isActive === next.isActive &&
    prev.isEditing === next.isEditing &&
    prev.editValue === next.editValue &&
    prev.isDirty === next.isDirty &&
    prev.errorMessage === next.errorMessage &&
    prev.editorDescriptor === next.editorDescriptor
  );
});



