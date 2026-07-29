/**
 * spreadsheet/csvUtils.js
 * ───────────────────────
 * CSV Export & Import utilities for Business OS Data Editor.
 */

/**
 * Escape a string or value for CSV output.
 */
const escapeCsvCell = (val) => {
  if (val === null || val === undefined) return '';
  let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Export rows array to CSV and trigger browser download.
 *
 * @param {Array} rows       - array of row objects
 * @param {Array} columns    - array of column objects { name }
 * @param {string} filename  - name of the downloaded file
 */
export function exportToCsv(rows, columns, filename = 'export.csv') {
  if (!columns || columns.length === 0) return;

  const headerRow = columns.map((c) => escapeCsvCell(c.name)).join(',');
  const dataRows  = rows.map((row) =>
    columns.map((c) => escapeCsvCell(row[c.name])).join(',')
  );

  const csvContent = [headerRow, ...dataRows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parse a CSV string into row objects matching the table's column definitions.
 *
 * @param {string} csvText  - raw CSV text from file input
 * @param {Array} columns   - array of column definitions
 * @returns {Array} array of clean row objects ready for spreadsheet insertion
 */
export function parseCsv(csvText, columns) {
  if (!csvText || !columns) return [];

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Robust line splitter handling quotes
  const parseLine = (line) => {
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && (i === 0 || line[i-1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cells.push(cur.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        cur = '';
      } else {
        cur += char;
      }
    }
    cells.push(cur.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    return cells;
  };

  const firstLineCells = parseLine(lines[0]);

  // Check if first line matches column headers
  const colNameMap = {};
  columns.forEach((col) => {
    colNameMap[col.name.toLowerCase()] = col.name;
  });

  const headerIndices = [];
  let isHeaderRow = false;

  firstLineCells.forEach((cell, idx) => {
    const matched = colNameMap[cell.toLowerCase()];
    if (matched) {
      isHeaderRow = true;
      headerIndices.push({ idx, colName: matched });
    }
  });

  const startLineIdx = isHeaderRow ? 1 : 0;
  const parsedRows   = [];

  for (let i = startLineIdx; i < lines.length; i++) {
    const cells  = parseLine(lines[i]);
    const newRow = {};

    columns.forEach((col) => { newRow[col.name] = null; });

    if (isHeaderRow) {
      headerIndices.forEach(({ idx, colName }) => {
        if (cells[idx] !== undefined && cells[idx] !== '') {
          newRow[colName] = cells[idx];
        }
      });
    } else {
      columns.forEach((col, idx) => {
        if (cells[idx] !== undefined && cells[idx] !== '') {
          newRow[col.name] = cells[idx];
        }
      });
    }

    parsedRows.push(newRow);
  }

  return parsedRows;
}
