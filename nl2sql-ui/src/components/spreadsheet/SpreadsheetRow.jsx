import React, { memo, useState } from 'react';
import SpreadsheetCell from './SpreadsheetCell';

const DEFAULT_COL_WIDTH = 160;

/**
 * SpreadsheetRow
 * Renders one data row with virtualization, multi-selection, edit support, column freezing, and right-click context menu.
 */
const SpreadsheetRow = memo(({
  row,
  columns,
  columnWidths,
  rowNumber,
  rowIndex,
  isEven,
  isSelected,
  isRowChecked = false,
  activeColName,
  editColName,
  editValue,
  rowErrors,
  frozenCount = 0,
  onCellClick,
  onCellDoubleClick,
  onCellContextMenu,
  onEditChange,
  onEditCommit,
  onEditCancel,
  onDeleteRow,
  onToggleSelectRow,
  onKeyDown,
  style = {},
}) => {
  const [hovered, setHovered] = useState(false);

  const isDirtyRow = Boolean(row._isDirty || row._isNew);

  const bgColor = isRowChecked
    ? 'rgba(47,129,247,0.18)'
    : isSelected
      ? 'rgba(47,129,247,0.08)'
      : isEven
        ? 'rgba(22,27,34,0.9)'
        : 'rgba(13,17,23,0.9)';

  // Compute frozen offsets
  let currentFrozenOffset = 55; // width of row gutter

  return (
    <div
      className={`ss-row ${isRowChecked ? 'ss-row-checked' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => onCellContextMenu?.(e, rowIndex, activeColName || columns[0]?.name)}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        height: 34,
        background: bgColor,
        borderBottom: '1px solid rgba(48,54,61,0.4)',
        borderLeft: isDirtyRow ? '3px solid var(--accent)' : '3px solid transparent',
        cursor: 'default',
        transition: 'background 0.08s',
        outline: isRowChecked ? '1px solid rgba(47,129,247,0.4)' : isSelected ? '1px solid rgba(47,129,247,0.25)' : 'none',
        outlineOffset: -1,
        position: 'relative',
        ...style,
      }}
    >
      {/* Row selection & number gutter (Sticky on horizontal scroll) */}
      <div
        onClick={(e) => onToggleSelectRow?.(rowIndex, e)}
        title="Click to select row (Shift+Click for range)"
        style={{
          width: 55,
          minWidth: 55,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRight: '1px solid rgba(48,54,61,0.6)',
          flexShrink: 0,
          fontSize: '0.72rem',
          fontFamily: 'var(--font-mono)',
          color: isRowChecked || isSelected ? 'var(--accent)' : 'rgba(139,148,158,0.5)',
          background: isRowChecked ? 'rgba(47,129,247,0.15)' : isSelected ? 'rgba(47,129,247,0.06)' : 'rgba(8,10,14,0.6)',
          fontWeight: isRowChecked || isSelected ? 600 : 400,
          userSelect: 'none',
          cursor: 'pointer',
          gap: 4,
          position: 'sticky',
          left: 0,
          zIndex: 8,
        }}
      >
        <input
          type="checkbox"
          checked={isRowChecked}
          onChange={(e) => onToggleSelectRow?.(rowIndex, e)}
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: 'pointer', accentColor: 'var(--accent)', margin: 0 }}
        />

        {hovered ? (
          <button
            title="Delete row"
            onClick={(e) => { e.stopPropagation(); onDeleteRow?.(rowIndex); }}
            style={{
              background: 'rgba(248,81,73,0.12)',
              border: '1px solid rgba(248,81,73,0.3)',
              borderRadius: 3,
              color: '#f85149',
              fontSize: '0.65rem',
              padding: '1px 3px',
              cursor: 'pointer',
              lineHeight: 1.2,
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        ) : (
          <span>{row._isNew ? '★' : rowNumber}</span>
        )}
      </div>

      {columns.map((col, colIdx) => {
        const isEditingThisCell = editColName === col.name;
        const isActiveThisCell  = !editColName && activeColName === col.name;
        const isFrozen          = colIdx < frozenCount;

        const colWidth = columnWidths[col.name] || DEFAULT_COL_WIDTH;
        const frozenLeft = isFrozen ? currentFrozenOffset : undefined;
        if (isFrozen) currentFrozenOffset += colWidth;

        return (
          <div
            key={col.name}
            onContextMenu={(e) => {
              e.stopPropagation();
              onCellContextMenu?.(e, rowIndex, col.name);
            }}
            style={{
              position: isFrozen ? 'sticky' : 'relative',
              left: isFrozen ? frozenLeft : undefined,
              zIndex: isFrozen ? 7 : 1,
              background: isFrozen ? bgColor : 'transparent',
            }}
          >
            <SpreadsheetCell
              value={row[col.name]}
              editorDescriptor={col.editorDescriptor}
              width={colWidth}
              isActive={isActiveThisCell}
              isEditing={isEditingThisCell}
              editValue={isEditingThisCell ? editValue : undefined}
              isDirty={isDirtyRow}
              errorMessage={rowErrors?.[col.name] ?? null}
              onCellClick={() => onCellClick?.(rowIndex, col.name)}
              onCellDoubleClick={() => onCellDoubleClick?.(rowIndex, col.name)}
              onEditChange={onEditChange}
              onEditCommit={onEditCommit}
              onEditCancel={onEditCancel}
              onKeyDown={onKeyDown}
            />
          </div>
        );
      })}
    </div>
  );
}, (prev, next) => {
  return (
    prev.row === next.row &&
    prev.columns === next.columns &&
    prev.columnWidths === next.columnWidths &&
    prev.rowNumber === next.rowNumber &&
    prev.rowIndex === next.rowIndex &&
    prev.isEven === next.isEven &&
    prev.isSelected === next.isSelected &&
    prev.isRowChecked === next.isRowChecked &&
    prev.activeColName === next.activeColName &&
    prev.editColName === next.editColName &&
    prev.editValue === next.editValue &&
    prev.rowErrors === next.rowErrors &&
    prev.frozenCount === next.frozenCount &&
    prev.style === next.style
  );
});

SpreadsheetRow.displayName = 'SpreadsheetRow';

export default SpreadsheetRow;
