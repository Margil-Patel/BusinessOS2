import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import SpreadsheetToolbar from './SpreadsheetToolbar';
import SpreadsheetGrid from './SpreadsheetGrid';
import ContextMenu from './ContextMenu';
import { enrichColumns } from './pgTypeToEditor';
import { validateDirtyRows } from './validateRows';
import { exportToCsv, parseCsv } from './csvUtils';
import { api } from '../../services/api';

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_COL_WIDTH = 160;

let _rowIdSeq = 0;
const nextRowId = () => `row_${++_rowIdSeq}`;

/**
 * Strip internal metadata fields before sending to the API.
 */
const stripMeta = (row) => {
  // eslint-disable-next-line no-unused-vars
  const { _rowId, _isNew, _isDirty, _originalRow, ...clean } = row;
  return clean;
};

/**
 * SpreadsheetPage
 * Audit-Ready Business OS Professional Data Editor Orchestrator.
 */
const SpreadsheetPage = ({
  fqn,
  fetchSchema,
  fetchRows,
  pageSize: pageSizeProp = DEFAULT_PAGE_SIZE,
  style = {},
}) => {
  // ── Remote data ──────────────────────────────────────────────────────────
  const [schema,        setSchema]        = useState(null);
  const [rows,          setRows]          = useState([]);
  const [totalCount,    setTotalCount]    = useState(0);
  const [page,          setPage]          = useState(1);
  const [pageSize,      setPageSize]      = useState(pageSizeProp);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [loadingRows,   setLoadingRows]   = useState(false);
  const [fetchError,    setFetchError]    = useState(null);
  const [columnWidths,  setColumnWidths]  = useState({});

  // ── Local edit state ─────────────────────────────────────────────────────
  const [localRows,    setLocalRows]    = useState([]);
  const [deletedRows,  setDeletedRows]  = useState([]);
  const [activeCell,   setActiveCell]   = useState(null);
  const [editingCell,  setEditingCell]  = useState(null);
  const [editValue,    setEditValue]    = useState(null);
  const [isDirty,      setIsDirty]      = useState(false);

  // ── Search, Sort, Filter, Freeze & Column Visibility state ──────────────
  const [searchQuery,   setSearchQuery]   = useState('');
  const [sortConfig,    setSortConfig]    = useState({ colName: null, direction: 'asc' });
  const [hiddenColumns, setHiddenColumns] = useState(new Set());
  const [frozenCount,   setFrozenCount]   = useState(0);

  // ── Multi-row Selection state ────────────────────────────────────────────
  const [checkedRowIndexes, setCheckedRowIndexes] = useState(new Set());
  const [lastSelectedRowIndex, setLastSelectedRowIndex] = useState(null);

  // ── Undo / Redo history state ────────────────────────────────────────────
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // ── Context Menu & Notification state ─────────────────────────────────────
  const [contextMenu,  setContextMenu]  = useState(null); // { x, y, rowIndex, colName }
  const [notification, setNotification] = useState(null); // { type, message }
  const [hasSavedDraft, setHasSavedDraft] = useState(false);

  // ── Validation & Save state ──────────────────────────────────────────────
  const [validationErrors, setValidationErrors] = useState({});
  const [saveState,  setSaveState]  = useState(null);
  const [saveError,  setSaveError]  = useState(null);
  const [saveStats,  setSaveStats]  = useState(null);

  const gridRef  = useRef(null);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const allColumns = schema?.columns ?? [];

  // Filtered columns based on hidden state
  const visibleColumns = useMemo(() => {
    return allColumns.filter((col) => !hiddenColumns.has(col.name));
  }, [allColumns, hiddenColumns]);

  // Helper to show temporary toast notification
  const showToast = useCallback((message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // Helper to record history before state mutations
  const pushHistory = useCallback((currentLocalRows, currentDeletedRows) => {
    setUndoStack((prev) => [...prev, { localRows: currentLocalRows, deletedRows: currentDeletedRows }]);
    setRedoStack([]);
  }, []);

  // ── Unsaved changes browser warning ──────────────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes in the spreadsheet. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // ── Draft auto-save to localStorage ──────────────────────────────────────
  useEffect(() => {
    if (!fqn || !isDirty || localRows.length === 0) return;
    const draftKey = `bus_os_draft_${fqn}`;
    const timer = setTimeout(() => {
      try {
        const draftData = {
          localRows: localRows.filter((r) => r._isDirty || r._isNew).map(stripMeta),
          timestamp: new Date().toISOString(),
        };
        localStorage.setItem(draftKey, JSON.stringify(draftData));
      } catch { /* storage full */ }
    }, 1000);
    return () => clearTimeout(timer);
  }, [fqn, isDirty, localRows]);

  // Check for saved draft on table load
  useEffect(() => {
    if (!fqn) return;
    const draftKey = `bus_os_draft_${fqn}`;
    const saved = localStorage.getItem(draftKey);
    if (saved) setHasSavedDraft(true);
  }, [fqn]);

  const handleRestoreDraft = useCallback(() => {
    if (!fqn) return;
    const draftKey = `bus_os_draft_${fqn}`;
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || '{}');
      if (saved.localRows && Array.from(saved.localRows).length > 0) {
        pushHistory(localRows, deletedRows);
        const restoredNewRows = saved.localRows.map((r) => ({
          ...r,
          _rowId: nextRowId(),
          _isNew: true,
          _isDirty: true,
        }));
        setLocalRows((prev) => [...restoredNewRows, ...prev]);
        setIsDirty(true);
        showToast('Restored unsaved draft records!', 'success');
      }
    } catch { showToast('Failed to restore draft', 'error'); }
    setHasSavedDraft(false);
    localStorage.removeItem(draftKey);
  }, [fqn, localRows, deletedRows, pushHistory, showToast]);

  const handleDismissDraft = useCallback(() => {
    if (!fqn) return;
    localStorage.removeItem(`bus_os_draft_${fqn}`);
    setHasSavedDraft(false);
  }, [fqn]);

  // ── Schema fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!fqn || !fetchSchema) return;
    let cancelled = false;
    const load = async () => {
      setLoadingSchema(true);
      setFetchError(null);
      setSchema(null);
      setRows([]);
      setLocalRows([]);
      setDeletedRows([]);
      setTotalCount(0);
      setPage(1);
      setActiveCell(null);
      setEditingCell(null);
      setIsDirty(false);
      setCheckedRowIndexes(new Set());
      setHiddenColumns(new Set());
      setSortConfig({ colName: null, direction: 'asc' });
      setSearchQuery('');
      setUndoStack([]);
      setRedoStack([]);
      setValidationErrors({});
      setSaveState(null);
      setColumnWidths({});
      try {
        const result = await fetchSchema(fqn);
        if (!cancelled) {
          const enriched = { ...result, columns: enrichColumns(result.columns || []) };
          setSchema(enriched);
          const widths = {};
          enriched.columns.forEach((col) => { widths[col.name] = DEFAULT_COL_WIDTH; });
          setColumnWidths(widths);
        }
      } catch (err) {
        if (!cancelled) setFetchError(`Schema error: ${err.message ?? err}`);
      } finally {
        if (!cancelled) setLoadingSchema(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [fqn, fetchSchema]);

  const [refreshSeq, setRefreshSeq] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshSeq((s) => s + 1);
  }, []);

  // ── Row fetch ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!fqn || !fetchRows || !schema) return;
    let cancelled = false;
    const load = async () => {
      setLoadingRows(true);
      setFetchError(null);
      try {
        const result = await fetchRows(fqn, page, pageSize);
        if (!cancelled) {
          setRows(result.rows ?? []);
          setTotalCount(result.total_count ?? 0);
        }
      } catch (err) {
        if (!cancelled) setFetchError(`Data error: ${err.message ?? err}`);
      } finally {
        if (!cancelled) setLoadingRows(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [fqn, fetchRows, schema, page, pageSize, refreshSeq]);

  // ── Sync fetched rows → localRows ────────────────────────────────────────
  useEffect(() => {
    setLocalRows(
      rows.map((r) => ({
        ...r,
        _rowId: nextRowId(),
        _isNew: false,
        _isDirty: false,
        _originalRow: { ...r },
      }))
    );
    setActiveCell(null);
    setEditingCell(null);
    setEditValue(null);
    setIsDirty(false);
    setDeletedRows([]);
    setCheckedRowIndexes(new Set());
    setUndoStack([]);
    setRedoStack([]);
    setValidationErrors({});
    setSaveState(null);
  }, [rows]);

  const valuesEqual = (a, b) => {
    if (a === b) return true;
    if ((a === null || a === undefined || a === '') && (b === null || b === undefined || b === '')) return true;
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
    if (typeof a === 'object' && typeof b === 'object') {
      try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
    }
    return String(a) === String(b);
  };

  const applyCellChange = useCallback((rowsList, targetRowIndex, colName, newVal, targetRowId = null) => {
    return rowsList.map((row, i) => {
      const matches = targetRowId ? row._rowId === targetRowId : i === targetRowIndex;
      if (!matches) return row;
      const updatedRow = { ...row, [colName]: newVal };
      if (updatedRow._isNew) {
        return { ...updatedRow, _isDirty: true };
      }
      const orig = updatedRow._originalRow || {};
      let isModified = false;
      allColumns.forEach((c) => {
        if (!valuesEqual(updatedRow[c.name], orig[c.name])) {
          isModified = true;
        }
      });
      return { ...updatedRow, _isDirty: isModified };
    });
  }, [allColumns]);

  // ── Search & Sort processed localRows ─────────────────────────────────────
  const processedRows = useMemo(() => {
    let result = [...localRows];

    // Global Search filter
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((row) =>
        visibleColumns.some((col) => {
          const val = row[col.name];
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(q);
        })
      );
    }

    // Column Sort
    if (sortConfig.colName) {
      const { colName, direction } = sortConfig;
      const mult = direction === 'asc' ? 1 : -1;
      result.sort((a, b) => {
        const valA = a[colName];
        const valB = b[colName];
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (typeof valA === 'number' && typeof valB === 'number') {
          return (valA - valB) * mult;
        }
        return String(valA).localeCompare(String(valB)) * mult;
      });
    }

    return result;
  }, [localRows, searchQuery, sortConfig, visibleColumns]);

  // ── Column Sort Header Click ──────────────────────────────────────────────
  const handleHeaderSortClick = useCallback((colName) => {
    setSortConfig((prev) => {
      if (prev.colName === colName) {
        if (prev.direction === 'asc') return { colName, direction: 'desc' };
        return { colName: null, direction: 'asc' }; // Reset sort
      }
      return { colName, direction: 'asc' };
    });
  }, []);

  // ── Column Visibility Toggle ──────────────────────────────────────────────
  const handleToggleColumnVisibility = useCallback((colName) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(colName)) next.delete(colName);
      else next.add(colName);
      return next;
    });
  }, []);

  // ── CSV Export / Import Handlers ──────────────────────────────────────────
  const handleExportCsv = useCallback(() => {
    if (processedRows.length === 0) {
      showToast('No records to export', 'error');
      return;
    }
    const cleanRows = processedRows.map(stripMeta);
    exportToCsv(cleanRows, visibleColumns, `${fqn.replace('.', '_')}_export.csv`);
    showToast(`Exported ${processedRows.length} records to CSV`, 'success');
  }, [processedRows, visibleColumns, fqn, showToast]);

  const handleImportCsv = useCallback((csvText) => {
    try {
      const imported = parseCsv(csvText, allColumns);
      if (imported.length === 0) {
        showToast('CSV file contained no valid rows', 'error');
        return;
      }
      pushHistory(localRows, deletedRows);
      const newLocalRows = imported.map((r) => ({
        ...r,
        _rowId: nextRowId(),
        _isNew: true,
        _isDirty: true,
      }));
      setLocalRows((prev) => [...prev, ...newLocalRows]);
      setIsDirty(true);
      showToast(`Imported ${imported.length} new records from CSV!`, 'success');
    } catch (err) {
      showToast(`CSV import error: ${err.message}`, 'error');
    }
  }, [allColumns, pushHistory, localRows, deletedRows, showToast]);

  // ── Undo / Redo operations ───────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previousState = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, { localRows, deletedRows }]);

    setLocalRows(previousState.localRows);
    setDeletedRows(previousState.deletedRows);
    setIsDirty(true);
  }, [undoStack, localRows, deletedRows]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, { localRows, deletedRows }]);

    setLocalRows(nextState.localRows);
    setDeletedRows(nextState.deletedRows);
    setIsDirty(true);
  }, [redoStack, localRows, deletedRows]);

  const localRowsRef   = useRef(localRows);
  const deletedRowsRef = useRef(deletedRows);
  const editValueRef   = useRef(editValue);
  const isCommittingRef = useRef(false);

  useEffect(() => { localRowsRef.current = localRows; }, [localRows]);
  useEffect(() => { deletedRowsRef.current = deletedRows; }, [deletedRows]);

  const setEditValueSync = useCallback((val) => {
    editValueRef.current = val;
    setEditValue(val);
  }, []);

  // ── Editing core ─────────────────────────────────────────────────────────
  const commitEdit = useCallback((explicitVal = undefined) => {
    if (isCommittingRef.current) return;

    let executedCommit = false;
    setEditingCell((prevCell) => {
      if (!prevCell) return null;
      isCommittingRef.current = true;
      executedCommit = true;

      const { rowIndex, colName, rowId } = prevCell;

      // Filter out Event objects (passed by onBlur) so they never pollute cell values
      let valToCommit = editValueRef.current;
      if (
        explicitVal !== undefined &&
        !(explicitVal && typeof explicitVal === 'object' && ('nativeEvent' in explicitVal || 'target' in explicitVal || 'type' in explicitVal))
      ) {
        valToCommit = explicitVal;
      }

      pushHistory(localRowsRef.current, deletedRowsRef.current);
      setLocalRows((rowsList) => applyCellChange(rowsList, rowIndex, colName, valToCommit, rowId));
      setIsDirty(true);
      return null;
    });

    if (executedCommit) {
      setEditValueSync(null);
    }
    setTimeout(() => { isCommittingRef.current = false; }, 50);
  }, [applyCellChange, pushHistory, setEditValueSync]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValueSync(null);
    setTimeout(() => gridRef.current?.focus(), 0);
  }, [setEditValueSync]);

  const enterEditMode = useCallback((rowIndex, colName, initialChar = null) => {
    const targetRow = processedRows[rowIndex];
    const rowId = targetRow?._rowId ?? null;
    const curVal = targetRow?.[colName];
    const initialVal = initialChar !== null ? initialChar : (curVal ?? null);
    setActiveCell({ rowIndex, colName, rowId });
    setEditingCell({ rowIndex, colName, rowId });
    setEditValueSync(initialVal);
  }, [processedRows, setEditValueSync]);

  const handleCellClick = useCallback((rowIndex, colName) => {
    if (editingCell) commitEdit();
    setActiveCell({ rowIndex, colName });
    setEditingCell(null);
    setTimeout(() => gridRef.current?.focus(), 0);
  }, [editingCell, commitEdit]);

  const handleCellDoubleClick = useCallback((rowIndex, colName) => {
    enterEditMode(rowIndex, colName);
  }, [enterEditMode]);


  // ── Navigation ───────────────────────────────────────────────────────────

  const navigateCell = useCallback((rowIndex, colName, colDelta, rowDelta) => {
    const colIndex = visibleColumns.findIndex((c) => c.name === colName);
    let newColIdx  = colIndex + colDelta;
    let newRowIdx  = rowIndex + rowDelta;

    if (newColIdx < 0) { newColIdx = visibleColumns.length - 1; newRowIdx--; }
    if (newColIdx >= visibleColumns.length) { newColIdx = 0; newRowIdx++; }

    setLocalRows((rowsList) => {
      newRowIdx = Math.max(0, Math.min(newRowIdx, rowsList.length - 1));
      const newColName = visibleColumns[newColIdx]?.name;
      if (newColName) setActiveCell({ rowIndex: newRowIdx, colName: newColName });
      return rowsList;
    });
    setTimeout(() => gridRef.current?.focus(), 0);
  }, [visibleColumns]);

  // ── Multi-Row Selection & Right-Click Context Menu ───────────────────────
  const handleToggleSelectRow = useCallback((rowIndex, e) => {
    setCheckedRowIndexes((prev) => {
      const next = new Set(prev);
      if (e?.shiftKey && lastSelectedRowIndex !== null) {
        const start = Math.min(lastSelectedRowIndex, rowIndex);
        const end   = Math.max(lastSelectedRowIndex, rowIndex);
        for (let i = start; i <= end; i++) { next.add(i); }
      } else {
        if (next.has(rowIndex)) next.delete(rowIndex);
        else next.add(rowIndex);
        setLastSelectedRowIndex(rowIndex);
      }
      return next;
    });
  }, [lastSelectedRowIndex]);

  const handleToggleSelectAll = useCallback((checked) => {
    if (checked) {
      setCheckedRowIndexes(new Set(processedRows.map((_, i) => i)));
    } else {
      setCheckedRowIndexes(new Set());
    }
  }, [processedRows]);

  const handleCellContextMenu = useCallback((e, rowIndex, colName) => {
    e.preventDefault();
    setActiveCell({ rowIndex, colName });
    setContextMenu({ x: e.clientX, y: e.clientY, rowIndex, colName });
  }, []);

  // ── Row Operations & Duplication ─────────────────────────────────────────
  const handleAddRow = useCallback(() => {
    pushHistory(localRows, deletedRows);
    const blankRow = {};
    allColumns.forEach((col) => { blankRow[col.name] = null; });
    const newRow = { ...blankRow, _rowId: nextRowId(), _isNew: true, _isDirty: false };
    setLocalRows((prev) => {
      const next = [...prev, newRow];
      const newRowIndex = next.length - 1;
      const firstCol = visibleColumns[0]?.name;
      if (firstCol) {
        setActiveCell({ rowIndex: newRowIndex, colName: firstCol, rowId: newRow._rowId });
        setEditingCell({ rowIndex: newRowIndex, colName: firstCol, rowId: newRow._rowId });
        setEditValue(null);
      }
      setIsDirty(true);
      return next;
    });
  }, [allColumns, visibleColumns, pushHistory, localRows, deletedRows]);

  const handleDuplicateRow = useCallback((targetRowIndex) => {
    const idx = targetRowIndex !== undefined ? targetRowIndex : activeCell?.rowIndex;
    if (idx === undefined || !localRows[idx]) return;
    pushHistory(localRows, deletedRows);

    const sourceRow = stripMeta(localRows[idx]);
    const duplicatedRow = {
      ...sourceRow,
      _rowId: nextRowId(),
      _isNew: true,
      _isDirty: true,
    };

    setLocalRows((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, duplicatedRow);
      return next;
    });
    setIsDirty(true);
    showToast('Row duplicated!', 'success');
  }, [activeCell, localRows, deletedRows, pushHistory, showToast]);

  const handleInsertRowRelative = useCallback((targetRowIndex, position = 'below') => {
    const idx = targetRowIndex !== undefined ? targetRowIndex : activeCell?.rowIndex ?? 0;
    pushHistory(localRows, deletedRows);

    const blankRow = {};
    allColumns.forEach((col) => { blankRow[col.name] = null; });
    const newRow = { ...blankRow, _rowId: nextRowId(), _isNew: true, _isDirty: false };

    setLocalRows((prev) => {
      const next = [...prev];
      const insertAt = position === 'above' ? idx : idx + 1;
      next.splice(insertAt, 0, newRow);
      return next;
    });
    setIsDirty(true);
  }, [activeCell, allColumns, pushHistory, localRows, deletedRows]);

  const handleDeleteRow = useCallback((rowIndex) => {
    pushHistory(localRows, deletedRows);
    setLocalRows((prev) => {
      const rowToDelete = prev[rowIndex];
      if (rowToDelete && !rowToDelete._isNew) {
        setDeletedRows((dr) => [...dr, rowToDelete]);
      }
      return prev.filter((_, i) => i !== rowIndex);
    });
    if (editingCell?.rowIndex === rowIndex) { setEditingCell(null); setEditValue(null); }
    if (activeCell?.rowIndex === rowIndex) setActiveCell(null);
    setIsDirty(true);
  }, [editingCell, activeCell, pushHistory, localRows, deletedRows]);

  const handleDeleteSelectedRows = useCallback(() => {
    if (checkedRowIndexes.size === 0) return;
    pushHistory(localRows, deletedRows);

    setLocalRows((prev) => {
      const remaining = [];
      const removed = [];
      prev.forEach((row, i) => {
        if (checkedRowIndexes.has(i)) {
          if (!row._isNew) removed.push(row);
        } else {
          remaining.push(row);
        }
      });
      if (removed.length > 0) setDeletedRows((dr) => [...dr, ...removed]);
      return remaining;
    });

    setCheckedRowIndexes(new Set());
    setActiveCell(null);
    setEditingCell(null);
    setIsDirty(true);
  }, [checkedRowIndexes, localRows, deletedRows, pushHistory]);

  // ── Clipboard & Keyboard actions ─────────────────────────────────────────
  const handleCopyCell = useCallback((rowIndex, colName) => {
    const rIdx = rowIndex !== undefined ? rowIndex : activeCell?.rowIndex;
    const cName = colName || activeCell?.colName;
    if (rIdx === undefined || !cName) return;
    const val = localRows[rIdx]?.[cName];
    const text = val === null || val === undefined ? '' : String(typeof val === 'object' ? JSON.stringify(val) : val);
    navigator.clipboard?.writeText(text).catch(() => {});
  }, [localRows, activeCell]);

  const handlePasteCell = useCallback(async (rowIndex, colName) => {
    const rIdx = rowIndex !== undefined ? rowIndex : activeCell?.rowIndex;
    const cName = colName || activeCell?.colName;
    if (rIdx === undefined || !cName) return;
    try {
      const text = await navigator.clipboard.readText();
      pushHistory(localRows, deletedRows);
      setLocalRows((rowsList) => applyCellChange(rowsList, rIdx, cName, text));
      setIsDirty(true);
    } catch { /* clipboard denied */ }
  }, [activeCell, applyCellChange, pushHistory, localRows, deletedRows]);

  const handleClearCell = useCallback((rowIndex, colName) => {
    const rIdx = rowIndex !== undefined ? rowIndex : activeCell?.rowIndex;
    const cName = colName || activeCell?.colName;
    if (rIdx === undefined || !cName) return;
    pushHistory(localRows, deletedRows);
    setLocalRows((rowsList) => applyCellChange(rowsList, rIdx, cName, null));
    setIsDirty(true);
  }, [activeCell, applyCellChange, pushHistory, localRows, deletedRows]);

  // ── Global Keyboard handler ──────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    const fromInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);

    if (editingCell) {
      if (e.key === 'Escape') { cancelEdit(); e.preventDefault(); return; }
      if ((e.key === 'Tab' || e.key === 'Enter') && fromInput) {
        const { rowIndex, colName } = editingCell;
        const inputVal = e.target.value;
        commitEdit(inputVal);
        const colDelta = e.key === 'Tab' ? (e.shiftKey ? -1 : 1) : 0;
        const rowDelta = e.key === 'Enter' ? 1 : 0;
        navigateCell(rowIndex, colName, colDelta, rowDelta);
        e.preventDefault();
        return;
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      if (e.shiftKey) handleRedo(); else handleUndo();
      e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      handleRedo();
      e.preventDefault();
      return;
    }

    if (e.key === 'Delete' && checkedRowIndexes.size > 0 && !fromInput) {
      handleDeleteSelectedRows();
      e.preventDefault();
      return;
    }

    if (!activeCell || fromInput) return;
    const { rowIndex, colName } = activeCell;

    switch (e.key) {
      case 'ArrowRight':  navigateCell(rowIndex, colName,  1,  0); e.preventDefault(); break;
      case 'ArrowLeft':   navigateCell(rowIndex, colName, -1,  0); e.preventDefault(); break;
      case 'ArrowDown':   navigateCell(rowIndex, colName,  0,  1); e.preventDefault(); break;
      case 'ArrowUp':     navigateCell(rowIndex, colName,  0, -1); e.preventDefault(); break;
      case 'Tab':         navigateCell(rowIndex, colName, e.shiftKey ? -1 : 1, 0); e.preventDefault(); break;
      case 'Enter':
      case 'F2':          enterEditMode(rowIndex, colName); e.preventDefault(); break;
      case 'Delete':
      case 'Backspace':   handleClearCell(rowIndex, colName); e.preventDefault(); break;
      case 'Escape':      setActiveCell(null); e.preventDefault(); break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          enterEditMode(rowIndex, colName, e.key); e.preventDefault();
        }
        if ((e.key === 'c' || e.key === 'C') && (e.ctrlKey || e.metaKey)) {
          handleCopyCell(rowIndex, colName); e.preventDefault();
        }
        if ((e.key === 'v' || e.key === 'V') && (e.ctrlKey || e.metaKey)) {
          handlePasteCell(rowIndex, colName); e.preventDefault();
        }
    }
  }, [editingCell, activeCell, navigateCell, enterEditMode, cancelEdit, applyCellChange, pushHistory, localRows, deletedRows, handleUndo, handleRedo, checkedRowIndexes, handleDeleteSelectedRows, handleClearCell, handleCopyCell, handlePasteCell]);

  const coerceValueForCol = useCallback((val, col) => {
    if (val === null || val === undefined || val === '') return null;
    if (!col) return val;
    const type = (col.editorDescriptor?.editorType || col.data_type || '').toLowerCase();

    if (['integer', 'int4', 'int2', 'int8', 'smallint', 'bigint', 'serial', 'bigserial'].some(t => type.includes(t))) {
      if (typeof val === 'string') {
        const parsed = parseInt(val.trim(), 10);
        return !isNaN(parsed) ? parsed : val;
      }
    }
    if (['decimal', 'numeric', 'float', 'real', 'double', 'money'].some(t => type.includes(t))) {
      if (typeof val === 'string') {
        const parsed = parseFloat(val.trim());
        return !isNaN(parsed) ? parsed : val;
      }
    }
    if (type.includes('boolean') || type.includes('bool')) {
      if (val === 'true' || val === 't' || val === '1' || val === 1) return true;
      if (val === 'false' || val === 'f' || val === '0' || val === 0) return false;
    }
    return val;
  }, []);

  const coerceRowForBackend = useCallback((row, columns) => {
    const clean = stripMeta(row);
    const coerced = {};
    columns.forEach((col) => {
      if (col.name in clean) {
        coerced[col.name] = coerceValueForCol(clean[col.name], col);
      }
    });
    return coerced;
  }, [coerceValueForCol]);

  // ── Save flow ────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaveState('validating');
    const { isValid, errors } = validateDirtyRows(localRows, allColumns);

    if (!isValid) {
      setValidationErrors(errors);
      setSaveState('invalid');
      showToast('Validation failed — please fix highlighted errors', 'error');
      return;
    }

    setValidationErrors({});
    const newRows     = localRows.filter((r) => r._isNew);
    const updatedRows = localRows.filter((r) => !r._isNew && r._isDirty);

    if (newRows.length === 0 && updatedRows.length === 0 && deletedRows.length === 0) {
      setIsDirty(false);
      setSaveState(null);
      return;
    }

    const pkColumn = allColumns.find((c) => c.is_primary_key);

    setSaveState('saving');
    setSaveError(null);
    const stats = { inserted: 0, updated: 0, deleted: 0 };

    try {
      if (newRows.length > 0) {
        const payload = newRows.map((r) => coerceRowForBackend(r, allColumns));
        const result  = await api.bulkInsert(fqn, payload);
        stats.inserted = result.inserted_count ?? newRows.length;
      }

      if (updatedRows.length > 0) {
        if (!pkColumn) {
          throw new Error('Cannot update rows: no primary key column found in table schema.');
        }
        const updatePayload = updatedRows.map((row) => {
          const orig = row._originalRow || {};
          const pk_value = coerceValueForCol(row[pkColumn.name], pkColumn);
          const changedUpdates = {};
          allColumns.forEach((col) => {
            if (col.name !== pkColumn.name && !valuesEqual(row[col.name], orig[col.name])) {
              changedUpdates[col.name] = coerceValueForCol(row[col.name], col);
            }
          });
          return {
            pk_column: pkColumn.name,
            pk_value,
            updates: Object.keys(changedUpdates).length > 0 ? changedUpdates : coerceRowForBackend(row, allColumns),
          };
        });
        const result = await api.bulkUpdate(fqn, updatePayload);
        stats.updated = result.updated_count ?? updatedRows.length;
      }

      if (deletedRows.length > 0) {
        if (!pkColumn) {
          throw new Error('Cannot delete rows: no primary key column found.');
        }
        const pkValues = deletedRows
          .map((r) => coerceValueForCol(r[pkColumn.name], pkColumn))
          .filter((v) => v !== null && v !== undefined);
        if (pkValues.length > 0) {
          const result = await api.bulkDelete(fqn, pkColumn.name, pkValues);
          stats.deleted = result.deleted_count ?? pkValues.length;
        }
      }

      setSaveStats(stats);
      setSaveState('saved');
      setIsDirty(false);
      setDeletedRows([]);
      setUndoStack([]);
      setRedoStack([]);
      localStorage.removeItem(`bus_os_draft_${fqn}`);
      showToast('All changes saved successfully to database!', 'success');

      setTimeout(() => {
        setSaveState(null);
        setSaveStats(null);
        handleRefresh();
      }, 1200);

    } catch (err) {
      setSaveState('error');
      setSaveError(err.message || 'Save failed. Please try again.');
      showToast(`Save Error: ${err.message}`, 'error');
    }
  }, [localRows, deletedRows, allColumns, fqn, showToast]);

  // ── Pagination & Page Size ────────────────────────────────────────────────
  const handlePageChange = useCallback((newPage) => {
    setPage(newPage);
    setCheckedRowIndexes(new Set());
  }, []);

  const handlePageSizeChange = useCallback((newPageSize) => {
    setPageSize(newPageSize);
    setPage(1);
    setCheckedRowIndexes(new Set());
  }, []);


  const handleColumnResize = useCallback((colName, newWidth) => {
    setColumnWidths((prev) => ({ ...prev, [colName]: newWidth }));
  }, []);

  const handleDismissError = useCallback(() => {
    setSaveState(null);
    setSaveError(null);
  }, []);

  const loading    = loadingSchema || loadingRows;
  const pageOffset = (page - 1) * pageSize;
  const dirtyCount = localRows.filter((r) => r._isDirty || r._isNew).length + deletedRows.length;
  const errorCount = Object.keys(validationErrors).length;
  const isSaving   = saveState === 'saving' || saveState === 'validating';

  const EmptyState = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', gap: 16, padding: 48 }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 6 }}>No rows found</div>
        <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>This table appears to be empty.</div>
      </div>
    </div>
  );

  const FetchErrorState = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', gap: 16, padding: 48 }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(218,54,51,0.08)', border: '1px solid rgba(218,54,51,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--danger)', marginBottom: 6 }}>Failed to load data</div>
        <div style={{ fontSize: '0.82rem', lineHeight: 1.5, wordBreak: 'break-word' }}>{fetchError}</div>
      </div>
      <button onClick={handleRefresh} style={{ padding: '8px 20px', borderRadius: 6, background: 'rgba(218,54,51,0.1)', border: '1px solid rgba(218,54,51,0.3)', color: 'var(--danger)', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 500 }}>Retry</button>
    </div>
  );

  return (
    <div
      className="ss-page"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#0d1117', borderRadius: 8, border: '1px solid var(--border-color)', position: 'relative', ...style }}
    >
      {/* ── Saved Draft Restore Notification Banner ──────────── */}
      {hasSavedDraft && !isDirty && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 16px', background: 'rgba(227,179,65,0.12)', borderBottom: '1px solid rgba(227,179,65,0.3)',
          color: '#e3b341', fontSize: '0.78rem', fontFamily: 'var(--font-mono)', zIndex: 30,
        }}>
          <span>Unsaved draft found for {fqn} from a previous session.</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleRestoreDraft} style={{ background: 'rgba(227,179,65,0.2)', border: '1px solid rgba(227,179,65,0.4)', color: '#e3b341', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>Restore Draft</button>
            <button onClick={handleDismissDraft} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.75rem' }}>Dismiss</button>
          </div>
        </div>
      )}

      {/* ── Floating Toast Notification Banner ────────────────── */}
      {notification && (
        <div style={{
          position: 'absolute', top: 56, right: 20, zIndex: 999,
          padding: '8px 14px', borderRadius: 6,
          background: notification.type === 'error' ? 'rgba(248,81,73,0.92)' : notification.type === 'success' ? 'rgba(63,185,80,0.92)' : 'rgba(47,129,247,0.92)',
          color: '#ffffff', fontSize: '0.8rem', fontWeight: 500,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)', animation: 'ss-fade-in 0.2s ease',
        }}>
          {notification.message}
        </div>
      )}

      {/* ── Saving Loading Overlay Blur ────────────────────────── */}
      {isSaving && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 990,
          background: 'rgba(13,17,23,0.65)', backdropFilter: 'blur(3px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
            <circle cx="12" cy="12" r="10" strokeOpacity="0.2"/><path d="M12 2a10 10 0 0 1 10 10" stroke="var(--accent)"/>
          </svg>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {saveState === 'validating' ? 'Validating schema rules…' : 'Executing transaction on PostgreSQL…'}
          </div>
        </div>
      )}

      {/* ── Right-Click Context Menu ───────────────────────────── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedRowCount={checkedRowIndexes.size}
          onClose={() => setContextMenu(null)}
          onEditCell={() => enterEditMode(contextMenu.rowIndex, contextMenu.colName)}
          onCopyCell={() => handleCopyCell(contextMenu.rowIndex, contextMenu.colName)}
          onPasteCell={() => handlePasteCell(contextMenu.rowIndex, contextMenu.colName)}
          onClearCell={() => handleClearCell(contextMenu.rowIndex, contextMenu.colName)}
          onDuplicateRow={() => handleDuplicateRow(contextMenu.rowIndex)}
          onInsertRowAbove={() => handleInsertRowRelative(contextMenu.rowIndex, 'above')}
          onInsertRowBelow={() => handleInsertRowRelative(contextMenu.rowIndex, 'below')}
          onDeleteRow={() => {
            if (checkedRowIndexes.size > 1) handleDeleteSelectedRows();
            else handleDeleteRow(contextMenu.rowIndex);
          }}
        />
      )}

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <SpreadsheetToolbar
        fqn={fqn}
        totalCount={totalCount}
        rowCount={processedRows.length}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        loading={loading}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onRefresh={handleRefresh}
        activeCell={activeCell}
        isDirty={isDirty}
        dirtyCount={dirtyCount}
        errorCount={errorCount}
        selectedRowCount={checkedRowIndexes.size}
        onDeleteSelectedRows={handleDeleteSelectedRows}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        columns={allColumns}
        hiddenColumns={hiddenColumns}
        onToggleColumnVisibility={handleToggleColumnVisibility}
        frozenCount={frozenCount}
        onFreezeChange={setFrozenCount}
        onExportCsv={handleExportCsv}
        onImportCsv={handleImportCsv}
        saveState={saveState}
        saveError={saveError}
        saveStats={saveStats}
        onSave={handleSave}
        onDismissError={handleDismissError}
      />

      {/* ── Body ────────────────────────────────────────────────── */}
      {fetchError && !loading ? (
        <FetchErrorState />
      ) : !schema && !loading ? (
        <EmptyState />
      ) : (
        <SpreadsheetGrid
          columns={visibleColumns}
          rows={processedRows}
          loading={loading}
          columnWidths={columnWidths}
          onColumnResize={handleColumnResize}
          pageOffset={pageOffset}
          activeCell={activeCell}
          editingCell={editingCell}
          editValue={editValue}
          validationErrors={validationErrors}
          checkedRowIndexes={checkedRowIndexes}
          frozenCount={frozenCount}
          sortConfig={sortConfig}
          onHeaderSortClick={handleHeaderSortClick}
          onToggleSelectRow={handleToggleSelectRow}
          onToggleSelectAll={handleToggleSelectAll}
          onCellClick={handleCellClick}
          onCellDoubleClick={handleCellDoubleClick}
          onCellContextMenu={handleCellContextMenu}
          onEditChange={setEditValueSync}
          onEditCommit={commitEdit}
          onEditCancel={cancelEdit}
          onKeyDown={handleKeyDown}
          onDeleteRow={handleDeleteRow}
          onAddRow={handleAddRow}
          gridRef={gridRef}
        />
      )}

      {/* ── Footer status bar ────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '5px 14px',
        background: 'rgba(8,10,14,0.7)',
        borderTop: '1px solid rgba(48,54,61,0.6)',
        fontSize: '0.72rem', color: 'rgba(139,148,158,0.6)',
        flexShrink: 0, fontFamily: 'var(--font-mono)',
      }}>
        <span>{visibleColumns.length}/{allColumns.length} columns visible</span>
        <span>·</span>
        <span>{processedRows.length} / {totalCount.toLocaleString()} rows</span>
        {checkedRowIndexes.size > 0 && (
          <>
            <span>·</span>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
              {checkedRowIndexes.size} row{checkedRowIndexes.size !== 1 ? 's' : ''} selected
            </span>
          </>
        )}
        {activeCell && (
          <>
            <span>·</span>
            <span style={{ color: 'var(--accent)' }}>
              {activeCell.colName} [{activeCell.rowIndex + 1}]
            </span>
          </>
        )}
        {errorCount > 0 && (
          <>
            <span>·</span>
            <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
              {errorCount} validation error{errorCount !== 1 ? 's' : ''}
            </span>
          </>
        )}
        {isDirty && !errorCount && (
          <>
            <span>·</span>
            <span style={{ color: '#e3b341' }}>● {dirtyCount} row{dirtyCount !== 1 ? 's' : ''} modified</span>
          </>
        )}
        <span style={{ marginLeft: 'auto' }}>
          Right-click for Menu  •  CSV Export/Import  •  Draft Auto-Saved
        </span>
      </div>
    </div>
  );
};

export default SpreadsheetPage;
