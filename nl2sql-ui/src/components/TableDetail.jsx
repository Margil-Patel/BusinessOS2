import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import OdometerCell from './OdometerCell';

const TableDetail = ({ table, onBack }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, [table.qualified_name]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await api.getTableData(table.qualified_name);
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="view-container">
      <div className="table-detail-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to Explorer
        </button>
        <h2 className="view-title" style={{margin: 0}}>{table.qualified_name}</h2>
      </div>

      <div className="table-stats">
        <div className="stat-card">
          <div className="stat-label">Columns</div>
          <div className="stat-value">{table.columns.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Row Count (Approx)</div>
          <div className="stat-value">{table.row_count_approx || 'Unknown'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Schema</div>
          <div className="stat-value" style={{fontSize: '1.2rem'}}>{table.schema}</div>
        </div>
      </div>

      <div className="data-preview-card">
        <div className="card-header">
          <div style={{fontWeight: 600}}>Data Preview (First 50 rows)</div>
          <button 
            onClick={fetchData} 
            disabled={loading}
            style={{color: 'var(--accent)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6}}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'spin' : ''}>
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Refresh
          </button>
        </div>

        <div className="detail-table-container">
          {loading ? (
            <div style={{padding: 48, textAlign: 'center', color: 'var(--text-secondary)'}}>
              Loading table data...
            </div>
          ) : error ? (
            <div style={{padding: 48, textAlign: 'center', color: 'var(--danger)'}}>
              {error}
            </div>
          ) : data?.rows.length > 0 ? (
            <table>
              <thead>
                <tr>
                  {data.columns.map(col => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i}>
                    {data.columns.map(col => (
                      <td key={col}>
                        <OdometerCell 
                          value={row[col]} 
                          columnName={col} 
                          tableName={table.qualified_name} 
                          rowId={row.tile_id || row.tile_name || row.id || row[data.columns[0]] || i} 
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{padding: 48, textAlign: 'center', color: 'var(--text-secondary)'}}>
              No data found in this table.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TableDetail;
