import React, { useState, useCallback, useEffect } from 'react';
import { SpreadsheetPage } from './spreadsheet';
import { api } from '../services/api';

/**
 * DataView
 * Application-level page that lets users pick any registered table
 * and view its data in the SpreadsheetPage component.
 *
 * This is the ONLY file that knows about table names or API calls.
 * SpreadsheetPage itself is fully generic.
 */
const DataView = ({ initialFqn }) => {
  const [tables, setTables]         = useState([]);
  const [selectedFqn, setSelectedFqn] = useState(initialFqn || '');
  const [loadingTables, setLoadingTables] = useState(false);

  // Fetch registry table list on mount
  useEffect(() => {
    const load = async () => {
      setLoadingTables(true);
      try {
        const data = await api.getTables();
        setTables(data || []);
        if (data && data.length > 0 && !selectedFqn) {
          setSelectedFqn(initialFqn || data[0].qualified_name);
        }
      } catch {
        // Table list unavailable — user can type FQN manually
      } finally {
        setLoadingTables(false);
      }
    };
    load();
  }, [initialFqn]);

  // Stable callbacks passed as props to SpreadsheetPage
  const fetchSchema = useCallback(async (fqn) => {
    const result = await api.getDataSchema(fqn);
    return result; // { success, fqn, columns: [{name, data_type, …}] }
  }, []);

  const fetchRows = useCallback(async (fqn, page, pageSize) => {
    const result = await api.getTableRows(fqn, page, pageSize);
    return result; // { rows, total_count, columns, … }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      {selectedFqn ? (
        <SpreadsheetPage
          key={selectedFqn}
          fqn={selectedFqn}
          tables={tables}
          onSelectTable={setSelectedFqn}
          fetchSchema={fetchSchema}
          fetchRows={fetchRows}
          pageSize={50}
          style={{ flex: 1, height: '100%' }}
        />
      ) : (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-secondary)', gap: 12,
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M3 15h18M9 3v18"/>
          </svg>
          <span style={{ fontSize: '0.9rem' }}>Select a table to view its data</span>
        </div>
      )}
    </div>
  );
};

export default DataView;
