import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const DATA_TYPES = [
  'VARCHAR',
  'VARCHAR(255)',
  'TEXT',
  'INTEGER',
  'BIGINT',
  'BOOLEAN',
  'DECIMAL(10,2)',
  'NUMERIC',
  'TIMESTAMP',
  'DATE'
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

  // Safety Deletion Modals
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleteType, setDeleteType] = useState('table'); // 'table' or 'column'
  const [deleteColName, setDeleteColName] = useState('');
  const [safetyReport, setSafetyReport] = useState(null);

  // Visual Relationship Designer states
  const [activeTab, setActiveTab] = useState('designer'); // 'designer' or 'relations'
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
    const numTypes = ['INTEGER', 'BIGINT', 'SERIAL', 'NUMERIC', 'DECIMAL', 'INT', 'SMALLINT'];
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
      const cols = selectedTable.columns.map(c => ({
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
      }));
      setEditableCols(cols);
      setIsDirty(false);
    } else {
      setEditableCols([]);
      setIsDirty(false);
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
        // Keep selected table updated
        const found = data.find(t => t.qualified_name === selectedTable.qualified_name);
        if (found) setSelectedTable(found);
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
      // Reset form
      setCreateMethod('manual');
      setAiPrompt('');
      setNewTableFqn('public.');
      setNewTableCols([
        { name: 'id', type: 'SERIAL', nullable: false, is_primary_key: true, is_unique: false, default_value: '' }
      ]);
      setWizardStep(1);
      // Refresh list and select the new table
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
    setEditableCols(updated);
    setIsDirty(true);
  };

  const handleAddNewColumnInline = () => {
    setEditableCols([
      ...editableCols,
      {
        name: '',
        type: 'VARCHAR',
        nullable: true,
        is_primary_key: false,
        is_unique: false,
        default_value: '',
        original_name: null
      }
    ]);
    setIsDirty(true);
  };

  const handleRemoveColumn = (index) => {
    const col = editableCols[index];
    if (col.is_primary_key) {
      showNotification('Cannot remove Primary Key columns', true);
      return;
    }
    const updated = editableCols.filter((_, i) => i !== index);
    setEditableCols(updated);
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
    
    // If it's a new column (not committed yet), just remove it inline
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
    const confirmMsg = `Are you sure you want to restore the schema of ${selectedTable.qualified_name} to version v${versionNumber}? This will execute transactional DDL statements to match the columns layout.`;
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
    const lines = [];
    if (tables) {
      tables.forEach(t => {
        if (t.columns) {
          t.columns.forEach(c => {
            if (c.foreign_table && c.foreign_column) {
              const srcEl = document.getElementById(`col-node-${t.qualified_name}-${c.name}`);
              const destEl = document.getElementById(`col-node-${c.foreign_table}-${c.foreign_column}`);
              const boardEl = document.getElementById('relationship-board');
              if (srcEl && destEl && boardEl) {
                const srcRect = srcEl.getBoundingClientRect();
                const destRect = destEl.getBoundingClientRect();
                const boardRect = boardEl.getBoundingClientRect();

                lines.push({
                  x1: srcRect.left + srcRect.width / 2 - boardRect.left,
                  y1: srcRect.top + srcRect.height / 2 - boardRect.top,
                  x2: destRect.left + destRect.width / 2 - boardRect.left,
                  y2: destRect.top + destRect.height / 2 - boardRect.top,
                  srcTable: t.qualified_name,
                  srcCol: c.name,
                  destTable: c.foreign_table,
                  destCol: c.foreign_column
                });
              }
            }
          });
        }
      });
    }
    setConnections(lines);
  };

  useEffect(() => {
    if (activeTab === 'relations') {
      const handleResize = () => calculateConnections();
      window.addEventListener('resize', handleResize);
      
      const timeout = setTimeout(calculateConnections, 200);
      
      return () => {
        window.removeEventListener('resize', handleResize);
        clearTimeout(timeout);
      };
    }
  }, [activeTab, tables]);

  const handleSelectRelationNode = async (fqn, colName, type) => {
    if (!selectedSource) {
      setSelectedSource({ fqn, colName, type });
      showNotification(`Selected source: ${fqn}.${colName}. Now click target primary key column.`);
    } else {
      const source = selectedSource;
      setSelectedSource(null);

      if (source.fqn === fqn) {
        showNotification('Cannot create relationship within the same table.', true);
        return;
      }

      if (!areTypesCompatible(source.type, type)) {
        showNotification(`Incompatible datatypes: Cannot reference ${type} from ${source.type}.`, true);
        return;
      }

      if (createsCircularDependency(source.fqn, fqn)) {
        showNotification(`Circular Dependency Blocked: Referencing ${fqn} from ${source.fqn} would create a circular reference loop.`, true);
        return;
      }

      const confirmMsg = `Create Foreign Key relationship from ${source.fqn}.${source.colName} referencing ${fqn}.${colName}?`;
      if (window.confirm(confirmMsg)) {
        setLoading(true);
        try {
          const srcTableMeta = tables.find(t => t.qualified_name === source.fqn);
          if (!srcTableMeta) throw new Error(`Table ${source.fqn} not found`);
          
          const updatedCols = srcTableMeta.columns.map(c => {
            const isTargetCol = c.name.toLowerCase() === source.colName.toLowerCase();
            return {
              name: c.name,
              type: c.type,
              nullable: c.nullable,
              is_primary_key: c.is_pk,
              is_unique: c.is_unique,
              default_value: c.default_value || '',
              original_name: c.name,
              check_constraint: c.check_constraint || '',
              foreign_key_table: isTargetCol ? fqn : (c.foreign_table || ''),
              foreign_key_column: isTargetCol ? colName : (c.foreign_column || ''),
              has_index: c.has_index || false
            };
          });

          await api.alterTable(source.fqn, updatedCols);
          showNotification('Foreign Key constraint created successfully!');
          await fetchTables();
        } catch (err) {
          showNotification(err.message, true);
        } finally {
          setLoading(false);
        }
      }
    }
  };

  const handleRequestDropFk = async (conn) => {
    const confirmMsg = `Drop Foreign Key relationship: ${conn.srcTable}.${conn.srcCol} ──> ${conn.destTable}.${conn.destCol}?`;
    if (window.confirm(confirmMsg)) {
      setLoading(true);
      try {
        const srcTableMeta = tables.find(t => t.qualified_name === conn.srcTable);
        if (!srcTableMeta) throw new Error(`Table ${conn.srcTable} not found`);

        const updatedCols = srcTableMeta.columns.map(c => {
          const isTargetCol = c.name.toLowerCase() === conn.srcCol.toLowerCase();
          return {
            name: c.name,
            type: c.type,
            nullable: c.nullable,
            is_primary_key: c.is_pk,
            is_unique: c.is_unique,
            default_value: c.default_value || '',
            original_name: c.name,
            check_constraint: c.check_constraint || '',
            foreign_key_table: isTargetCol ? '' : (c.foreign_table || ''),
            foreign_key_column: isTargetCol ? '' : (c.foreign_column || ''),
            has_index: c.has_index || false
          };
        });

        await api.alterTable(conn.srcTable, updatedCols);
        showNotification('Foreign Key constraint dropped successfully.');
        await fetchTables();
      } catch (err) {
        showNotification(err.message, true);
      } finally {
        setLoading(false);
      }
    }
  };

  const filteredTables = tables.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.schema.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="schema-designer-container" style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      {/* Table List Sidebar */}
      <aside className="designer-sidebar" style={{ width: 280, borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', background: 'rgba(22, 27, 34, 0.4)' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button 
            className="btn-primary" 
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => {
              setWizardStep(1);
              setNewTableFqn('public.');
              setNewTableCols([
                { name: 'id', type: 'SERIAL', nullable: false, is_primary_key: true, is_unique: false, default_value: '' }
              ]);
              setCreateMethod('manual');
              setAiPrompt('');
              setShowCreateModal(true);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Create Table
          </button>
          <input
            type="text"
            className="designer-search"
            placeholder="Filter tables..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--panel-bg)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              padding: '8px 12px',
              borderRadius: 6,
              outline: 'none',
              fontSize: '0.9rem'
            }}
          />
        </div>

        <div className="designer-tables-list" style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {filteredTables.map(t => (
            <div
              key={t.qualified_name}
              onClick={() => setSelectedTable(t)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: 6,
                cursor: 'pointer',
                marginBottom: 4,
                background: selectedTable?.qualified_name === t.qualified_name ? 'rgba(47, 129, 247, 0.15)' : 'transparent',
                color: selectedTable?.qualified_name === t.qualified_name ? 'var(--accent)' : 'var(--text-primary)',
                border: selectedTable?.qualified_name === t.qualified_name ? '1px solid var(--accent)' : '1px solid transparent',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <span style={{ fontWeight: 500, fontSize: '0.95rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {t.name}
                </span>
                <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                  {t.schema}
                </span>
              </div>
              <span style={{ fontSize: '0.75rem', opacity: 0.5, background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4 }}>
                {t.columns.length} cols
              </span>
            </div>
          ))}
          {filteredTables.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              No tables found
            </div>
          )}
        </div>
      </aside>

      {/* Main Column Editor */}
      <section className="designer-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {/* Workspace Tab Bar */}
        <div style={{ display: 'flex', background: 'rgba(22, 27, 34, 0.6)', borderBottom: '1px solid var(--border-color)', padding: '0 20px', gap: 10 }}>
          <button
            onClick={() => setActiveTab('designer')}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'designer' ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === 'designer' ? 'var(--accent)' : 'var(--text-secondary)',
              padding: '14px 16px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'relations' ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === 'relations' ? 'var(--accent)' : 'var(--text-secondary)',
              padding: '14px 16px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            Relationship Designer
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'history' ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === 'history' ? 'var(--accent)' : 'var(--text-secondary)',
              padding: '14px 16px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Version History
          </button>
        </div>

        {/* Floating Save Changes Banner */}
        {isDirty && (
          <div style={{
            background: 'rgba(47, 129, 247, 0.15)',
            color: 'white',
            borderBottom: '1px solid var(--accent)',
            padding: '12px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.9rem',
            animation: 'fadeIn 0.15s ease-out'
          }}>
            <span>⚠️ You have unsaved changes in this schema.</span>
            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                onClick={() => {
                  if (selectedTable) {
                    const cols = selectedTable.columns.map(c => ({
                      name: c.name,
                      type: c.type,
                      nullable: c.nullable,
                      is_primary_key: c.is_pk,
                      is_unique: c.is_unique,
                      default_value: c.default_value || '',
                      original_name: c.name
                    }));
                    setEditableCols(cols);
                    setIsDirty(false);
                  }
                }} 
                className="btn-secondary" 
                style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)' }}
              >
                Discard
              </button>
              <button 
                onClick={handleSaveChanges} 
                className="btn-primary" 
                style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'var(--success)' }}
              >
                Save Changes
              </button>
            </div>
          </div>
        )}
        {/* Banner Messages */}
        {error && (
          <div style={{ background: 'rgba(218, 54, 51, 0.15)', color: '#ff7b72', borderBottom: '1px solid var(--danger)', padding: '12px 24px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>⚠️</span> {error}
          </div>
        )}
        {success && (
          <div style={{ background: 'rgba(35, 134, 54, 0.15)', color: '#56d364', borderBottom: '1px solid var(--success)', padding: '12px 24px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>✅</span> {success}
          </div>
        )}

        {activeTab === 'history' ? (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: 24, gap: 20 }}>
            {/* Version List Timeline */}
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

            {/* Comparison Side-by-side Panel */}
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
                          ])).sort();

                          return allColNames.map(name => {
                            const snap = snapMap[name];
                            const curr = currMap[name];
                            const hasDiff = !snap || !curr || snap.type !== curr.type || snap.nullable !== curr.nullable || snap.is_pk !== curr.is_pk;

                            return (
                              <tr 
                                key={name}
                                style={{ 
                                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                                  background: !snap 
                                    ? 'rgba(46, 160, 67, 0.1)' 
                                    : !curr 
                                    ? 'rgba(248, 81, 73, 0.1)' 
                                    : hasDiff 
                                    ? 'rgba(240, 135, 0, 0.08)' 
                                    : 'transparent'
                                }}
                              >
                                <td style={{ padding: '8px 6px', fontWeight: 600 }}>
                                  {name} {!snap && ' [Added]'} {!curr && ' [Removed]'}
                                </td>
                                <td style={{ padding: '8px 6px', fontFamily: 'var(--font-mono)' }}>
                                  {snap ? snap.type.toLowerCase() : '-'}
                                </td>
                                <td style={{ padding: '8px 6px', fontFamily: 'var(--font-mono)' }}>
                                  {curr ? curr.type.toLowerCase() : '-'}
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
        ) : activeTab === 'relations' ? (
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
            {/* SVG Connection Lines Overlay */}
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

            {/* Visual Board Cards Container */}
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
                  {/* Table Header */}
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)', borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>
                      </svg>
                      {t.name}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t.schema}</span>
                  </div>

                  {/* Columns List inside Card */}
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

            {/* Instruction tooltip banner */}
            <div style={{ marginTop: 30, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '14px 20px', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, maxWidth: 600 }}>
              <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>Visual Relationship Designer Guide:</strong>
              <ul style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>Click a column in any card to select it as the <strong>Source Column</strong> (Foreign Key field).</li>
                <li>Click another compatible column in a different card to select it as the <strong>Target Column</strong> (Referenced Primary Key/Unique field).</li>
                <li>Hover over any relationship connection line and click to <strong>Drop/Remove</strong> the constraint.</li>
              </ul>
            </div>
          </div>
        ) : selectedTable ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 24 }}>
            {/* Table Details Banner */}
            <div className="glass-panel" style={{ padding: 20, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>
                  </svg>
                  {selectedTable.qualified_name}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4 }}>
                  {selectedTable.description || 'No description provided for this schema.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Estimated Rows</span>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{selectedTable.row_count_approx ?? '0'}</div>
                </div>
                <button
                  onClick={() => handleRequestDeleteTable(selectedTable.qualified_name)}
                  style={{
                    background: 'rgba(218, 54, 51, 0.15)',
                    border: '1px solid var(--danger)',
                    color: '#ff7b72',
                    padding: '8px 12px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                  title="Drop Table"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                  Drop Table
                </button>
              </div>
            </div>

            {/* Columns Table */}
            <div className="glass-panel" style={{ flex: 1, overflowY: 'auto', marginBottom: 20, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Columns Schema Setup</span>
                <button 
                  onClick={handleAddNewColumnInline} 
                  className="btn-primary" 
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                >
                  + Add Column
                </button>
              </div>
              <div style={{ overflowX: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      <th style={{ padding: '12px 20px', width: '30%' }}>COLUMN NAME</th>
                      <th style={{ padding: '12px 20px', width: '25%' }}>DATA TYPE</th>
                      <th style={{ padding: '12px 20px', width: '35%' }}>CONSTRAINTS & DEFAULTS</th>
                      <th style={{ padding: '12px 20px', textAlign: 'right', width: '10%' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editableCols.map((col, index) => (
                      <tr 
                        key={index} 
                        style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '0.9rem', color: 'var(--text-primary)' }}
                      >
                        <td style={{ padding: '12px 20px' }}>
                          <input
                            type="text"
                            value={col.name}
                            placeholder="column_name"
                            onChange={e => handleColChange(index, 'name', e.target.value)}
                            style={{
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid var(--border-color)',
                              color: 'white',
                              padding: '6px 10px',
                              borderRadius: 4,
                              outline: 'none',
                              fontSize: '0.85rem',
                              width: '90%'
                            }}
                          />
                        </td>
                        <td style={{ padding: '12px 20px' }}>
                          <select
                            value={col.type.toUpperCase()}
                            onChange={e => handleColChange(index, 'type', e.target.value)}
                            style={{
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-primary)',
                              padding: '6px 10px',
                              borderRadius: 4,
                              outline: 'none',
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                              width: '90%'
                            }}
                          >
                            {!DATA_TYPES.includes(col.type.toUpperCase()) && (
                              <option value={col.type.toUpperCase()}>{col.type.toUpperCase()}</option>
                            )}
                            {DATA_TYPES.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '12px 20px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={col.is_primary_key || false}
                                  disabled={col.original_name !== null}
                                  onChange={e => {
                                    handleColChange(index, 'is_primary_key', e.target.checked);
                                    if (e.target.checked) {
                                      handleColChange(index, 'nullable', false);
                                    }
                                  }}
                                />
                                PK
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={col.nullable !== false}
                                  disabled={col.is_primary_key}
                                  onChange={e => handleColChange(index, 'nullable', e.target.checked)}
                                />
                                NULL
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={col.is_unique || false}
                                  onChange={e => handleColChange(index, 'is_unique', e.target.checked)}
                                />
                                UNIQ
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={col.has_index || false}
                                  onChange={e => handleColChange(index, 'has_index', e.target.checked)}
                                />
                                INDEX
                              </label>
                            </div>
                            
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                              <input
                                type="text"
                                placeholder="Default value (None)"
                                value={col.default_value || ''}
                                onChange={e => handleColChange(index, 'default_value', e.target.value)}
                                style={{
                                  background: 'rgba(255,255,255,0.03)',
                                  border: '1px solid var(--border-color)',
                                  color: 'white',
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  outline: 'none',
                                  fontSize: '0.8rem',
                                  flex: 1
                                }}
                              />
                              <input
                                type="text"
                                placeholder="CHECK (e.g. price > 0)"
                                value={col.check_constraint || ''}
                                onChange={e => handleColChange(index, 'check_constraint', e.target.value)}
                                style={{
                                  background: 'rgba(255,255,255,0.03)',
                                  border: '1px solid var(--border-color)',
                                  color: 'white',
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  outline: 'none',
                                  fontSize: '0.8rem',
                                  flex: 1.2
                                }}
                              />
                              <select
                                value={col.foreign_key_table && col.foreign_key_column ? `${col.foreign_key_table}.${col.foreign_key_column}` : ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (!val) {
                                    handleColChange(index, 'foreign_key_table', '');
                                    handleColChange(index, 'foreign_key_column', '');
                                  } else {
                                    const opt = getFkOptions().find(o => `${o.fqn}.${o.col}` === val);
                                    if (opt) {
                                      handleColChange(index, 'foreign_key_table', opt.fqn);
                                      handleColChange(index, 'foreign_key_column', opt.col);
                                    }
                                  }
                                }}
                                style={{
                                  background: 'rgba(255,255,255,0.03)',
                                  border: '1px solid var(--border-color)',
                                  color: 'white',
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  outline: 'none',
                                  fontSize: '0.8rem',
                                  cursor: 'pointer',
                                  flex: 1.5
                                }}
                              >
                                <option value="">References... (None)</option>
                                {getFkOptions().map(o => (
                                  <option key={`${o.fqn}.${o.col}`} value={`${o.fqn}.${o.col}`}>
                                    Ref: {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleRequestDeleteColumn(index)}
                            disabled={col.is_primary_key}
                            style={{
                              color: col.is_primary_key ? 'rgba(255,255,255,0.1)' : 'var(--danger)',
                              cursor: col.is_primary_key ? 'not-allowed' : 'pointer',
                              padding: 6,
                              borderRadius: 4
                            }}
                            title={col.is_primary_key ? "Cannot drop Primary Key" : "Remove column"}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>


          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)', padding: 48 }}>
            <div style={{ padding: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', marginBottom: 16 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>
              </svg>
            </div>
            <h2>Schema Designer Workspace</h2>
            <p style={{ marginTop: 8, maxWidth: 450, textAlign: 'center', fontSize: '0.9rem', lineHeight: 1.4 }}>
              Select an existing table from the sidebar list to inspect and edit its structure visually, or create an entirely new table.
            </p>
          </div>
        )}
      </section>

      {/* Create Table Modal overlay */}
      {showCreateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="glass-panel" style={{ width: wizardStep === 1 ? 500 : 800, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 24, animation: 'fadeIn 0.2s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                Create Table Schema (Step {wizardStep} of 2)
              </h3>
              <button onClick={() => setShowCreateModal(false)} style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', padding: 4 }}>✕</button>
            </div>

            <form onSubmit={handleCreateTableSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              {wizardStep === 1 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Method Tabs */}
                  <div style={{ display: 'flex', gap: 16, borderBottom: '1px solid var(--border-color)', marginBottom: 8, paddingBottom: 8 }}>
                    <button
                      type="button"
                      onClick={() => setCreateMethod('manual')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        borderBottom: createMethod === 'manual' ? '2px solid var(--accent)' : '2px solid transparent',
                        color: createMethod === 'manual' ? 'var(--accent)' : 'var(--text-secondary)',
                        padding: '8px 12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      Manual Wizard
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateMethod('ai')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        borderBottom: createMethod === 'ai' ? '2px solid var(--accent)' : '2px solid transparent',
                        color: createMethod === 'ai' ? 'var(--accent)' : 'var(--text-secondary)',
                        padding: '8px 12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      ✨ Describe with AI
                    </button>
                  </div>

                  {createMethod === 'ai' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                          What business module / table would you like to create?
                        </label>
                        <textarea
                          placeholder="e.g. Create a products table with name, description, category, unit_price, stock_quantity, status. Status should default to 'active'. Add an index on category."
                          value={aiPrompt}
                          onChange={e => setAiPrompt(e.target.value)}
                          style={{
                            width: '100%',
                            height: 120,
                            background: 'var(--panel-bg)',
                            border: '1px solid var(--border-color)',
                            color: 'white',
                            padding: '10px 14px',
                            borderRadius: 6,
                            outline: 'none',
                            fontSize: '0.9rem',
                            resize: 'none',
                            fontFamily: 'inherit'
                          }}
                          autoFocus
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
                        <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)} style={{ background: 'rgba(255,255,255,0.05)', color: 'white', padding: '10px 18px', borderRadius: 6 }}>
                          Cancel
                        </button>
                        <button 
                          type="button" 
                          className="btn-primary" 
                          onClick={handleGenerateAISchema}
                          disabled={aiGenerating}
                          style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          {aiGenerating ? 'Generating Proposal...' : '✨ Generate Proposal'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                          Table FQN (Qualified Name) *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. public.users or sales.invoices"
                          value={newTableFqn}
                          onChange={e => setNewTableFqn(e.target.value)}
                          style={{
                            width: '100%',
                            background: 'var(--panel-bg)',
                            border: '1px solid var(--border-color)',
                            color: 'white',
                            padding: '10px 14px',
                            borderRadius: 6,
                            outline: 'none',
                            fontSize: '0.9rem'
                          }}
                          autoFocus
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 8, display: 'block', lineHeight: 1.4 }}>
                          Enter a fully qualified table name including schema (e.g. public.customers or tiles_business.partners).
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
                        <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)} style={{ background: 'rgba(255,255,255,0.05)', color: 'white', padding: '10px 18px', borderRadius: 6 }}>
                          Cancel
                        </button>
                        <button type="button" className="btn-primary" onClick={handleStep1Submit} style={{ padding: '10px 18px' }}>
                          Next: Define Columns
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 600 }}>
                      Table Name: <span style={{ fontFamily: 'var(--font-mono)' }}>{newTableFqn}</span>
                    </span>
                    <button type="button" onClick={handleAddColToNewTable} style={{ color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 500 }}>
                      + Add Column
                    </button>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', marginBottom: 20, paddingRight: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', borderBottom: '1px solid var(--border-color)' }}>
                          <th style={{ padding: '8px 4px', width: '20%' }}>COLUMN NAME</th>
                          <th style={{ padding: '8px 4px', width: '20%' }}>DATA TYPE</th>
                          <th style={{ padding: '8px 4px', width: '25%', textAlign: 'center' }}>PK / NULL / UNIQ / IDX</th>
                          <th style={{ padding: '8px 4px', width: '30%' }}>CONSTRAINTS & DEFAULTS</th>
                          <th style={{ padding: '8px 4px', textAlign: 'right', width: '5%' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {newTableCols.map((col, index) => (
                          <tr key={index} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                            <td style={{ padding: '8px 4px' }}>
                              <input
                                type="text"
                                placeholder="name"
                                value={col.name}
                                onChange={e => handleNewTableColChange(index, 'name', e.target.value)}
                                style={{
                                  width: '90%',
                                  background: 'var(--panel-bg)',
                                  border: '1px solid var(--border-color)',
                                  color: 'white',
                                  padding: '6px 10px',
                                  borderRadius: 4,
                                  outline: 'none',
                                  fontSize: '0.85rem'
                                }}
                              />
                            </td>
                            <td style={{ padding: '8px 4px' }}>
                              <select
                                value={col.type}
                                onChange={e => handleNewTableColChange(index, 'type', e.target.value)}
                                style={{
                                  background: 'var(--panel-bg)',
                                  border: '1px solid var(--border-color)',
                                  color: 'white',
                                  padding: '6px 10px',
                                  borderRadius: 4,
                                  outline: 'none',
                                  fontSize: '0.85rem',
                                  cursor: 'pointer',
                                  width: '90%'
                                }}
                              >
                                <option value="SERIAL">SERIAL</option>
                                <option value="INTEGER">INTEGER</option>
                                <option value="BIGINT">BIGINT</option>
                                <option value="VARCHAR(255)">VARCHAR(255)</option>
                                <option value="TEXT">TEXT</option>
                                <option value="BOOLEAN">BOOLEAN</option>
                                <option value="TIMESTAMP">TIMESTAMP</option>
                                <option value="DATE">DATE</option>
                                <option value="NUMERIC">NUMERIC</option>
                              </select>
                            </td>
                            <td style={{ padding: '8px 4px' }}>
                              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  <input
                                    type="checkbox"
                                    checked={col.is_primary_key || false}
                                    onChange={e => {
                                      handleNewTableColChange(index, 'is_primary_key', e.target.checked);
                                      if (e.target.checked) {
                                        handleNewTableColChange(index, 'nullable', false);
                                      }
                                    }}
                                  />
                                  PK
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  <input
                                    type="checkbox"
                                    checked={col.nullable !== false}
                                    disabled={col.is_primary_key}
                                    onChange={e => handleNewTableColChange(index, 'nullable', e.target.checked)}
                                  />
                                  NULL
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  <input
                                    type="checkbox"
                                    checked={col.is_unique || false}
                                    onChange={e => handleNewTableColChange(index, 'is_unique', e.target.checked)}
                                  />
                                  UNIQ
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  <input
                                    type="checkbox"
                                    checked={col.has_index || false}
                                    onChange={e => handleNewTableColChange(index, 'has_index', e.target.checked)}
                                  />
                                  IDX
                                </label>
                              </div>
                            </td>
                            <td style={{ padding: '8px 4px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <input
                                  type="text"
                                  placeholder="Default (None)"
                                  value={col.default_value || ''}
                                  onChange={e => handleNewTableColChange(index, 'default_value', e.target.value)}
                                  style={{
                                    width: '95%',
                                    background: 'var(--panel-bg)',
                                    border: '1px solid var(--border-color)',
                                    color: 'white',
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                    outline: 'none',
                                    fontSize: '0.8rem'
                                  }}
                                />
                                <input
                                  type="text"
                                  placeholder="CHECK (e.g. price > 0)"
                                  value={col.check_constraint || ''}
                                  onChange={e => handleNewTableColChange(index, 'check_constraint', e.target.value)}
                                  style={{
                                    width: '95%',
                                    background: 'var(--panel-bg)',
                                    border: '1px solid var(--border-color)',
                                    color: 'white',
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                    outline: 'none',
                                    fontSize: '0.8rem'
                                  }}
                                />
                                <select
                                  value={col.foreign_key_table && col.foreign_key_column ? `${col.foreign_key_table}.${col.foreign_key_column}` : ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (!val) {
                                      handleNewTableColChange(index, 'foreign_key_table', '');
                                      handleNewTableColChange(index, 'foreign_key_column', '');
                                    } else {
                                      const opt = getFkOptions().find(o => `${o.fqn}.${o.col}` === val);
                                      if (opt) {
                                        handleNewTableColChange(index, 'foreign_key_table', opt.fqn);
                                        handleNewTableColChange(index, 'foreign_key_column', opt.col);
                                      }
                                    }
                                  }}
                                  style={{
                                    width: '95%',
                                    background: 'var(--panel-bg)',
                                    border: '1px solid var(--border-color)',
                                    color: 'white',
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                    outline: 'none',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <option value="">References... (None)</option>
                                  {getFkOptions().map(o => (
                                    <option key={`${o.fqn}.${o.col}`} value={`${o.fqn}.${o.col}`}>
                                      Ref: {o.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                              <button
                                type="button"
                                onClick={() => handleRemoveColFromNewTable(index)}
                                disabled={newTableCols.length <= 1}
                                style={{
                                  color: 'var(--danger)',
                                  opacity: newTableCols.length <= 1 ? 0.3 : 1,
                                  cursor: newTableCols.length <= 1 ? 'not-allowed' : 'pointer',
                                  padding: 4
                                }}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
                    <button type="button" className="btn-secondary" onClick={() => setWizardStep(1)} style={{ background: 'rgba(255,255,255,0.05)', color: 'white', padding: '10px 18px', borderRadius: 6 }}>
                      ← Back to Name
                    </button>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)} style={{ background: 'rgba(255,255,255,0.05)', color: 'white', padding: '10px 18px', borderRadius: 6 }}>
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary" style={{ padding: '10px 18px' }} disabled={loading}>
                        {loading ? 'Creating...' : 'Create Table & Sync'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmModal && safetyReport && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1100, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="glass-panel" style={{ width: 500, padding: 24, display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.2s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--danger)', marginBottom: 16 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                {deleteType === 'table' ? 'Drop Table' : 'Drop Column'} Dependency Analysis
              </h3>
            </div>

            <div style={{ marginBottom: 20, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              <p>
                You are about to execute a destructive operation on{' '}
                <strong style={{ color: 'var(--accent)' }}>
                  {deleteType === 'table' ? selectedTable.qualified_name : `${selectedTable.qualified_name}.${deleteColName}`}
                </strong>.
              </p>
              
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 6, padding: 14, marginTop: 12 }}>
                <h4 style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>
                  Introspection Results:
                </h4>
                
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 16, margin: 0 }}>
                  <li>
                    <strong>Existing Data:</strong>{' '}
                    {safetyReport.has_data ? (
                      <span style={{ color: '#ff7b72' }}>
                        YES ({safetyReport.row_count} rows/values will be lost permanently)
                      </span>
                    ) : (
                      <span style={{ color: 'var(--success)' }}>None (No records found)</span>
                    )}
                  </li>
                  <li>
                    <strong>Indexes:</strong>{' '}
                    {safetyReport.indexes.length > 0 ? (
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {safetyReport.indexes.join(', ')} (will be dropped)
                      </span>
                    ) : (
                      <span>None</span>
                    )}
                  </li>
                  <li>
                    <strong>Foreign Keys:</strong>{' '}
                    {safetyReport.dependent_fks.length > 0 ? (
                      <span style={{ color: '#ff7b72', fontWeight: 600 }}>
                        ⚠️ Referenced in {safetyReport.dependent_fks.length} tables
                      </span>
                    ) : (
                      <span style={{ color: 'var(--success)' }}>None (No table references)</span>
                    )}
                  </li>
                </ul>
              </div>

              {safetyReport.dependent_fks.length > 0 && (
                <div style={{ marginTop: 16, background: 'rgba(218, 54, 51, 0.1)', border: '1px solid rgba(218, 54, 51, 0.3)', padding: 12, borderRadius: 6, fontSize: '0.8rem', color: '#ff7b72' }}>
                  <strong>CRITICAL BLOCKER:</strong> You cannot drop this {deleteType} because it has active Foreign Key constraints in the following locations:
                  <ul style={{ marginTop: 6, paddingLeft: 16 }}>
                    {safetyReport.dependent_fks.map((fk, idx) => (
                      <li key={idx}>
                        Table: <code>{fk.table}</code> (Column: <code>{fk.column}</code>)
                      </li>
                    ))}
                  </ul>
                  Please remove those foreign key dependencies first.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => setShowDeleteConfirmModal(false)} 
                style={{ background: 'rgba(255,255,255,0.05)', color: 'white', padding: '10px 18px', borderRadius: 6 }}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                onClick={handleConfirmDelete} 
                disabled={!safetyReport.safe}
                style={{ 
                  background: safetyReport.safe ? 'var(--danger)' : 'rgba(255,255,255,0.02)', 
                  border: safetyReport.safe ? '1px solid var(--danger)' : '1px solid var(--border-color)', 
                  color: safetyReport.safe ? 'white' : 'var(--text-secondary)',
                  cursor: safetyReport.safe ? 'pointer' : 'not-allowed',
                  padding: '10px 18px' 
                }}
              >
                Confirm Drop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchemaDesigner;
