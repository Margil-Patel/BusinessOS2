import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const DATA_TYPES = [
  'SERIAL',
  'BIGSERIAL',
  'VARCHAR',
  'VARCHAR(255)',
  'TEXT',
  'INTEGER',
  'BIGINT',
  'BOOLEAN',
  'DECIMAL(10,2)',
  'NUMERIC',
  'TIMESTAMP',
  'DATE',
  'JSONB'
];

const SchemaDesigner = () => {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // New Table Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [newTableFqn, setNewTableFqn] = useState('public.');
  const [newTableCols, setNewTableCols] = useState([
    { name: 'id', type: 'SERIAL', nullable: false, is_primary_key: true, is_unique: false, default_value: '' }
  ]);

  // Batch schema designer states
  const [editableCols, setEditableCols] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [expandedCols, setExpandedCols] = useState({ 0: true });
  const [advancedCols, setAdvancedCols] = useState({});
  const [draggedIndex, setDraggedIndex] = useState(null);

  // Safety Deletion Modals
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleteType, setDeleteType] = useState('table'); // 'table' or 'column'
  const [deleteColName, setDeleteColName] = useState('');
  const [safetyReport, setSafetyReport] = useState(null);

  // Visual Relationship Designer states
  const [activeTab, setActiveTab] = useState('designer'); // 'designer', 'relations', or 'history'
  const [selectedSource, setSelectedSource] = useState(null); // { fqn, colName, type }
  const [connections, setConnections] = useState([]);
  const [hoveredFk, setHoveredFk] = useState(null);

  // Schema Versioning states
  const [versionsList, setVersionsList] = useState([]);
  const [selectedVersionForCompare, setSelectedVersionForCompare] = useState(null);

  // AI Schema Generation states
  const [createMethod, setCreateMethod] = useState('manual'); // 'manual' or 'ai'
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);

  const areTypesCompatible = (typeA, typeB) => {
    if (!typeA || !typeB) return false;
    const norm = t => t.toUpperCase().replace(/\(\d+\)/, '').replace(/VARCHAR\(\d+\)/, 'VARCHAR');
    const tA = norm(typeA);
    const tB = norm(typeB);
    if (tA === tB) return true;
    const numTypes = ['INTEGER', 'BIGINT', 'SERIAL', 'BIGSERIAL', 'NUMERIC', 'DECIMAL', 'INT', 'SMALLINT'];
    if (numTypes.includes(tA) && numTypes.includes(tB)) return true;
    const textTypes = ['VARCHAR', 'TEXT', 'CHAR'];
    if (textTypes.includes(tA) && textTypes.includes(tB)) return true;
    return false;
  };

  const createsCircularDependency = (sourceFqn, targetFqn) => {
    const adj = {};
    tables.forEach(t => {
      adj[t.qualified_name] = new Set();
      if (t.columns) {
        t.columns.forEach(c => {
          if (c.foreign_table) {
            adj[t.qualified_name].add(c.foreign_table);
          }
        });
      }
    });

    if (!adj[sourceFqn]) adj[sourceFqn] = new Set();
    adj[sourceFqn].add(targetFqn);

    const visited = new Set();
    const recStack = new Set();

    const dfs = (node) => {
      visited.add(node);
      recStack.add(node);

      const neighbors = adj[node] || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recStack.has(neighbor)) {
          return true;
        }
      }

      recStack.delete(node);
      return false;
    };

    for (const t of Object.keys(adj)) {
      if (!visited.has(t)) {
        if (dfs(t)) return true;
      }
    }
    return false;
  };

  const getFkOptions = () => {
    const options = [];
    if (tables) {
      tables.forEach(t => {
        if (t.columns) {
          t.columns.forEach(c => {
            options.push({
              fqn: t.qualified_name,
              col: c.name,
              label: `${t.name}.${c.name}`
            });
          });
        }
      });
    }
    return options;
  };

  useEffect(() => {
    fetchTables();
  }, []);

  useEffect(() => {
    if (selectedTable) {
      const cols = (selectedTable.columns || []).map(c => ({
        name: c.name,
        type: c.type || c.data_type || 'VARCHAR',
        nullable: c.nullable ?? true,
        is_primary_key: c.is_pk || c.is_primary_key || false,
        is_unique: c.is_unique || false,
        default_value: c.default_value || '',
        original_name: c.name,
        check_constraint: c.check_constraint || '',
        foreign_key_table: c.foreign_table || c.foreign_key_table || '',
        foreign_key_column: c.foreign_column || c.foreign_key_column || '',
        has_index: c.has_index || false,
        comment: c.comment || ''
      }));
      setEditableCols(cols);
      setIsDirty(false);
      setExpandedCols({});
      setAdvancedCols({});
    } else {
      setEditableCols([]);
      setIsDirty(false);
      setExpandedCols({});
      setAdvancedCols({});
    }
  }, [selectedTable]);

  const fetchTables = async (selectFqn = null) => {
    setLoading(true);
    try {
      const data = await api.getTables();
      setTables(data);
      if (selectFqn) {
        const found = data.find(t => t.qualified_name === selectFqn);
        if (found) setSelectedTable(found);
      } else if (selectedTable) {
        const found = data.find(t => t.qualified_name === selectedTable.qualified_name);
        if (found) setSelectedTable(found);
      } else if (data && data.length > 0) {
        setSelectedTable(data[0]);
      }
    } catch (e) {
      setError('Failed to fetch database tables: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (msg, isError = false) => {
    if (isError) {
      setError(msg);
      setSuccess(null);
      setTimeout(() => setError(null), 6000);
    } else {
      setSuccess(msg);
      setError(null);
      setTimeout(() => setSuccess(null), 4000);
    }
  };

  const toggleColExpand = (index) => {
    setExpandedCols(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const toggleAdvancedCol = (index) => {
    setAdvancedCols(prev => ({ ...prev, [index]: !prev[index] }));
  };

  // Drag and Drop Column Reordering
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const updated = [...editableCols];
    const [draggedItem] = updated.splice(draggedIndex, 1);
    updated.splice(index, 0, draggedItem);
    setEditableCols(updated);
    setIsDirty(true);
    setDraggedIndex(null);
  };

  // --- Create Table Handlers ---
  const handleAddColToNewTable = () => {
    setNewTableCols([
      ...newTableCols,
      { name: '', type: 'VARCHAR', nullable: true, is_primary_key: false, is_unique: false, default_value: '' }
    ]);
  };

  const handleRemoveColFromNewTable = (index) => {
    setNewTableCols(newTableCols.filter((_, i) => i !== index));
  };

  const handleNewTableColChange = (index, field, value) => {
    const updated = [...newTableCols];
    updated[index][field] = value;
    setNewTableCols(updated);
  };

  const handleGenerateAISchema = async (e) => {
    e.preventDefault();
    if (!aiPrompt.trim()) {
      showNotification('Please enter a description for the AI.', true);
      return;
    }
    setAiGenerating(true);
    setError(null);
    try {
      const res = await api.generateAISchema(aiPrompt);
      if (res.success) {
        setNewTableFqn(res.fqn);
        const formatted = res.columns.map(c => ({
          name: c.name,
          type: c.type,
          nullable: c.nullable,
          is_primary_key: c.is_primary_key,
          is_unique: c.is_unique,
          default_value: c.default_value || '',
          check_constraint: c.check_constraint || '',
          foreign_key_table: c.foreign_key_table || '',
          foreign_key_column: c.foreign_key_column || '',
          has_index: c.has_index || false
        }));
        setNewTableCols(formatted);
        setWizardStep(2);
        showNotification('AI proposal generated! Please review the schema below.');
      } else {
        throw new Error('Failed to generate schema.');
      }
    } catch (err) {
      setError(err.message);
      showNotification(err.message, true);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleStep1Submit = (e) => {
    e.preventDefault();
    if (!newTableFqn.trim() || newTableFqn === 'public.') {
      showNotification('Please enter a valid table name (FQN)', true);
      return;
    }
    const parts = newTableFqn.split('.');
    if (parts.length > 2 || !parts[parts.length - 1].trim()) {
      showNotification('FQN must follow format schema.table (e.g. public.users)', true);
      return;
    }
    setWizardStep(2);
  };

  const handleCreateTableSubmit = async (e) => {
    e.preventDefault();
    if (!newTableFqn.trim() || newTableFqn === 'public.') {
      showNotification('Please enter a valid table name (FQN)', true);
      return;
    }
    const invalidCol = newTableCols.find(c => !c.name.trim() || !c.type.trim());
    if (invalidCol) {
      showNotification('All columns must have a valid name and type', true);
      return;
    }

    setLoading(true);
    try {
      await api.createTable(newTableFqn.trim(), newTableCols);
      showNotification(`Table ${newTableFqn} created successfully!`);
      setShowCreateModal(false);
      setCreateMethod('manual');
      setAiPrompt('');
      setNewTableFqn('public.');
      setNewTableCols([
        { name: 'id', type: 'SERIAL', nullable: false, is_primary_key: true, is_unique: false, default_value: '' }
      ]);
      setWizardStep(1);
      await fetchTables(newTableFqn.trim());
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  // --- Column Action Handlers ---
  const handleColChange = (index, field, value) => {
    const updated = [...editableCols];
    updated[index][field] = value;
    if (field === 'is_primary_key' && value) {
      updated[index].nullable = false;
    }
    setEditableCols(updated);
    setIsDirty(true);
  };

  const handleAddNewColumnInline = () => {
    const newIdx = editableCols.length;
    setEditableCols([
      ...editableCols,
      {
        name: '',
        type: 'VARCHAR',
        nullable: true,
        is_primary_key: false,
        is_unique: false,
        default_value: '',
        original_name: null,
        check_constraint: '',
        foreign_key_table: '',
        foreign_key_column: '',
        has_index: false,
        comment: ''
      }
    ]);
    setExpandedCols(prev => ({ ...prev, [newIdx]: true }));
    setIsDirty(true);
  };

  const handleRequestDeleteTable = async (fqn) => {
    setLoading(true);
    try {
      const report = await api.checkTableDelete(fqn);
      setSafetyReport(report);
      setDeleteType('table');
      setDeleteColName('');
      setShowDeleteConfirmModal(true);
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestDeleteColumn = async (index) => {
    const col = editableCols[index];
    if (col.is_primary_key) {
      showNotification('Cannot drop Primary Key columns', true);
      return;
    }
    
    if (col.original_name === null) {
      const updated = editableCols.filter((_, i) => i !== index);
      setEditableCols(updated);
      setIsDirty(true);
      return;
    }

    setLoading(true);
    try {
      const fqn = selectedTable.qualified_name;
      const report = await api.checkColumnDelete(fqn, col.name);
      setSafetyReport(report);
      setDeleteType('column');
      setDeleteColName(col.name);
      setShowDeleteConfirmModal(true);
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    setLoading(true);
    setShowDeleteConfirmModal(false);
    try {
      if (deleteType === 'table') {
        const fqn = selectedTable.qualified_name;
        await api.dropTable(fqn);
        showNotification(`Table ${fqn} dropped successfully.`);
        setSelectedTable(null);
        await fetchTables();
      } else {
        const fqn = selectedTable.qualified_name;
        await api.dropColumn(fqn, deleteColName);
        showNotification(`Column "${deleteColName}" dropped successfully.`);
        await fetchTables(fqn);
      }
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!selectedTable) return;

    const invalidCol = editableCols.find(c => !c.name.trim() || !c.type.trim());
    if (invalidCol) {
      showNotification('All columns must have a valid name and type', true);
      return;
    }

    setLoading(true);
    try {
      const fqn = selectedTable.qualified_name;
      await api.alterTable(fqn, editableCols);
      showNotification('Schema changes saved and synchronized successfully!');
      setIsDirty(false);
      await fetchTables(fqn);
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const fetchTableVersions = async (fqn) => {
    if (!fqn) return;
    try {
      const res = await api.getTableVersions(fqn);
      setVersionsList(res.versions || []);
      setSelectedVersionForCompare(null);
    } catch (err) {
      showNotification(err.message, true);
    }
  };

  useEffect(() => {
    if (activeTab === 'history' && selectedTable) {
      fetchTableVersions(selectedTable.qualified_name);
    }
  }, [activeTab, selectedTable]);

  const handleRestoreVersion = async (versionNumber) => {
    if (!selectedTable) return;
    const confirmMsg = `Are you sure you want to restore the schema of ${selectedTable.qualified_name} to version v${versionNumber}?`;
    if (window.confirm(confirmMsg)) {
      setLoading(true);
      try {
        const fqn = selectedTable.qualified_name;
        await api.restoreSchemaVersion(fqn, versionNumber);
        showNotification(`Table schema restored to version v${versionNumber} successfully!`);
        setIsDirty(false);
        await fetchTables(fqn);
        await fetchTableVersions(fqn);
      } catch (err) {
        showNotification(err.message, true);
      } finally {
        setLoading(false);
      }
    }
  };

  const calculateConnections = () => {
    const newConns = [];
    tables.forEach(srcTable => {
      if (!srcTable.columns) return;
      srcTable.columns.forEach(srcCol => {
        if (srcCol.foreign_table && srcCol.foreign_column) {
          const srcElem = document.getElementById(`col-node-${srcTable.qualified_name}-${srcCol.name}`);
          const targetElem = document.getElementById(`col-node-${srcCol.foreign_table}-${srcCol.foreign_column}`);
          const boardElem = document.getElementById('relationship-board');

          if (srcElem && targetElem && boardElem) {
            const boardRect = boardElem.getBoundingClientRect();
            const srcRect = srcElem.getBoundingClientRect();
            const targetRect = targetElem.getBoundingClientRect();

            const x1 = srcRect.right - boardRect.left + boardElem.scrollLeft;
            const y1 = srcRect.top + srcRect.height / 2 - boardRect.top + boardElem.scrollTop;
            const x2 = targetRect.left - boardRect.left + boardElem.scrollLeft;
            const y2 = targetRect.top + targetRect.height / 2 - boardRect.top + boardElem.scrollTop;

            newConns.push({
              srcTable: srcTable.qualified_name,
              srcCol: srcCol.name,
              targetTable: srcCol.foreign_table,
              targetCol: srcCol.foreign_column,
              x1, y1, x2, y2
            });
          }
        }
      });
    });
    setConnections(newConns);
  };

  useEffect(() => {
    if (activeTab === 'relations') {
      const timer = setTimeout(calculateConnections, 200);
      window.addEventListener('resize', calculateConnections);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', calculateConnections);
      };
    }
  }, [activeTab, tables]);

  const handleSelectRelationNode = async (fqn, colName, colType) => {
    if (!selectedSource) {
      setSelectedSource({ fqn, colName, type: colType });
      showNotification(`Selected source column ${colName} (${colType}). Now click target column to link FK.`);
      return;
    }

    if (selectedSource.fqn === fqn && selectedSource.colName === colName) {
      setSelectedSource(null);
      showNotification('Selection cleared.');
      return;
    }

    if (!areTypesCompatible(selectedSource.type, colType)) {
      showNotification(`Type mismatch! Cannot link ${selectedSource.type} to ${colType}.`, true);
      setSelectedSource(null);
      return;
    }

    if (createsCircularDependency(selectedSource.fqn, fqn)) {
      showNotification(`Cannot link FK: Creates a circular dependency between ${selectedSource.fqn} and ${fqn}.`, true);
      setSelectedSource(null);
      return;
    }

    const srcTableMeta = tables.find(t => t.qualified_name === selectedSource.fqn);
    if (!srcTableMeta) return;

    const updatedCols = srcTableMeta.columns.map(c => {
      if (c.name === selectedSource.colName) {
        return {
          name: c.name,
          type: c.type,
          nullable: c.nullable,
          is_primary_key: c.is_pk,
          is_unique: c.is_unique,
          default_value: c.default_value || '',
          original_name: c.name,
          check_constraint: c.check_constraint || '',
          foreign_key_table: fqn,
          foreign_key_column: colName,
          has_index: c.has_index || false
        };
      }
      return {
        name: c.name,
        type: c.type,
        nullable: c.nullable,
        is_primary_key: c.is_pk,
        is_unique: c.is_unique,
        default_value: c.default_value || '',
        original_name: c.name,
        check_constraint: c.check_constraint || '',
        foreign_key_table: c.foreign_table || '',
        foreign_key_column: c.foreign_column || '',
        has_index: c.has_index || false
      };
    });

    setLoading(true);
    try {
      await api.alterTable(selectedSource.fqn, updatedCols);
      showNotification(`Foreign Key established: ${selectedSource.fqn}.${selectedSource.colName} → ${fqn}.${colName}`);
      setSelectedSource(null);
      await fetchTables();
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestDropFk = async (conn) => {
    const confirmDrop = window.confirm(`Drop Foreign Key constraint from ${conn.srcTable}.${conn.srcCol}?`);
    if (!confirmDrop) return;

    const srcTableMeta = tables.find(t => t.qualified_name === conn.srcTable);
    if (!srcTableMeta) return;

    const updatedCols = srcTableMeta.columns.map(c => {
      const isTarget = c.name === conn.srcCol;
      return {
        name: c.name,
        type: c.type,
        nullable: c.nullable,
        is_primary_key: c.is_pk,
        is_unique: c.is_unique,
        default_value: c.default_value || '',
        original_name: c.name,
        check_constraint: c.check_constraint || '',
        foreign_key_table: isTarget ? '' : (c.foreign_table || ''),
        foreign_key_column: isTarget ? '' : (c.foreign_column || ''),
        has_index: c.has_index || false
      };
    });

    setLoading(true);
    try {
      await api.alterTable(conn.srcTable, updatedCols);
      showNotification(`Foreign Key constraint dropped from ${conn.srcTable}.${conn.srcCol}`);
      await fetchTables();
    } catch (err) {
      showNotification(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const filteredTables = tables.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) || 
    t.schema.toLowerCase().includes(search.toLowerCase()) ||
    t.qualified_name.toLowerCase().includes(search.toLowerCase())
  );

  const getColTypeIcon = (col) => {
    if (col.is_primary_key) {
      return <span style={{ color: '#f1e05a', fontWeight: 'bold', fontSize: '0.9rem' }} title="Primary Key">🔑</span>;
    }
    const type = (col.type || '').toUpperCase();
    if (type.includes('INT') || type.includes('SERIAL') || type.includes('NUMERIC') || type.includes('DECIMAL') || type.includes('NUMBER')) {
      return <span style={{ color: '#58a6ff', fontWeight: 'bold', fontSize: '0.9rem' }}>#</span>;
    }
    if (type.includes('CHAR') || type.includes('TEXT') || type.includes('STR')) {
      return <span style={{ color: '#79c0ff', fontWeight: 'bold', fontSize: '0.85rem' }}>Aa</span>;
    }
    if (type.includes('BOOL')) {
      return <span style={{ color: '#56d364', fontWeight: 'bold', fontSize: '0.9rem' }}>✓</span>;
    }
    if (type.includes('DATE') || type.includes('TIME')) {
      return <span style={{ color: '#d29922', fontWeight: 'bold', fontSize: '0.9rem' }}>🕒</span>;
    }
    return <span style={{ color: 'var(--text-secondary)', fontWeight: 'bold', fontSize: '0.85rem' }}>⚙</span>;
  };

  const generateColumnSql = (col) => {
    if (!col.name) return '-- Unnamed Column';
    let sql = `${col.name} ${col.type}`;
    if (col.is_primary_key) sql += ' PRIMARY KEY';
    if (!col.nullable) sql += ' NOT NULL';
    if (col.is_unique) sql += ' UNIQUE';
    if (col.default_value) sql += ` DEFAULT ${col.default_value}`;
    if (col.check_constraint) sql += ` CHECK (${col.check_constraint})`;
    if (col.foreign_key_table && col.foreign_key_column) {
      sql += ` REFERENCES ${col.foreign_key_table}(${col.foreign_key_column})`;
    }
    return sql;
  };

  return (
    <div className="designer-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#0b0f17' }}>
      
      {/* ── Top Header Navigation & Action Bar (Ultra-Compact Single Row) ───── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 16px',
        background: '#0d1117',
        borderBottom: '1px solid var(--border-color)',
        flexShrink: 0,
        minHeight: 44
      }}>
        {/* Left Sub-nav Tabs */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => setActiveTab('designer')}
            style={{
              background: activeTab === 'designer' ? 'rgba(47, 129, 247, 0.15)' : 'transparent',
              border: activeTab === 'designer' ? '1px solid var(--accent)' : '1px solid transparent',
              color: activeTab === 'designer' ? 'var(--accent)' : 'var(--text-secondary)',
              padding: '5px 12px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 32,
              transition: 'all 0.15s ease'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>
            </svg>
            Schema Designer
          </button>
          <button
            onClick={() => {
              setActiveTab('relations');
              setTimeout(calculateConnections, 150);
            }}
            style={{
              background: activeTab === 'relations' ? 'rgba(47, 129, 247, 0.15)' : 'transparent',
              border: activeTab === 'relations' ? '1px solid var(--accent)' : '1px solid transparent',
              color: activeTab === 'relations' ? 'var(--accent)' : 'var(--text-secondary)',
              padding: '5px 12px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 32,
              transition: 'all 0.15s ease'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            Relationship Designer
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              background: activeTab === 'history' ? 'rgba(47, 129, 247, 0.15)' : 'transparent',
              border: activeTab === 'history' ? '1px solid var(--accent)' : '1px solid transparent',
              color: activeTab === 'history' ? 'var(--accent)' : 'var(--text-secondary)',
              padding: '5px 12px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 32,
              transition: 'all 0.15s ease'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Version History
          </button>
        </div>

        {/* Right Action Buttons */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button 
            disabled={!isDirty || loading}
            onClick={() => {
              if (selectedTable) {
                const cols = (selectedTable.columns || []).map(c => ({
                  name: c.name,
                  type: c.type || c.data_type || 'VARCHAR',
                  nullable: c.nullable ?? true,
                  is_primary_key: c.is_pk || c.is_primary_key || false,
                  is_unique: c.is_unique || false,
                  default_value: c.default_value || '',
                  original_name: c.name,
                  check_constraint: c.check_constraint || '',
                  foreign_key_table: c.foreign_table || c.foreign_key_table || '',
                  foreign_key_column: c.foreign_column || c.foreign_key_column || '',
                  has_index: c.has_index || false,
                  comment: c.comment || ''
                }));
                setEditableCols(cols);
                setIsDirty(false);
              }
            }}
            style={{
              background: '#1f242d',
              border: '1px solid #30363d',
              color: isDirty ? 'white' : 'var(--text-secondary)',
              padding: '5px 14px',
              borderRadius: 6,
              fontSize: '0.82rem',
              fontWeight: 600,
              height: 32,
              cursor: isDirty ? 'pointer' : 'not-allowed',
              opacity: isDirty ? 1 : 0.6,
              transition: 'all 0.15s ease'
            }}
          >
            Discard Changes
          </button>
          <button 
            disabled={!isDirty || loading}
            onClick={handleSaveChanges}
            style={{
              background: isDirty ? 'var(--accent)' : '#1f242d',
              border: '1px solid transparent',
              color: 'white',
              padding: '5px 16px',
              borderRadius: 6,
              fontSize: '0.82rem',
              fontWeight: 600,
              height: 32,
              cursor: isDirty ? 'pointer' : 'not-allowed',
              opacity: isDirty ? 1 : 0.6,
              boxShadow: isDirty ? '0 0 10px rgba(47, 129, 247, 0.4)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            Save Changes
          </button>
        </div>
      </div>

      {/* Notifications Banner */}
      {error && (
        <div style={{ background: 'rgba(218, 54, 51, 0.15)', color: '#ff7b72', borderBottom: '1px solid var(--danger)', padding: '8px 16px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>⚠️</span> {error}
        </div>
      )}
      {success && (
        <div style={{ background: 'rgba(35, 134, 54, 0.15)', color: '#56d364', borderBottom: '1px solid var(--success)', padding: '8px 16px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>✅</span> {success}
        </div>
      )}

      {/* ── Main Layout Body (Sidebar + Content Workspace) ───────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* ── Left Sidebar (Tables List Explorer) ────────────────────────────── */}
        <aside style={{
          width: 260,
          background: '#0d1117',
          borderRight: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0
        }}>
          {/* Create Table Button */}
          <div style={{ padding: 12, borderBottom: '1px solid var(--border-color)' }}>
            <button
              onClick={() => {
                setWizardStep(1);
                setShowCreateModal(true);
              }}
              style={{
                width: '100%',
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                padding: '8px 14px',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 2px 8px rgba(47,129,247,0.3)'
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Create Table
            </button>
          </div>

          {/* Search Bar */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ position: 'relative' }}>
              <svg 
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
              >
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Search tables..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  background: '#161b22',
                  border: '1px solid #30363d',
                  color: 'white',
                  padding: '6px 10px 6px 30px',
                  borderRadius: 6,
                  outline: 'none',
                  fontSize: '0.82rem'
                }}
              />
            </div>
          </div>

          {/* Discovered Tables List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
            {filteredTables.map(t => {
              const isSelected = selectedTable?.qualified_name === t.qualified_name;
              return (
                <div
                  key={t.qualified_name}
                  onClick={() => setSelectedTable(t)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    marginBottom: 3,
                    background: isSelected ? 'rgba(47, 129, 247, 0.15)' : 'transparent',
                    color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                    border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: isSelected ? 1 : 0.6 }}>
                      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>
                    </svg>
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {t.name}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        {t.schema}
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '2px 5px', borderRadius: 4, flexShrink: 0 }}>
                    {t.columns.length} cols
                  </span>
                </div>
              );
            })}
            {filteredTables.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                No tables found
              </div>
            )}
          </div>
        </aside>

        {/* ── Main Workspace Content Area ────────────────────────────────────── */}
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, padding: 12 }}>
          
          {activeTab === 'designer' && selectedTable && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
              
              {/* 1. Selected Table Banner Header Card (Ultra-Compact) */}
              <div className="glass-panel" style={{
                flexShrink: 0,
                padding: '10px 16px',
                marginBottom: 10,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#0d1117',
                border: '1px solid var(--border-color)',
                borderRadius: 8
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 6, background: 'rgba(47,129,247,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)'
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>
                    </svg>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {selectedTable.qualified_name}
                      <span style={{ opacity: 0.5, cursor: 'pointer', fontSize: '0.85rem' }} title="Edit description">✏️</span>
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: '2px 0 0 0' }}>
                      Table in {selectedTable.schema} schema
                    </p>
                  </div>
                </div>

                {/* Table Header Stat Pills */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{
                    background: '#161b22', border: '1px solid #30363d', borderRadius: 6,
                    padding: '4px 10px', textAlign: 'center', minWidth: 56
                  }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase' }}>Columns</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'white' }}>{editableCols.length}</span>
                  </div>
                  <div style={{
                    background: '#161b22', border: '1px solid #30363d', borderRadius: 6,
                    padding: '4px 10px', textAlign: 'center', minWidth: 56
                  }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase' }}>Indexes</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'white' }}>
                      {editableCols.filter(c => c.has_index || c.is_primary_key).length}
                    </span>
                  </div>
                  <div style={{
                    background: '#161b22', border: '1px solid #30363d', borderRadius: 6,
                    padding: '4px 10px', textAlign: 'center', minWidth: 56
                  }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block', textTransform: 'uppercase' }}>FKs</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'white' }}>
                      {editableCols.filter(c => c.foreign_key_table).length}
                    </span>
                  </div>
                  
                  <button
                    onClick={() => handleRequestDeleteTable(selectedTable.qualified_name)}
                    style={{
                      background: 'rgba(218, 54, 51, 0.12)',
                      border: '1px solid rgba(218, 54, 51, 0.4)',
                      color: '#ff7b72',
                      padding: '5px 10px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginLeft: 6
                    }}
                    title="Drop Table"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    Drop Table
                  </button>
                </div>
              </div>

              {/* 2. Columns Setup Section Card */}
              <div className="glass-panel" style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: '#0d1117',
                border: '1px solid var(--border-color)',
                borderRadius: 8
              }}>
                {/* Section Header (Fixed Sticky Header) */}
                <div style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexShrink: 0
                }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 600, color: 'white' }}>Columns</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Define the structure of your table</span>
                  </div>
                  <button 
                    onClick={handleAddNewColumnInline} 
                    style={{
                      background: 'var(--accent)',
                      color: 'white',
                      border: 'none',
                      padding: '5px 12px',
                      borderRadius: 6,
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 2px 8px rgba(47,129,247,0.3)'
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add Column
                  </button>
                </div>

                {/* Column Card Items List (Independently Scrollable Container) */}
                <div 
                  className="custom-scrollbar"
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14
                  }}
                >
                  {editableCols.map((col, index) => {
                    const isExpanded = !!expandedCols[index];
                    const isAdvancedOpen = !!advancedCols[index];

                    return (
                      <div
                        key={index}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        style={{
                          flexShrink: 0,
                          minHeight: 64,
                          background: '#161b22',
                          border: isExpanded ? '1px solid var(--accent)' : '1px solid #30363d',
                          borderRadius: 10,
                          overflow: 'hidden',
                          boxShadow: isExpanded ? '0 0 12px rgba(47, 129, 247, 0.25)' : '0 4px 12px rgba(0,0,0,0.15)',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {/* ── Collapsed Header Row (60-64px tall, ONLY essential summary controls) ── */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '14px 18px',
                          gap: 14,
                          minHeight: 64,
                          background: isExpanded ? 'rgba(47, 129, 247, 0.05)' : 'transparent',
                          cursor: 'pointer'
                        }}
                        onClick={(e) => {
                          // Prevent toggling if clicked on dropdown or action buttons
                          if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'PATH' && e.target.tagName !== 'SVG') {
                            toggleColExpand(index);
                          }
                        }}
                        >
                          {/* Drag Handle */}
                          <div style={{ cursor: 'grab', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }} title="Drag to reorder">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
                              <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                              <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
                            </svg>
                          </div>

                          {/* Column Type Icon */}
                          <div style={{
                            width: 32, height: 32, borderRadius: 8, background: '#0d1117', border: '1px solid #30363d',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                          }}>
                            {getColTypeIcon(col)}
                          </div>

                          {/* Column Name */}
                          <div style={{ flex: 1, minWidth: 120 }}>
                            <span style={{
                              color: 'white',
                              fontWeight: 600,
                              fontSize: '0.95rem',
                              fontFamily: 'var(--font-mono)'
                            }}>
                              {col.name || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>unnamed_column</span>}
                            </span>
                          </div>

                          {/* Active Constraint Badges */}
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {col.is_primary_key && (
                              <span style={{
                                background: 'rgba(31, 107, 235, 0.2)', border: '1px solid rgba(31, 107, 235, 0.4)',
                                color: '#58a6ff', fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4
                              }}>
                                PRIMARY KEY
                              </span>
                            )}
                            {!col.nullable && (
                              <span style={{
                                background: 'rgba(46, 160, 67, 0.2)', border: '1px solid rgba(46, 160, 67, 0.4)',
                                color: '#56d364', fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4
                              }}>
                                NOT NULL
                              </span>
                            )}
                            {col.is_unique && (
                              <span style={{
                                background: 'rgba(210, 153, 34, 0.2)', border: '1px solid rgba(210, 153, 34, 0.4)',
                                color: '#e3b341', fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4
                              }}>
                                UNIQUE
                              </span>
                            )}
                            {col.has_index && (
                              <span style={{
                                background: 'rgba(56, 139, 253, 0.15)', border: '1px solid rgba(56, 139, 253, 0.3)',
                                color: '#79c0ff', fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4
                              }}>
                                INDEXED
                              </span>
                            )}
                          </div>

                          {/* Data Type Dropdown */}
                          <div style={{ width: 140 }}>
                            <select
                              value={col.type.toUpperCase()}
                              onChange={e => handleColChange(index, 'type', e.target.value)}
                              onClick={e => e.stopPropagation()}
                              style={{
                                width: '100%',
                                background: '#0d1117',
                                border: '1px solid #30363d',
                                color: 'white',
                                padding: '6px 10px',
                                borderRadius: 6,
                                fontSize: '0.82rem',
                                outline: 'none',
                                cursor: 'pointer'
                              }}
                            >
                              {DATA_TYPES.map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                              {!DATA_TYPES.includes(col.type.toUpperCase()) && (
                                <option value={col.type.toUpperCase()}>{col.type.toUpperCase()}</option>
                              )}
                            </select>
                          </div>

                          {/* Chevron Expand Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleColExpand(index);
                            }}
                            style={{
                              background: '#0d1117',
                              border: '1px solid #30363d',
                              color: isExpanded ? 'var(--accent)' : 'var(--text-secondary)',
                              padding: '6px 8px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title={isExpanded ? 'Collapse Form' : 'Expand Form'}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
                              <polyline points="6 9 12 15 18 9"/>
                            </svg>
                          </button>

                          {/* Delete Column Trashcan Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRequestDeleteColumn(index);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ff7b72',
                              cursor: 'pointer',
                              padding: '6px 8px',
                              display: 'flex',
                              alignItems: 'center',
                              opacity: 0.85
                            }}
                            title="Delete Column"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                          </button>
                        </div>

                        {/* ── Expanded Form Body (Vertical Clean Form) ────────────────────────── */}
                        {isExpanded && (
                          <div style={{
                            padding: 20,
                            background: '#0d1117',
                            borderTop: '1px solid #30363d',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 20
                          }}>
                            {/* Section 1: Basic Properties */}
                            <div>
                              <h5 style={{ margin: '0 0 12px 0', fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Basic Properties
                              </h5>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div>
                                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>
                                    Column Name
                                  </label>
                                  <input
                                    type="text"
                                    value={col.name}
                                    placeholder="e.g. student_id"
                                    onChange={e => handleColChange(index, 'name', e.target.value)}
                                    style={{
                                      width: '100%',
                                      background: '#161b22',
                                      border: '1px solid #30363d',
                                      color: 'white',
                                      padding: '10px 14px',
                                      borderRadius: 6,
                                      fontSize: '0.88rem',
                                      fontFamily: 'var(--font-mono)',
                                      outline: 'none'
                                    }}
                                  />
                                </div>

                                <div>
                                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>
                                    Data Type
                                  </label>
                                  <select
                                    value={col.type.toUpperCase()}
                                    onChange={e => handleColChange(index, 'type', e.target.value)}
                                    style={{
                                      width: '100%',
                                      background: '#161b22',
                                      border: '1px solid #30363d',
                                      color: 'white',
                                      padding: '10px 14px',
                                      borderRadius: 6,
                                      fontSize: '0.88rem',
                                      outline: 'none',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {DATA_TYPES.map(t => (
                                      <option key={t} value={t}>{t}</option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>
                                    Description (optional)
                                  </label>
                                  <input
                                    type="text"
                                    value={col.comment || ''}
                                    placeholder="Brief description of column usage..."
                                    onChange={e => handleColChange(index, 'comment', e.target.value)}
                                    style={{
                                      width: '100%',
                                      background: '#161b22',
                                      border: '1px solid #30363d',
                                      color: 'white',
                                      padding: '10px 14px',
                                      borderRadius: 6,
                                      fontSize: '0.88rem',
                                      outline: 'none'
                                    }}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Section 2: Constraints (Modern Checkbox Cards) */}
                            <div>
                              <h5 style={{ margin: '0 0 12px 0', fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Constraints
                              </h5>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                                
                                {/* Primary Key Card */}
                                <div 
                                  onClick={(e) => {
                                    if (e.target.tagName !== 'INPUT') {
                                      handleColChange(index, 'is_primary_key', !col.is_primary_key);
                                    }
                                  }}
                                  style={{
                                    background: col.is_primary_key ? 'rgba(31, 107, 235, 0.15)' : '#161b22',
                                    border: col.is_primary_key ? '1px solid #388bfd' : '1px solid #30363d',
                                    borderRadius: 8,
                                    padding: '12px 14px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  <input 
                                    type="checkbox" 
                                    checked={!!col.is_primary_key} 
                                    onChange={(e) => handleColChange(index, 'is_primary_key', e.target.checked)} 
                                    style={{ accentColor: '#388bfd', cursor: 'pointer' }} 
                                  />
                                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: col.is_primary_key ? '#58a6ff' : 'white' }}>
                                    Primary Key
                                  </span>
                                </div>

                                {/* NOT NULL Card */}
                                <div 
                                  onClick={(e) => {
                                    if (e.target.tagName !== 'INPUT') {
                                      handleColChange(index, 'nullable', !col.nullable);
                                    }
                                  }}
                                  style={{
                                    background: !col.nullable ? 'rgba(46, 160, 67, 0.15)' : '#161b22',
                                    border: !col.nullable ? '1px solid #2ea043' : '1px solid #30363d',
                                    borderRadius: 8,
                                    padding: '12px 14px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  <input 
                                    type="checkbox" 
                                    checked={!col.nullable} 
                                    onChange={(e) => handleColChange(index, 'nullable', !e.target.checked)} 
                                    style={{ accentColor: '#2ea043', cursor: 'pointer' }} 
                                  />
                                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: !col.nullable ? '#56d364' : 'white' }}>
                                    NOT NULL (Required)
                                  </span>
                                </div>

                                {/* Unique Card */}
                                <div 
                                  onClick={(e) => {
                                    if (e.target.tagName !== 'INPUT') {
                                      handleColChange(index, 'is_unique', !col.is_unique);
                                    }
                                  }}
                                  style={{
                                    background: col.is_unique ? 'rgba(210, 153, 34, 0.15)' : '#161b22',
                                    border: col.is_unique ? '1px solid #d29922' : '1px solid #30363d',
                                    borderRadius: 8,
                                    padding: '12px 14px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  <input 
                                    type="checkbox" 
                                    checked={!!col.is_unique} 
                                    onChange={(e) => handleColChange(index, 'is_unique', e.target.checked)} 
                                    style={{ accentColor: '#d29922', cursor: 'pointer' }} 
                                  />
                                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: col.is_unique ? '#e3b341' : 'white' }}>
                                    Unique
                                  </span>
                                </div>

                                {/* Indexed Card */}
                                <div 
                                  onClick={(e) => {
                                    if (e.target.tagName !== 'INPUT') {
                                      handleColChange(index, 'has_index', !col.has_index);
                                    }
                                  }}
                                  style={{
                                    background: col.has_index ? 'rgba(56, 139, 253, 0.15)' : '#161b22',
                                    border: col.has_index ? '1px solid #388bfd' : '1px solid #30363d',
                                    borderRadius: 8,
                                    padding: '12px 14px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  <input 
                                    type="checkbox" 
                                    checked={!!col.has_index} 
                                    onChange={(e) => handleColChange(index, 'has_index', e.target.checked)} 
                                    style={{ accentColor: '#388bfd', cursor: 'pointer' }} 
                                  />
                                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: col.has_index ? '#79c0ff' : 'white' }}>
                                    Indexed
                                  </span>
                                </div>

                              </div>
                            </div>

                            {/* Section 3: Advanced Settings (Collapsible Accordion) */}
                            <div style={{ borderTop: '1px solid #21262d', paddingTop: 16 }}>
                              <button
                                type="button"
                                onClick={() => toggleAdvancedCol(index)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--accent)',
                                  fontSize: '0.85rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: 0
                                }}
                              >
                                <span style={{ transition: 'transform 0.15s', transform: isAdvancedOpen ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>▶</span>
                                Advanced Settings
                              </button>

                              {isAdvancedOpen && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                                  {/* Default Value */}
                                  <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>
                                      Default Value
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="e.g. nextval('seq') or NOW() or 'active'"
                                      value={col.default_value}
                                      onChange={e => handleColChange(index, 'default_value', e.target.value)}
                                      style={{
                                        width: '100%', background: '#161b22', border: '1px solid #30363d',
                                        color: 'white', padding: '10px 14px', borderRadius: 6, fontSize: '0.88rem', outline: 'none'
                                      }}
                                    />
                                  </div>

                                  {/* Check Constraint */}
                                  <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>
                                      Check Constraint
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="e.g. price > 0 or status IN ('active', 'pending')"
                                      value={col.check_constraint}
                                      onChange={e => handleColChange(index, 'check_constraint', e.target.value)}
                                      style={{
                                        width: '100%', background: '#161b22', border: '1px solid #30363d',
                                        color: 'white', padding: '10px 14px', borderRadius: 6, fontSize: '0.88rem', outline: 'none'
                                      }}
                                    />
                                  </div>

                                  {/* Foreign Key */}
                                  <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>
                                      Foreign Key (References)
                                    </label>
                                    <select
                                      value={col.foreign_key_table && col.foreign_key_column ? `${col.foreign_key_table}.${col.foreign_key_column}` : ''}
                                      onChange={e => {
                                        const val = e.target.value;
                                        if (!val) {
                                          handleColChange(index, 'foreign_key_table', '');
                                          handleColChange(index, 'foreign_key_column', '');
                                        } else {
                                          const parts = val.split('.');
                                          const colPart = parts.pop();
                                          const tblPart = parts.join('.');
                                          handleColChange(index, 'foreign_key_table', tblPart);
                                          handleColChange(index, 'foreign_key_column', colPart);
                                        }
                                      }}
                                      style={{
                                        width: '100%', background: '#161b22', border: '1px solid #30363d',
                                        color: 'white', padding: '10px 14px', borderRadius: 6, fontSize: '0.88rem', outline: 'none', cursor: 'pointer'
                                      }}
                                    >
                                      <option value="">None (No reference)</option>
                                      {getFkOptions().map(opt => (
                                        <option key={`${opt.fqn}.${opt.col}`} value={`${opt.fqn}.${opt.col}`}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Section 4: SQL DDL Preview */}
                            <div style={{ borderTop: '1px solid #21262d', paddingTop: 16 }}>
                              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                SQL DDL Preview
                              </span>
                              <pre style={{
                                margin: 0,
                                padding: '10px 14px',
                                background: '#040d21',
                                border: '1px solid #1f293d',
                                borderRadius: 6,
                                color: '#79c0ff',
                                fontSize: '0.82rem',
                                fontFamily: 'var(--font-mono)',
                                whiteSpace: 'pre-wrap'
                              }}>
                                {generateColumnSql(col)}
                              </pre>
                            </div>

                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Dashed Add Column Button Card */}
                  <div
                    onClick={handleAddNewColumnInline}
                    style={{
                      flexShrink: 0,
                      minHeight: 52,
                      border: '1px dashed var(--accent)',
                      background: 'rgba(47, 129, 247, 0.03)',
                      borderRadius: 10,
                      padding: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: 'var(--accent)',
                      fontWeight: 600,
                      fontSize: '0.88rem',
                      gap: 8,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add Column
                  </div>
                </div>

                {/* Footer bar under columns */}
                <div style={{
                  flexShrink: 0,
                  padding: '6px 16px',
                  borderTop: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.78rem',
                  color: 'var(--text-secondary)',
                  background: '#0d1117'
                }}>
                  <span>💡 Tip: Drag and drop to reorder columns</span>
                  <span>{editableCols.length} columns defined</span>
                </div>
              </div>
            </div>
          )}

          {/* Relationship Designer View */}
          {activeTab === 'relations' && (
            <div 
              id="relationship-board"
              style={{ 
                flex: 1, 
                overflow: 'auto', 
                position: 'relative', 
                padding: 30, 
                background: 'radial-gradient(circle, rgba(255,255,255,0.015) 1px, transparent 1px)', 
                backgroundSize: '24px 24px' 
              }}
            >
              <svg 
                style={{ 
                  position: 'absolute', 
                  top: 0, 
                  left: 0, 
                  width: '100%', 
                  height: '100%', 
                  pointerEvents: 'none', 
                  zIndex: 5 
                }}
              >
                {connections.map((conn, idx) => {
                  const isHovered = hoveredFk && hoveredFk.srcTable === conn.srcTable && hoveredFk.srcCol === conn.srcCol;
                  return (
                    <g key={idx}>
                      <path
                        d={`M ${conn.x1} ${conn.y1} C ${(conn.x1 + conn.x2) / 2} ${conn.y1}, ${(conn.x1 + conn.x2) / 2} ${conn.y2}, ${conn.x2} ${conn.y2}`}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="12"
                        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                        onMouseEnter={() => setHoveredFk(conn)}
                        onMouseLeave={() => setHoveredFk(null)}
                        onClick={() => handleRequestDropFk(conn)}
                      />
                      <path
                        d={`M ${conn.x1} ${conn.y1} C ${(conn.x1 + conn.x2) / 2} ${conn.y1}, ${(conn.x1 + conn.x2) / 2} ${conn.y2}, ${conn.x2} ${conn.y2}`}
                        fill="none"
                        stroke={isHovered ? 'var(--danger)' : 'var(--accent)'}
                        strokeWidth={isHovered ? 3 : 2}
                        strokeDasharray={isHovered ? '4 2' : 'none'}
                        style={{ transition: 'stroke 0.2s, stroke-width 0.2s' }}
                      />
                      <circle cx={conn.x1} cy={conn.y1} r="4" fill={isHovered ? 'var(--danger)' : 'var(--accent)'} />
                      <circle cx={conn.x2} cy={conn.y2} r="4" fill={isHovered ? 'var(--danger)' : 'var(--accent)'} />
                    </g>
                  );
                })}
              </svg>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, zIndex: 10, position: 'relative' }}>
                {tables.map(t => (
                  <div 
                    key={t.qualified_name}
                    className="glass-panel"
                    style={{ 
                      width: 240, 
                      display: 'flex', 
                      flexDirection: 'column', 
                      padding: 0,
                      border: '1px solid rgba(255,255,255,0.08)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
                    }}
                  >
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)', borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>
                        </svg>
                        {t.name}
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t.schema}</span>
                    </div>

                    <div style={{ padding: 6, display: 'flex', flexDirection: 'column' }}>
                      {t.columns.map(c => {
                        const isSrcSelected = selectedSource && selectedSource.fqn === t.qualified_name && selectedSource.colName === c.name;
                        const hasFk = c.foreign_table && c.foreign_column;
                        
                        return (
                          <div
                            key={c.name}
                            id={`col-node-${t.qualified_name}-${c.name}`}
                            onClick={() => handleSelectRelationNode(t.qualified_name, c.name, c.type)}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '6px 10px',
                              borderRadius: 4,
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              background: isSrcSelected 
                                ? 'rgba(47, 129, 247, 0.2)' 
                                : hasFk 
                                ? 'rgba(255,255,255,0.02)' 
                                : 'transparent',
                              color: isSrcSelected 
                                ? 'var(--accent)' 
                                : 'var(--text-primary)',
                              border: isSrcSelected 
                                ? '1px solid var(--accent)' 
                                : '1px solid transparent',
                              marginBottom: 2,
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: c.is_pk ? 600 : 400 }}>
                              {c.is_pk && <span style={{ color: '#f1e05a', fontSize: '0.75rem' }}>🔑</span>}
                              {c.name}
                            </span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                              {c.type.toLowerCase()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* History Timeline View */}
          {activeTab === 'history' && (
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: 24, gap: 20 }}>
              <div className="glass-panel" style={{ flex: 1.2, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 20 }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {selectedTable ? `${selectedTable.qualified_name} Schema Versions` : 'Version Timeline'}
                </h3>
                
                {!selectedTable ? (
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Please select a schema from the sidebar to inspect version history.
                  </div>
                ) : versionsList.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    No version entries recorded yet. Modify the schema to create history.
                  </div>
                ) : (
                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, paddingRight: 8 }}>
                    {versionsList.map(v => (
                      <div 
                        key={v.version}
                        className="glass-panel"
                        style={{ 
                          padding: 16, 
                          border: selectedVersionForCompare?.version === v.version ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                          background: selectedVersionForCompare?.version === v.version ? 'rgba(47, 129, 247, 0.05)' : 'rgba(255,255,255,0.01)',
                          borderRadius: 8,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                          transition: 'border 0.2s'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent)' }}>
                            Version v{v.version}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {new Date(v.created_at).toLocaleString()}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                          {v.summary}
                        </div>

                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Author: <strong style={{ color: 'var(--text-primary)' }}>{v.author}</strong>
                        </div>

                        <details style={{ background: 'rgba(0,0,0,0.2)', padding: 8, borderRadius: 4, border: '1px solid rgba(255,255,255,0.03)' }}>
                          <summary style={{ fontSize: '0.75rem', color: 'var(--accent)', cursor: 'pointer', outline: 'none' }}>
                            Show SQL DDL statements
                          </summary>
                          <pre style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', color: '#ff7b72', marginTop: 6, margin: 0, padding: 8, background: '#0d1117', borderRadius: 4 }}>
                            {v.ddl}
                          </pre>
                        </details>

                        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                          <button
                            type="button"
                            onClick={() => setSelectedVersionForCompare(v)}
                            className="btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                            </svg>
                            Compare Schema
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestoreVersion(v.version)}
                            className="btn-primary"
                            style={{ padding: '6px 12px', fontSize: '0.75rem', background: 'var(--success)' }}
                          >
                            Restore Version
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="glass-panel" style={{ flex: 1.5, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 20 }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 3h5v5M4 20L20.2 3.8M21 16v5h-5M4 4l16.2 16.2"/>
                  </svg>
                  Schema Diff Comparison
                </h3>

                {selectedVersionForCompare ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                      Comparing <strong style={{ color: 'var(--accent)' }}>v{selectedVersionForCompare.version} snapshot</strong> columns with <strong style={{ color: 'white' }}>Current</strong> columns:
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 8 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                            <th style={{ padding: 6 }}>COLUMN</th>
                            <th style={{ padding: 6 }}>v{selectedVersionForCompare.version} TYPE</th>
                            <th style={{ padding: 6 }}>CURRENT TYPE</th>
                            <th style={{ padding: 6 }}>CONSTRAINTS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const snapCols = selectedVersionForCompare.snapshot || [];
                            const snapMap = {};
                            snapCols.forEach(c => { snapMap[c.name.toLowerCase()] = c; });
                            
                            const currCols = selectedTable.columns || [];
                            const currMap = {};
                            currCols.forEach(c => { currMap[c.name.toLowerCase()] = c; });
                            
                            const allColNames = Array.from(new Set([
                              ...snapCols.map(c => c.name.toLowerCase()),
                              ...currCols.map(c => c.name.toLowerCase())
                            ]));

                            return allColNames.map(colName => {
                              const snap = snapMap[colName];
                              const curr = currMap[colName];
                              
                              let statusColor = 'var(--text-primary)';
                              let badgeText = 'UNCHANGED';
                              if (snap && !curr) {
                                statusColor = '#ff7b72';
                                badgeText = 'REMOVED IN CURRENT';
                              } else if (!snap && curr) {
                                statusColor = '#56d364';
                                badgeText = 'ADDED IN CURRENT';
                              } else if (snap && curr && snap.type !== curr.type) {
                                statusColor = '#d29922';
                                badgeText = 'TYPE MODIFIED';
                              }

                              return (
                                <tr key={colName} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                  <td style={{ padding: '8px 6px', fontWeight: 600, color: statusColor }}>
                                    {colName}
                                    <span style={{ fontSize: '0.65rem', marginLeft: 6, opacity: 0.7 }}>({badgeText})</span>
                                  </td>
                                  <td style={{ padding: '8px 6px', fontFamily: 'var(--font-mono)' }}>
                                    {snap ? snap.type : '-'}
                                  </td>
                                  <td style={{ padding: '8px 6px', fontFamily: 'var(--font-mono)' }}>
                                    {curr ? curr.type : '-'}
                                  </td>
                                  <td style={{ padding: '8px 6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    {curr ? (
                                      <span>
                                        {curr.is_pk && 'PK '}
                                        {!curr.nullable && 'NOT NULL '}
                                        {curr.is_unique && 'UNIQUE '}
                                        {curr.foreign_table && `FK(${curr.foreign_table}.${curr.foreign_column}) `}
                                      </span>
                                    ) : (
                                      <span>-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Click "Compare Schema" on any version card in the timeline to view side-by-side differences.
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Create Table Modal */}
      {showCreateModal && (
        <div className="modal-overlay" style={{ zIndex: 100 }}>
          <div className="modal-content glass-panel" style={{ width: 680, padding: 24, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Create New Database Table</h3>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">&times;</button>
            </div>

            {wizardStep === 1 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 16, borderBottom: '1px solid var(--border-color)', paddingBottom: 12 }}>
                  <button
                    type="button"
                    onClick={() => setCreateMethod('manual')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      borderBottom: createMethod === 'manual' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: createMethod === 'manual' ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: 600,
                      padding: '6px 12px',
                      cursor: 'pointer'
                    }}
                  >
                    ✍️ Manual Definition
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateMethod('ai')}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      borderBottom: createMethod === 'ai' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: createMethod === 'ai' ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: 600,
                      padding: '6px 12px',
                      cursor: 'pointer'
                    }}
                  >
                    ✨ AI Schema Assistant
                  </button>
                </div>

                {createMethod === 'manual' ? (
                  <form onSubmit={handleStep1Submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 6, color: 'var(--text-secondary)' }}>
                        Table Name (Fully Qualified Name - FQN)
                      </label>
                      <input
                        type="text"
                        value={newTableFqn}
                        onChange={e => setNewTableFqn(e.target.value)}
                        placeholder="e.g. public.orders"
                        style={{
                          width: '100%',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid var(--border-color)',
                          color: 'white',
                          padding: '10px 14px',
                          borderRadius: 6,
                          outline: 'none',
                          fontSize: '0.9rem',
                          fontFamily: 'var(--font-mono)'
                        }}
                        autoFocus
                      />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                        Default schema is <code>public</code>. Format: <code>schema.table</code>
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
                      <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
                      <button type="submit" className="btn-primary">Next: Configure Columns &rarr;</button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleGenerateAISchema} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 6, color: 'var(--text-secondary)' }}>
                        Describe what table you want to build in natural language:
                      </label>
                      <textarea
                        rows={4}
                        value={aiPrompt}
                        onChange={e => setAiPrompt(e.target.value)}
                        placeholder="e.g. Create an inventory table for tracking tiles with product name, size, finish type, stock boxes, price per box, and warehouse location."
                        style={{
                          width: '100%',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid var(--border-color)',
                          color: 'white',
                          padding: '10px 14px',
                          borderRadius: 6,
                          outline: 'none',
                          fontSize: '0.9rem',
                          fontFamily: 'var(--font-sans)',
                          resize: 'vertical'
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                      <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
                      <button type="submit" disabled={aiGenerating} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {aiGenerating ? (
                          <>
                            <span className="spin">⚡</span> Generating Schema with AI...
                          </>
                        ) : (
                          <>✨ Generate Schema Proposal</>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <form onSubmit={handleCreateTableSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ marginBottom: 16 }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Designing schema for table:</span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{newTableFqn}</div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', paddingRight: 6, marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Initial Column Definitions:</span>
                    <button type="button" onClick={handleAddColToNewTable} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                      + Add Column
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {newTableCols.map((col, i) => (
                      <div key={i} style={{ background: '#161b22', border: '1px solid #30363d', padding: 12, borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="column_name"
                            value={col.name}
                            onChange={e => handleNewTableColChange(i, 'name', e.target.value)}
                            style={{ flex: 1, background: '#0d1117', border: '1px solid #30363d', color: 'white', padding: '6px 10px', borderRadius: 4, fontSize: '0.85rem' }}
                          />
                          <select
                            value={col.type.toUpperCase()}
                            onChange={e => handleNewTableColChange(i, 'type', e.target.value)}
                            style={{ width: 140, background: '#0d1117', border: '1px solid #30363d', color: 'white', padding: '6px 10px', borderRadius: 4, fontSize: '0.85rem', cursor: 'pointer' }}
                          >
                            {DATA_TYPES.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                          {newTableCols.length > 1 && (
                            <button type="button" onClick={() => handleRemoveColFromNewTable(i)} style={{ background: 'none', border: 'none', color: '#ff7b72', cursor: 'pointer', fontSize: '1.1rem' }}>
                              &times;
                            </button>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 16, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                            <input type="checkbox" checked={col.is_primary_key} onChange={e => handleNewTableColChange(i, 'is_primary_key', e.target.checked)} /> Primary Key
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                            <input type="checkbox" checked={!col.nullable} onChange={e => handleNewTableColChange(i, 'nullable', !e.target.checked)} /> NOT NULL
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                            <input type="checkbox" checked={col.is_unique} onChange={e => handleNewTableColChange(i, 'is_unique', e.target.checked)} /> Unique
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
                  <button type="button" onClick={() => setWizardStep(1)} className="btn-secondary">&larr; Back</button>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
                    <button type="submit" disabled={loading} className="btn-primary">
                      {loading ? 'Creating Table...' : '🚀 Create Table Now'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Safety Deletion Modal */}
      {showDeleteConfirmModal && safetyReport && (
        <div className="modal-overlay" style={{ zIndex: 110 }}>
          <div className="modal-content glass-panel" style={{ width: 520, padding: 24 }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#ff7b72', display: 'flex', alignItems: 'center', gap: 8 }}>
              ⚠️ Confirm {deleteType === 'table' ? 'Table' : 'Column'} Deletion
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: 8 }}>
              Target: <strong style={{ color: 'white' }}>{deleteType === 'table' ? selectedTable?.qualified_name : `${selectedTable?.qualified_name}.${deleteColName}`}</strong>
            </p>

            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', borderRadius: 6, padding: 14, margin: '16px 0', fontSize: '0.85rem' }}>
              <div style={{ marginBottom: 6, fontWeight: 600 }}>Safety Inspection Report:</div>
              <ul style={{ paddingLeft: 18, margin: 0, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>Row count / values present: <strong style={{ color: safetyReport.has_data ? '#ff7b72' : '#56d364' }}>{safetyReport.row_count}</strong></li>
                <li>Dependent Foreign Keys: <strong style={{ color: safetyReport.dependent_fks.length > 0 ? '#ff7b72' : '#56d364' }}>{safetyReport.dependent_fks.length}</strong></li>
                <li>Active Indexes: <strong>{safetyReport.indexes.length}</strong></li>
              </ul>
            </div>

            {safetyReport.warnings && safetyReport.warnings.length > 0 && (
              <div style={{ background: 'rgba(218, 54, 51, 0.15)', color: '#ff7b72', padding: 12, borderRadius: 6, fontSize: '0.82rem', marginBottom: 16 }}>
                {safetyReport.warnings.join(' ')}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setShowDeleteConfirmModal(false)} className="btn-secondary">Cancel</button>
              <button 
                onClick={handleConfirmDelete} 
                disabled={!safetyReport.safe}
                className="btn-primary" 
                style={{ background: safetyReport.safe ? 'var(--danger)' : '#444', cursor: safetyReport.safe ? 'pointer' : 'not-allowed' }}
              >
                {safetyReport.safe ? `Confirm Drop ${deleteType === 'table' ? 'Table' : 'Column'}` : 'Blocked by Foreign Keys'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SchemaDesigner;
