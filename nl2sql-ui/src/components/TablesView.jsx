import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const TablesView = () => {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchTables();
  }, []);

  const fetchTables = async () => {
    try {
      const data = await api.getTables();
      setTables(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredTables = tables.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) || 
    t.schema_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="view-container">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24}}>
        <h2 className="view-title" style={{margin: 0}}>Discovered Tables</h2>
        <input 
          type="text" 
          placeholder="Search tables..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            background: 'var(--panel-bg)', border: '1px solid var(--border-color)', 
            color: 'white', padding: '8px 12px', borderRadius: 6
          }}
        />
      </div>

      {loading && <div style={{color: 'var(--text-secondary)'}}>Loading schema...</div>}
      {error && <div style={{color: 'var(--danger)'}}>{error}</div>}

      <div className="tables-grid">
        {filteredTables.map(table => (
          <div key={table.fqn} className="table-card glass-panel">
            <h3>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>
              </svg>
              {table.fqn}
            </h3>
            <ul className="column-list">
              {table.columns.slice(0, 8).map(col => (
                <li key={col.name}>
                  <span>{col.name} {col.is_primary_key && '🔑'}</span>
                  <span className="col-type">{col.type}</span>
                </li>
              ))}
              {table.columns.length > 8 && (
                <li style={{justifyContent: 'center', marginTop: 8, fontStyle: 'italic'}}>
                  + {table.columns.length - 8} more columns
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TablesView;
