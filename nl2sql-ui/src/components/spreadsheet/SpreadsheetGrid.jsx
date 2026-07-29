import React, { useRef, useCallback, useState, useEffect } from 'react';
import SpreadsheetRow from './SpreadsheetRow';
import EmptyRow from './EmptyRow';

const SKELETON_ROW_COUNT = 10;
const MIN_COL_WIDTH = 80;
const DEFAULT_COL_WIDTH = 160;
const ROW_HEIGHT = 34;
const OVERSCAN = 5;

// Header badge colour theme per editorType
const TYPE_COLORS = {
  integer:  '#79c0ff', decimal: '#79c0ff', money: '#3fb950',
  boolean:  '#ff7b72', date: '#a5d6ff',    time: '#a5d6ff',
  datetime: '#a5d6ff', json: '#e3b341',    uuid: '#d2a8ff',
  text:     'var(--text-secondary)',
};
const TYPE_BG = {
  integer:  'rgba(121,192,255,0.08)', decimal: 'rgba(121,192,255,0.08)',
  money:    'rgba(63,185,80,0.08)',   boolean: 'rgba(255,123,114,0.08)',
  date:     'rgba(165,214,255,0.08)', time:    'rgba(165,214,255,0.08)',
  datetime: 'rgba(165,214,255,0.08)', json:   'rgba(227,179,65,0.08)',
  uuid:     'rgba(210,168,255,0.08)',
};
const TYPE_BORDER = {
  integer:  'rgba(121,192,255,0.25)', decimal: 'rgba(121,192,255,0.25)',
  money:    'rgba(63,185,80,0.25)',   boolean: 'rgba(255,123,114,0.25)',
  date:     'rgba(165,214,255,0.25)', time:    'rgba(165,214,255,0.25)',
  datetime: 'rgba(165,214,255,0.25)', json:   'rgba(227,179,65,0.25)',
  uuid:     'rgba(210,168,255,0.25)',
};

/**
 * SpreadsheetGrid
 * Virtualized scrollable grid with frozen columns, column sorting, and right-click context menu.
 */
const SpreadsheetGrid = ({
  columns = [],
  rows = [],
  loading = false,
  columnWidths = {},
  onColumnResize,
  pageOffset = 0,
  activeCell,
  editingCell,
  editValue,
  validationErrors = {},
  checkedRowIndexes = new Set(),
  frozenCount = 0,
  sortConfig = { colName: null, direction: 'asc' },
  onHeaderSortClick,
  onToggleSelectRow,
  onToggleSelectAll,
  onCellClick,
  onCellDoubleClick,
  onCellContextMenu,
  onEditChange,
  onEditCommit,
  onEditCancel,
  onKeyDown,
  onDeleteRow,
  onAddRow,
  gridRef,
}) => {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [clientHeight, setClientHeight] = useState(600);

  const handleScroll = (e) => {
    setScrollTop(e.target.scrollTop);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => { setClientHeight(container.clientHeight || 600); };
    updateHeight();

    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const setCombinedRef = useCallback((node) => {
    containerRef.current = node;
    if (typeof gridRef === 'function') gridRef(node);
    else if (gridRef) gridRef.current = node;
  }, [gridRef]);

  const handleResizeStart = useCallback((e, colName) => {
    e.preventDefault();
    const startX     = e.clientX;
    const startWidth = columnWidths[colName] || DEFAULT_COL_WIDTH;

    const onMouseMove = (mv) => {
      const newWidth = Math.max(MIN_COL_WIDTH, startWidth + mv.clientX - startX);
      onColumnResize?.(colName, newWidth);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [columnWidths, onColumnResize]);

  if (!columns.length) return null;

  // Virtualization calculations
  const totalRowsCount = rows.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex   = Math.min(totalRowsCount, Math.ceil((scrollTop + clientHeight) / ROW_HEIGHT) + OVERSCAN);

  const visibleRows = rows.slice(startIndex, endIndex);
  const topPadding  = startIndex * ROW_HEIGHT;
  const bottomPadding = Math.max(0, (totalRowsCount - endIndex) * ROW_HEIGHT);

  const allSelected = rows.length > 0 && checkedRowIndexes.size === rows.length;

  let currentHeaderFrozenOffset = 55; // width of row gutter

  return (
    <div
      ref={setCombinedRef}
      className="ss-grid-container"
      tabIndex={0}
      onScroll={handleScroll}
      onKeyDown={onKeyDown}
      style={{
        flex: 1,
        overflowX: 'auto',
        overflowY: 'auto',
        position: 'relative',
        outline: 'none',
      }}
    >
      {/* ── Sticky header ─────────────────────────────────────── */}
      <div
        className="ss-header"
        style={{
          display: 'flex',
          position: 'sticky',
          top: 0,
          zIndex: 15,
          background: 'linear-gradient(to bottom, #161b22, #0d1117)',
          borderBottom: '2px solid rgba(47,129,247,0.3)',
          minWidth: 'max-content',
        }}
      >
        {/* Row number / Master Select All header */}
        <div style={{
          width: 55,
          minWidth: 55,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRight: '1px solid rgba(48,54,61,0.6)',
          flexShrink: 0,
          fontSize: '0.7rem',
          color: 'rgba(139,148,158,0.4)',
          background: '#0d1117',
          fontWeight: 500,
          userSelect: 'none',
          gap: 4,
          position: 'sticky',
          left: 0,
          zIndex: 16,
        }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => onToggleSelectAll?.(e.target.checked)}
            title="Select / Deselect all rows on page"
            style={{ cursor: 'pointer', accentColor: 'var(--accent)', margin: 0 }}
          />
          #
        </div>

        {columns.map((col, colIdx) => {
          const width = columnWidths[col.name] || DEFAULT_COL_WIDTH;
          const isSorted = sortConfig.colName === col.name;
          const isFrozen = colIdx < frozenCount;

          const frozenLeft = isFrozen ? currentHeaderFrozenOffset : undefined;
          if (isFrozen) currentHeaderFrozenOffset += width;

          return (
            <div
              key={col.name}
              className="ss-header-cell"
              onClick={() => onHeaderSortClick?.(col.name)}
              title="Click to sort column"
              style={{
                width, minWidth: width, height: 36,
                display: 'flex', alignItems: 'center',
                padding: '0 12px',
                borderRight: '1px solid rgba(48,54,61,0.6)',
                flexShrink: 0, gap: 6, userSelect: 'none',
                cursor: 'pointer',
                position: isFrozen ? 'sticky' : 'relative',
                left: isFrozen ? frozenLeft : undefined,
                zIndex: isFrozen ? 16 : 2,
                background: isFrozen ? '#161b22' : 'transparent',
              }}
            >
              {col.is_primary_key && (
                <span style={{
                  fontSize: '0.6rem', fontWeight: 700, color: '#e3b341',
                  background: 'rgba(227,179,65,0.12)', border: '1px solid rgba(227,179,65,0.3)',
                  borderRadius: 3, padding: '1px 4px', lineHeight: 1.4, flexShrink: 0,
                }}>PK</span>
              )}

              <span style={{
                fontSize: '0.8rem', fontWeight: 600,
                color: isSorted ? 'var(--accent)' : 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
              }}>
                {col.name} {isSorted ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
              </span>

              <span style={{
                fontSize: '0.63rem',
                color: TYPE_COLORS[col.editorDescriptor?.editorType] ?? 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)', flexShrink: 0, opacity: 0.85,
                background: TYPE_BG[col.editorDescriptor?.editorType] ?? 'rgba(255,255,255,0.04)',
                padding: '1px 5px', borderRadius: 3,
                border: `1px solid ${TYPE_BORDER[col.editorDescriptor?.editorType] ?? 'rgba(48,54,61,0.6)'}`,
              }}>
                {col.editorDescriptor?.label ?? col.data_type}
              </span>

              <div
                className="ss-resize-handle"
                onMouseDown={(e) => { e.stopPropagation(); handleResizeStart(e, col.name); }}
                style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 3 }}
              />
            </div>
          );
        })}
      </div>

      {/* ── Virtualized Data Rows ──────────────────────────────── */}
      <div style={{ minWidth: 'max-content', position: 'relative' }}>
        {loading ? (
          Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
            <EmptyRow key={i} columns={columns} columnWidths={columnWidths} rowIndex={i} />
          ))
        ) : (
          <>
            {topPadding > 0 && <div style={{ height: topPadding }} />}

            {visibleRows.map((row, relativeIndex) => {
              const i = startIndex + relativeIndex;
              const rowNumber     = pageOffset + i + 1;
              const isThisActive  = activeCell?.rowIndex  === i;
              const isThisEditing = editingCell?.rowIndex === i;
              const isRowChecked  = checkedRowIndexes.has(i);

              const rowErrors = {};
              columns.forEach((col) => {
                const errKey = `${i}_${col.name}`;
                if (validationErrors[errKey]) rowErrors[col.name] = validationErrors[errKey];
              });
              const hasRowError = Object.keys(rowErrors).length > 0;

              return (
                <SpreadsheetRow
                  key={row._rowId ?? i}
                  row={row}
                  columns={columns}
                  columnWidths={columnWidths}
                  rowNumber={rowNumber}
                  rowIndex={i}
                  isEven={i % 2 === 0}
                  isSelected={isThisActive || isThisEditing || hasRowError}
                  isRowChecked={isRowChecked}
                  activeColName={isThisActive  ? activeCell.colName  : null}
                  editColName={isThisEditing   ? editingCell.colName : null}
                  editValue={editValue}
                  rowErrors={rowErrors}
                  frozenCount={frozenCount}
                  onCellClick={onCellClick}
                  onCellDoubleClick={onCellDoubleClick}
                  onCellContextMenu={onCellContextMenu}
                  onEditChange={onEditChange}
                  onEditCommit={onEditCommit}
                  onEditCancel={onEditCancel}
                  onDeleteRow={onDeleteRow}
                  onToggleSelectRow={onToggleSelectRow}
                  onKeyDown={onKeyDown}
                />
              );
            })}

            {bottomPadding > 0 && <div style={{ height: bottomPadding }} />}
          </>
        )}
      </div>

      {/* ── Add Row sticky footer ────────────────────────────── */}
      {!loading && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 12px',
          borderTop: '1px solid rgba(48,54,61,0.4)',
          background: 'rgba(8,10,14,0.4)',
          minWidth: 'max-content',
          position: 'sticky',
          bottom: 0,
          zIndex: 5,
        }}>
          <button
            onClick={onAddRow}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 5,
              background: 'rgba(47,129,247,0.08)',
              border: '1px solid rgba(47,129,247,0.25)',
              color: 'var(--accent)',
              fontSize: '0.78rem', fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Row
          </button>
        </div>
      )}
    </div>
  );
};

export default SpreadsheetGrid;
