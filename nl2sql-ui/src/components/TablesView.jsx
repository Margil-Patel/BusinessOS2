import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

/**
 * TablesView
 * Discovered tables Explorer — displays table schema cards with column metadata.
 */
const TablesView = ({ onSelectTable }) => {
  const [tables, setTables]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    fetchTables();
  }, []);

  const fetchTables = async () => {
    try {
      const data = await api.getTables();
      setTables(data || []);
    } catch (e) {
      setError(e.message || 'Failed to fetch discovered tables');
    } finally {
      setLoading(false);
    }
  };

  const filteredTables = (tables || []).filter((t) => {
    const nameStr = t.name || t.qualified_name || '';
    const schemaStr = t.schema_name || t.schema || '';
    const q = search.toLowerCase();
    return nameStr.toLowerCase().includes(q) || schemaStr.toLowerCase().includes(q);
  });

  return (
    <div className="view-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 className="view-title" style={{ margin: 0 }}>Discovered Tables</h2>
        <input 
          type="text" 
          placeholder="Search tables..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: 'var(--panel-bg)', border: '1px solid var(--border-color)', 
            color: 'white', padding: '8px 12px', borderRadius: 6, outline: 'none'
          }}
        />
      </div>

      {loading && <div style={{ color: 'var(--text-secondary)', padding: '24px 0' }}>Loading schema explorer...</div>}
      {error && <div style={{ color: 'var(--danger)', padding: '24px 0' }}>{error}</div>}

      {!loading && !error && filteredTables.length === 0 && (
        <div style={{ color: 'var(--text-secondary)', padding: '48px 0', textAlign: 'center' }}>
          No matching tables found.
        </div>
      )}

      <div className="tables-grid">
        {filteredTables.map((table) => {
          const fqn       = table.qualified_name || `${table.schema_name || 'public'}.${table.name}`;
          const schemaVal = table.schema_name || table.schema || fqn.split('.')[0] || 'public';
          const cols      = table.columns || [];

          return (
            <div 
              key={fqn} 
              className="table-card glass-panel"
              onClick={() => onSelectTable?.(table)}
              style={{ cursor: 'pointer' }}
            >
              <h3>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>
                </svg>
                {table.name || fqn.split('.').pop()}
                <span style={{ fontSize: '0.7rem', opacity: 0.5, marginLeft: 'auto' }}>{schemaVal}</span>
              </h3>
              <ul className="column-list">
                {cols.slice(0, 8).map((col) => (
                  <li key={col.name}>
                    <span>{col.name} {col.is_primary_key && '🔑'}</span>
                    <span className="col-type">{col.type || col.data_type}</span>
                  </li>
                ))}
                {cols.length > 8 && (
                  <li style={{ justifyContent: 'center', marginTop: 8, fontStyle: 'italic' }}>
                    + {cols.length - 8} more columns
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TablesView;
