import React, { useState, useRef } from 'react';

/**
 * SpreadsheetToolbar
 * Modern SaaS Spreadsheet Action Bar matching Supabase / Airtable design.
 */
const SpreadsheetToolbar = ({
  tables = [],
  selectedFqn = '',
  onSelectTable,
  totalCount = 0,
  selectedRowCount = 0,
  onAddRow,
  onDeleteSelectedRows,
  onDuplicateRow,
  onFilter,
  onSort,
  columns = [],
  hiddenColumns = new Set(),
  onToggleColumnVisibility,
  onExportCsv,
  onImportCsv,
  onRefresh,
  loading = false,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  pageSize = 50,
  onPageSizeChange,
  searchQuery = '',
  onSearchChange,
  isDirty = false,
  dirtyCount = 0,
  onSave,
}) => {
  const [showColMenu, setShowColMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFunctionsMenu, setShowFunctionsMenu] = useState(false);
  const fileInputRef = useRef(null);

  const btnStyle = (isPrimary = false, disabled = false) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: '0.8rem',
    fontWeight: isPrimary ? 600 : 500,
    border: isPrimary ? 'none' : '1px solid var(--border-color)',
    background: disabled
      ? 'rgba(255,255,255,0.02)'
      : isPrimary
      ? '#388bfd'
      : 'rgba(22, 27, 34, 0.8)',
    color: disabled
      ? 'rgba(139,148,158,0.4)'
      : isPrimary
      ? '#ffffff'
      : 'var(--text-primary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: isPrimary ? '0 2px 8px rgba(56, 139, 253, 0.3)' : 'none',
  });

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      onImportCsv?.(evt.target?.result);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, borderBottom: '1px solid var(--border-color)', background: '#0d1117' }}>
      
      {/* ── 1. COMPACT TOP HEADER (56px) ───────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-color)',
        height: 56,
        background: '#161b22',
      }}>
        {/* Left: App Title + Table Selector + Row Count Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Data Viewer</span>
            <span style={{ color: 'var(--border-color)' }}>/</span>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(22, 27, 34, 0.9)',
            border: '1px solid var(--border-color)',
            padding: '5px 12px',
            borderRadius: 8,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#388bfd" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M3 9h18M3 15h18M9 3v18"/>
            </svg>

            {tables && tables.length > 0 ? (
              <select
                value={selectedFqn}
                onChange={(e) => onSelectTable?.(e.target.value)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {tables.map((t) => (
                  <option key={t.qualified_name} value={t.qualified_name} style={{ background: '#161b22', color: 'white' }}>
                    {t.qualified_name}
                  </option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'white' }}>
                {selectedFqn || 'Select Table'}
              </span>
            )}

            <span style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              background: 'rgba(255,255,255,0.06)',
              padding: '2px 8px',
              borderRadius: 12,
            }}>
              {totalCount} rows
            </span>
          </div>
        </div>

        {/* Center/Right: Search Bar + Auto Saved status + Functions dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Large Search Bar with Ctrl+K shortcut */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5"
              style={{ position: 'absolute', left: 10 }}
            >
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search records, values or IDs..."
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              style={{
                background: '#0d1117',
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                padding: '6px 70px 6px 32px',
                color: 'white',
                fontSize: '0.82rem',
                outline: 'none',
                width: 260,
                transition: 'all 0.2s ease',
              }}
            />
            <span style={{
              position: 'absolute',
              right: 8,
              fontSize: '0.68rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              background: 'rgba(255,255,255,0.08)',
              padding: '2px 5px',
              borderRadius: 4,
              fontFamily: 'var(--font-mono)',
            }}>
              Ctrl+K
            </span>
          </div>

          {/* Auto Saved Indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.78rem',
            fontWeight: 600,
            color: isDirty ? '#e3b341' : '#3fb950',
            background: isDirty ? 'rgba(227,179,65,0.1)' : 'rgba(63,185,80,0.1)',
            border: isDirty ? '1px solid rgba(227,179,65,0.3)' : '1px solid rgba(63,185,80,0.3)',
            padding: '4px 10px',
            borderRadius: 16,
          }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: isDirty ? '#e3b341' : '#3fb950',
              boxShadow: isDirty ? '0 0 6px #e3b341' : '0 0 6px #3fb950',
            }} />
            {isDirty ? `${dirtyCount} Unsaved` : 'Auto Saved'}
          </div>

          {/* Functions dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowFunctionsMenu((prev) => !prev)}
              style={btnStyle(false)}
            >
              <span>⚡</span>
              <span>Functions</span>
              <span style={{ fontSize: '0.65rem' }}>▼</span>
            </button>
            {showFunctionsMenu && (
              <div style={{
                position: 'absolute', top: 36, right: 0, zIndex: 99,
                background: '#161b22', border: '1px solid var(--border-color)',
                borderRadius: 8, padding: 6, width: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}>
                <div 
                  onClick={() => { onSave?.(); setShowFunctionsMenu(false); }}
                  style={{ padding: '6px 10px', fontSize: '0.8rem', color: 'white', cursor: 'pointer', borderRadius: 4 }}
                  onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={(e) => e.target.style.background = 'transparent'}
                >
                  💾 Commit Changes
                </div>
                <div 
                  onClick={() => { onRefresh?.(); setShowFunctionsMenu(false); }}
                  style={{ padding: '6px 10px', fontSize: '0.8rem', color: 'white', cursor: 'pointer', borderRadius: 4 }}
                  onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={(e) => e.target.style.background = 'transparent'}
                >
                  🔄 Re-index Schema
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. ACTION TOOLBAR (44px) ───────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: 44,
        background: '#0d1117',
      }}>
        {/* Left Side Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Add Row Primary Button */}
          <button onClick={onAddRow} style={btnStyle(true)}>
            <span>+</span> Add Row <span>▼</span>
          </button>

          {/* Delete Row */}
          <button 
            onClick={onDeleteSelectedRows} 
            style={btnStyle(false, selectedRowCount === 0)}
            disabled={selectedRowCount === 0}
          >
            <span>🗑</span> Delete {selectedRowCount > 0 ? `(${selectedRowCount})` : ''}
          </button>

          {/* Duplicate Row */}
          <button 
            onClick={onDuplicateRow}
            style={btnStyle(false, selectedRowCount === 0)}
            disabled={selectedRowCount === 0}
          >
            <span>📋</span> Duplicate
          </button>

          {/* Filter */}
          <button onClick={onFilter} style={btnStyle(false)}>
            <span>🔍</span> Filter
          </button>

          {/* Sort */}
          <button onClick={onSort} style={btnStyle(false)}>
            <span>⇅</span> Sort
          </button>

          {/* Columns Popover */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowColMenu((prev) => !prev)} style={btnStyle(false)}>
              <span>📊</span> Columns {hiddenColumns.size > 0 ? `(${columns.length - hiddenColumns.size})` : ''}
            </button>
            {showColMenu && (
              <div style={{
                position: 'absolute', top: 36, left: 0, zIndex: 99,
                background: '#161b22', border: '1px solid var(--border-color)',
                borderRadius: 8, padding: 8, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                  Toggle Visible Columns
                </div>
                {columns.map((col) => (
                  <label key={col.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', padding: '4px 0', cursor: 'pointer', color: 'white' }}>
                    <input
                      type="checkbox"
                      checked={!hiddenColumns.has(col.name)}
                      onChange={() => onToggleColumnVisibility?.(col.name)}
                      style={{ accentColor: '#388bfd' }}
                    />
                    {col.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side Tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Export Dropdown */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowExportMenu((prev) => !prev)} style={btnStyle(false)}>
              <span>📤</span> Export <span>▼</span>
            </button>
            {showExportMenu && (
              <div style={{
                position: 'absolute', top: 36, right: 0, zIndex: 99,
                background: '#161b22', border: '1px solid var(--border-color)',
                borderRadius: 8, padding: 6, width: 140, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}>
                <div 
                  onClick={() => { onExportCsv?.(); setShowExportMenu(false); }}
                  style={{ padding: '6px 10px', fontSize: '0.8rem', color: 'white', cursor: 'pointer', borderRadius: 4 }}
                  onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={(e) => e.target.style.background = 'transparent'}
                >
                  Export CSV
                </div>
              </div>
            )}
          </div>

          {/* Import CSV */}
          <button onClick={() => fileInputRef.current?.click()} style={btnStyle(false)}>
            <span>📥</span> Import
          </button>
          <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />

          {/* Refresh */}
          <button onClick={onRefresh} disabled={loading} style={btnStyle(false, loading)}>
            <span style={{ display: 'inline-block', transform: loading ? 'rotate(360deg)' : 'none', transition: 'transform 0.4s' }}>🔄</span> Refresh
          </button>

          {/* Undo */}
          <button onClick={onUndo} disabled={!canUndo} style={btnStyle(false, !canUndo)} title="Undo">
            <span>↩</span>
          </button>

          {/* Redo */}
          <button onClick={onRedo} disabled={!canRedo} style={btnStyle(false, !canRedo)} title="Redo">
            <span>↪</span>
          </button>

          {/* Rows Per Page Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 6, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
              style={{
                background: '#161b22',
                border: '1px solid var(--border-color)',
                color: 'white',
                fontSize: '0.8rem',
                padding: '4px 8px',
                borderRadius: 6,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SpreadsheetToolbar;
