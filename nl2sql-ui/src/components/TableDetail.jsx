import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import OdometerCell from './OdometerCell';

/**
 * TableDetail
 * Detailed table inspector — column metadata stats, schema info, and data preview rows.
 * Designed defensively against null/undefined property dereferences.
 */
const TableDetail = ({ table = {}, onBack }) => {
  const [data, setData]       = useState(null);
  const [schemaInfo, setSchemaInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const qualifiedName = table?.qualified_name || (table?.schema_name && table?.name ? `${table.schema_name}.${table.name}` : 'public.tables');
  const tableName     = table?.name || qualifiedName.split('.').pop() || 'table';
  const schemaName    = table?.schema_name || table?.schema || qualifiedName.split('.')[0] || 'public';

  useEffect(() => {
    fetchData();
  }, [qualifiedName]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch table preview data
      const result = await api.getTableData(qualifiedName);
      setData(result);

      // If columns info is missing from props, fetch schema columns
      if (!table?.columns) {
        try {
          const s = await api.getDataSchema(qualifiedName);
          setSchemaInfo(s);
        } catch { /* schema metadata optional fallback */ }
      }
    } catch (e) {
      setError(e.message || 'Failed to fetch table details');
    } finally {
      setLoading(false);
    }
  };

  const columnsList  = table?.columns || schemaInfo?.columns || (data?.columns ? data.columns.map(c => ({ name: c, type: 'TEXT' })) : []);
  const columnsCount = columnsList.length || (data?.columns ? data.columns.length : 0);
  const approxRows   = table?.row_count_approx ?? data?.rows?.length ?? 'Unknown';

  return (
    <div className="view-container">
      <div className="table-detail-header" style={{ marginBottom: 20 }}>
        <button className="back-btn" onClick={onBack} style={{ cursor: 'pointer' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to Explorer
        </button>
        <h2 className="view-title" style={{ margin: 0 }}>{qualifiedName}</h2>
      </div>

      <div className="table-stats" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Columns</div>
          <div className="stat-value">{columnsCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Row Count (Approx)</div>
          <div className="stat-value">{approxRows}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Schema</div>
          <div className="stat-value" style={{ fontSize: '1.2rem' }}>{schemaName}</div>
        </div>
      </div>

      <div className="data-preview-card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 600 }}>Data Preview (First 50 rows)</div>
          <button 
            onClick={fetchData} 
            disabled={loading}
            style={{ color: 'var(--accent)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'spin' : ''}>
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Refresh
          </button>
        </div>

        <div className="detail-table-container">
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
              Loading table data...
            </div>
          ) : error ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--danger)' }}>
              {error}
            </div>
          ) : data?.rows?.length > 0 ? (
            <table>
              <thead>
                <tr>
                  {(data.columns || []).map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.rows || []).map((row, i) => (
                  <tr key={i}>
                    {(data.columns || []).map((col) => (
                      <td key={col}>
                        <OdometerCell 
                          value={row[col]} 
                          columnName={col} 
                          tableName={qualifiedName} 
                          rowId={row.tile_id || row.tile_name || row.id || row[(data.columns || [])[0]] || i} 
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
              No data found in this table.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TableDetail;
