import React from 'react';
import SpreadsheetCell from './SpreadsheetCell';

/**
 * EmptyRow
 * A skeleton placeholder row shown while data is loading.
 * Props:
 *   columns      – array of column definitions
 *   columnWidths – map of col name → px width
 *   rowIndex     – for staggered animation delay
 */
const EmptyRow = ({ columns, columnWidths, rowIndex = 0 }) => {
  const delay = rowIndex * 60;
  return (
    <div
      className="ss-row ss-row-skeleton"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        height: 46,
        minWidth: 'max-content',
        boxSizing: 'border-box',
        animationDelay: `${delay}ms`,
        borderBottom: '1px solid rgba(48,54,61,0.4)',
      }}
    >
      {/* Row number gutter */}
      <div style={{
        width: 52,
        minWidth: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRight: '1px solid rgba(48,54,61,0.6)',
        flexShrink: 0,
      }}>
        <div className="ss-skeleton" style={{ width: 20, height: 10, borderRadius: 3 }} />
      </div>

      {columns.map((col) => (
        <SpreadsheetCell
          key={col.name}
          value={null}
          loading
          width={columnWidths[col.name]}
          editorDescriptor={col.editorDescriptor}
        />
      ))}
    </div>
  );
};

export default EmptyRow;
