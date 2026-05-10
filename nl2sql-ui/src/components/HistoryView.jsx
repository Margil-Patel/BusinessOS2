import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const HistoryView = ({ onSelectQuery }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const data = await api.getHistory();
      setHistory(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="view-container">
      <h2 className="view-title">Recent Queries</h2>
      
      {loading && <div style={{color: 'var(--text-secondary)'}}>Loading history...</div>}
      
      {!loading && history.length === 0 && (
        <div style={{color: 'var(--text-secondary)'}}>No query history found.</div>
      )}

      <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
        {history.map((log, i) => (
          <div key={i} className="glass-panel" style={{padding: 20}}>
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 12}}>
              <h3 style={{fontSize: '1.1rem'}}>{log.nl_query}</h3>
              <span style={{color: 'var(--text-secondary)', fontSize: '0.85rem'}}>
                {new Date(log.created_at).toLocaleString()}
              </span>
            </div>
            <pre style={{marginBottom: 12}}><code>{log.sql_query}</code></pre>
            <div style={{display: 'flex', gap: 16, fontSize: '0.85rem', color: 'var(--text-secondary)'}}>
              <span>Status: {log.status}</span>
              <span>Rows: {log.row_count || 0}</span>
              <span>Time: {log.latency_ms?.toFixed(0)}ms</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HistoryView;
