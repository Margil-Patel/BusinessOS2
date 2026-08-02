import React, { useRef, useCallback, useState, useEffect } from 'react';
import SpreadsheetRow from './SpreadsheetRow';
import EmptyRow from './EmptyRow';

const SKELETON_ROW_COUNT = 10;
const MIN_COL_WIDTH = 80;
const DEFAULT_COL_WIDTH = 160;
const ROW_HEIGHT = 46;
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
  const [hoveredHeaderCol, setHoveredHeaderCol] = useState(null);

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
      className="ss-grid-container custom-scrollbar"
      tabIndex={0}
      onScroll={handleScroll}
      onKeyDown={onKeyDown}
      style={{
        flex: 1,
        overflowX: 'auto',
        overflowY: 'auto',
        position: 'relative',
        outline: 'none',
        background: '#0d1117'
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
          background: '#161b22',
          borderBottom: '1px solid var(--border-color)',
          borderLeft: '3px solid transparent',
          boxSizing: 'border-box',
          minWidth: 'max-content',
          height: 42
        }}
      >
        {/* Row number / Master Select All header */}
        <div style={{
          width: 55,
          minWidth: 55,
          boxSizing: 'border-box',
          height: 42,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRight: '1px solid var(--border-color)',
          flexShrink: 0,
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          background: '#0d1117',
          fontWeight: 600,
          userSelect: 'none',
          gap: 6,
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
        </div>

        {columns.map((col, colIdx) => {
          const width = columnWidths[col.name] || DEFAULT_COL_WIDTH;
          const isSorted = sortConfig.colName === col.name;
          const isFrozen = colIdx < frozenCount;

          const frozenLeft = isFrozen ? currentHeaderFrozenOffset : undefined;
          if (isFrozen) currentHeaderFrozenOffset += width;

          const typeLabel = (col.data_type || col.type || 'TEXT').toUpperCase();

          return (
            <div
              key={col.name}
              className="ss-header-cell"
              onClick={() => onHeaderSortClick?.(col.name)}
              onMouseEnter={() => setHoveredHeaderCol(col.name)}
              onMouseLeave={() => setHoveredHeaderCol(null)}
              title={`Column: ${col.name} | Data Type: ${typeLabel}`}
              style={{
                width, minWidth: width, height: 42,
                boxSizing: 'border-box',
                display: 'flex', alignItems: 'center',
                padding: '0 12px',
                borderRight: '1px solid var(--border-color)',
                flexShrink: 0, gap: 6, userSelect: 'none',
                cursor: 'pointer',
                position: isFrozen ? 'sticky' : 'relative',
                left: isFrozen ? frozenLeft : undefined,
                zIndex: isFrozen ? 16 : 2,
                background: isFrozen ? '#161b22' : 'transparent',
              }}
            >
              {/* Datatype Hover Tooltip Popup */}
              {hoveredHeaderCol === col.name && (
                <div style={{
                  position: 'absolute',
                  top: -34,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#1c2128',
                  border: '1px solid #388bfd',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: 'white',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 6px 16px rgba(0,0,0,0.6)',
                  zIndex: 999,
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Data Type:</span>
                  <span style={{ color: '#58a6ff', fontFamily: 'var(--font-mono)' }}>{typeLabel}</span>
                </div>
              )}

              {col.is_primary_key && (
                <span title="Primary Key" style={{ fontSize: '0.85rem', flexShrink: 0 }}>🔑</span>
              )}

              <span style={{
                fontSize: '0.82rem', fontWeight: 600,
                color: 'white',
                textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap',
                flex: 1,
              }}>
                {col.name}
              </span>

              {/* Sleek Blue Sort Arrow Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onHeaderSortClick?.(col.name);
                }}
                title={
                  isSorted
                    ? `Sorted ${sortConfig.direction.toUpperCase()} - Click to toggle row order`
                    : `Click to change row order by ${col.name}`
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  border: isSorted ? '1px solid rgba(56, 139, 253, 0.6)' : '1px solid rgba(56, 139, 253, 0.25)',
                  background: isSorted ? 'rgba(56, 139, 253, 0.3)' : 'rgba(56, 139, 253, 0.1)',
                  color: '#388bfd',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                  marginLeft: 4,
                  padding: 0,
                }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: isSorted && sortConfig.direction === 'asc' ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                  }}
                >
                  <path d="M2 4l4 4 4-4" />
                </svg>
              </button>

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
    </div>
  );
};

export default SpreadsheetGrid;
