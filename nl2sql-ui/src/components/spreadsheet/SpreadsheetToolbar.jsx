import React, { useState, useRef, useEffect } from 'react';

/**
 * SpreadsheetToolbar
 * Top action bar — global search, column visibility toggle, column freeze selector, CSV import/export,
 * pagination, page size selector, undo/redo, bulk operations, refresh, validation badges, save controls.
 */
const SpreadsheetToolbar = ({
  fqn,
  totalCount       = 0,
  rowCount         = 0,
  page             = 1,
  pageSize         = 50,
  totalPages       = 1,
  loading          = false,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  activeCell,
  isDirty          = false,
  dirtyCount       = 0,
  errorCount       = 0,
  selectedRowCount = 0,
  onDeleteSelectedRows,
  canUndo          = false,
  canRedo          = false,
  onUndo,
  onRedo,
  searchQuery      = '',
  onSearchChange,
  columns          = [],
  hiddenColumns    = new Set(),
  onToggleColumnVisibility,
  frozenCount      = 0,
  onFreezeChange,
  onExportCsv,
  onImportCsv,
  saveState        = null,
  saveError        = null,
  saveStats        = null,
  onSave,
  onDismissError,
}) => {
  const [showColMenu, setShowColMenu] = useState(false);
  const fileInputRef = useRef(null);

  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, totalCount);
  const isSaving = saveState === 'saving' || saveState === 'validating';

  const btnStyle = (disabled) => ({
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '5px 10px', borderRadius: 5,
    fontSize: '0.78rem', fontWeight: 500,
    border: '1px solid var(--border-color)',
    background: disabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
    color: disabled ? 'rgba(139,148,158,0.4)' : 'var(--text-primary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s',
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
    <div
      className="ss-toolbar"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px',
        borderBottom: '1px solid var(--border-color)',
        background: 'rgba(8,10,14,0.6)',
        flexShrink: 0, flexWrap: 'wrap', minHeight: 48,
      }}
    >
      {/* ── Table name ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18M3 15h18M9 3v18"/>
        </svg>
        <span style={{ fontWeight: 600, fontSize: '0.88rem', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
          {fqn}
        </span>
      </div>

      {/* ── Search Input ───────────────────────────────────────── */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search records…"
          value={searchQuery}
          onChange={(e) => onSearchChange?.(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border-color)',
            borderRadius: 5,
            padding: '4px 10px 4px 26px',
            color: 'var(--text-primary)',
            fontSize: '0.78rem',
            outline: 'none',
            width: 150,
          }}
        />
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5"
          style={{ position: 'absolute', left: 8 }}
        >
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>

      {/* ── Column Visibility Popover ──────────────────────────── */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowColMenu((prev) => !prev)}
          style={btnStyle(false)}
          title="Toggle column visibility"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          Columns {hiddenColumns.size > 0 ? `(${columns.length - hiddenColumns.size}/${columns.length})` : ''}
        </button>

        {showColMenu && (
          <div style={{
            position: 'absolute', top: 32, left: 0, zIndex: 99,
            background: '#161b22', border: '1px solid var(--border-color)',
            borderRadius: 6, padding: 8, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
              Visible Columns
            </div>
            {columns.map((col) => (
              <label key={col.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', padding: '3px 0', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!hiddenColumns.has(col.name)}
                  onChange={() => onToggleColumnVisibility?.(col.name)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span style={{ color: hiddenColumns.has(col.name) ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                  {col.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* ── Freeze Columns Selector ────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
        <span>Freeze:</span>
        <select
          value={frozenCount}
          onChange={(e) => onFreezeChange?.(Number(e.target.value))}
          style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)',
            color: 'var(--text-primary)', fontSize: '0.76rem', padding: '2px 6px', borderRadius: 4, outline: 'none', cursor: 'pointer',
          }}
        >
          <option value={0}>None</option>
          <option value={1}>1 Col</option>
          <option value={2}>2 Cols</option>
          <option value={3}>3 Cols</option>
        </select>
      </div>

      {/* ── CSV Export / Import ────────────────────────────────── */}
      <button onClick={onExportCsv} style={btnStyle(false)} title="Export rows to CSV">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Export CSV
      </button>

      <button onClick={() => fileInputRef.current?.click()} style={btnStyle(false)} title="Import rows from CSV file">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        Import CSV
      </button>
      <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />

      {/* ── Undo / Redo controls ──────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button onClick={onUndo} disabled={!canUndo || loading || isSaving} style={btnStyle(!canUndo || loading || isSaving)} title="Undo (Ctrl+Z)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
          </svg>
          Undo
        </button>
        <button onClick={onRedo} disabled={!canRedo || loading || isSaving} style={btnStyle(!canRedo || loading || isSaving)} title="Redo (Ctrl+Y)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>
          </svg>
          Redo
        </button>
      </div>

      {/* ── Multi-row Delete Button ───────────────────────────── */}
      {selectedRowCount > 0 && (
        <button
          onClick={onDeleteSelectedRows}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 5,
            background: 'rgba(248,81,73,0.12)', border: '1px solid rgba(248,81,73,0.35)',
            color: '#f85149', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
          }}
          title="Delete selected row(s) (Delete key)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Delete ({selectedRowCount})
        </button>
      )}

      {/* ── Spacer ──────────────────────────────────────────────── */}
      <div style={{ flex: 1 }} />

      {/* ── Validation error badge ──────────────────────────────── */}
      {errorCount > 0 && saveState !== 'saving' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: '0.75rem', color: '#f85149', background: 'rgba(248,81,73,0.08)',
          border: '1px solid rgba(248,81,73,0.3)', borderRadius: 5, padding: '3px 8px', fontFamily: 'var(--font-mono)',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {errorCount} error{errorCount !== 1 ? 's' : ''} — fix before saving
        </div>
      )}

      {/* ── Saving spinner ──────────────────────────────────────── */}
      {isSaving && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: '0.75rem', color: 'var(--accent)', background: 'rgba(47,129,247,0.08)',
          border: '1px solid rgba(47,129,247,0.3)', borderRadius: 5, padding: '3px 8px', fontFamily: 'var(--font-mono)',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
            <circle cx="12" cy="12" r="10" strokeOpacity="0.2"/><path d="M12 2a10 10 0 0 1 10 10" stroke="var(--accent)"/>
          </svg>
          {saveState === 'validating' ? 'Validating…' : 'Saving…'}
        </div>
      )}

      {/* ── Save success badge ──────────────────────────────────── */}
      {saveState === 'saved' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: '0.75rem', color: '#3fb950', background: 'rgba(63,185,80,0.08)',
          border: '1px solid rgba(63,185,80,0.3)', borderRadius: 5, padding: '3px 8px', fontFamily: 'var(--font-mono)',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {saveStats
            ? `Saved — ${[
                saveStats.inserted ? `${saveStats.inserted} inserted` : null,
                saveStats.updated  ? `${saveStats.updated} updated`  : null,
                saveStats.deleted  ? `${saveStats.deleted} deleted`  : null,
              ].filter(Boolean).join(', ')}`
            : 'Saved successfully'}
        </div>
      )}

      {/* ── Save error banner ───────────────────────────────────── */}
      {saveState === 'error' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: '0.75rem', color: '#f85149', background: 'rgba(248,81,73,0.08)',
          border: '1px solid rgba(248,81,73,0.3)', borderRadius: 5, padding: '3px 8px', fontFamily: 'var(--font-mono)', maxWidth: 340,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {saveError || 'Save failed'}
          </span>
          <button onClick={onDismissError} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: '0.9rem' }}>✕</button>
        </div>
      )}

      {/* ── Dirty indicator ─────────────────────────────────────── */}
      {isDirty && !isSaving && saveState !== 'saved' && (
        <div style={{
          fontSize: '0.75rem', color: '#e3b341', background: 'rgba(227,179,65,0.08)',
          border: '1px solid rgba(227,179,65,0.3)', borderRadius: 5, padding: '3px 8px', fontFamily: 'var(--font-mono)',
        }}>
          ● {dirtyCount} unsaved
        </div>
      )}

      {/* ── Page Size Selector ──────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
        <span>Rows:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
          disabled={loading || isSaving}
          style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)',
            color: 'var(--text-primary)', fontSize: '0.76rem', padding: '2px 6px', borderRadius: 4, outline: 'none', cursor: 'pointer',
          }}
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={250}>250</option>
          <option value={500}>500</option>
          <option value={1000}>1000</option>
        </select>
      </div>

      {/* ── Pagination ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <button style={btnStyle(page <= 1 || loading)} disabled={page <= 1 || loading} onClick={() => onPageChange?.(1)} title="First page">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
        </button>
        <button style={btnStyle(page <= 1 || loading)} disabled={page <= 1 || loading} onClick={() => onPageChange?.(page - 1)} title="Previous page">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', minWidth: 65, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
          {loading ? '…' : `${page} / ${totalPages}`}
        </span>
        <button style={btnStyle(page >= totalPages || loading)} disabled={page >= totalPages || loading} onClick={() => onPageChange?.(page + 1)} title="Next page">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button style={btnStyle(page >= totalPages || loading)} disabled={page >= totalPages || loading} onClick={() => onPageChange?.(totalPages)} title="Last page">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
        </button>
      </div>

      {/* ── Refresh ─────────────────────────────────────────────── */}
      <button
        style={{ ...btnStyle(loading || isSaving), color: (loading || isSaving) ? 'rgba(139,148,158,0.4)' : 'var(--accent)', borderColor: (loading || isSaving) ? 'var(--border-color)' : 'rgba(47,129,247,0.3)', background: (loading || isSaving) ? 'rgba(255,255,255,0.02)' : 'rgba(47,129,247,0.06)' }}
        disabled={loading || isSaving}
        onClick={onRefresh}
        title="Refresh data"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transition: 'transform 0.4s', transform: loading ? 'rotate(360deg)' : 'none' }}>
          <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        {loading ? 'Loading' : 'Refresh'}
      </button>

      {/* ── Save button ─────────────────────────────────────────── */}
      {(isDirty || saveState === 'invalid') && !isSaving && saveState !== 'saved' && (
        <button
          onClick={onSave}
          disabled={isSaving}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 5,
            background: errorCount > 0 ? 'rgba(248,81,73,0.08)' : 'rgba(47,129,247,0.15)',
            border: errorCount > 0 ? '1px solid rgba(248,81,73,0.4)' : '1px solid rgba(47,129,247,0.4)',
            color: errorCount > 0 ? '#f85149' : 'var(--accent)',
            fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
          }}
          title={errorCount > 0 ? `${errorCount} validation error(s) must be fixed first` : 'Save all changes to database'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          {errorCount > 0 ? `${errorCount} Error${errorCount !== 1 ? 's' : ''}` : 'Save'}
        </button>
      )}
    </div>
  );
};

export default SpreadsheetToolbar;
