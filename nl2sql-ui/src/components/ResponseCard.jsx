import React, { useState, useRef, useEffect } from 'react';

const Header = ({ rowCount }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)', fontWeight: '600', fontSize: '0.95rem' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Query Executed Successfully</span>
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        Returned {rowCount} {rowCount === 1 ? 'row' : 'rows'}.
      </div>
    </div>
  );
};

const Actions = ({ showSql, setShowSql, showResults, setShowResults, hasRows, isSingleCell, showAsTable, setShowAsTable }) => {
  return (
    <div className="actions-row">
      <button 
        onClick={() => setShowSql(!showSql)}
        className="sql-toggle-btn"
      >
        {showSql ? 'Hide SQL' : 'Show SQL'}
      </button>
      <button 
        onClick={() => setShowResults(!showResults)}
        className="sql-toggle-btn"
        disabled={!hasRows}
        style={{
          opacity: hasRows ? 1 : 0.5,
          cursor: hasRows ? 'pointer' : 'not-allowed'
        }}
      >
        {showResults ? 'Hide Table' : 'View Table'}
      </button>
      {isSingleCell && (
        <button 
          onClick={() => setShowAsTable(!showAsTable)}
          className="sql-toggle-btn"
        >
          {showAsTable ? 'Show Sentence' : 'Show Table'}
        </button>
      )}
    </div>
  );
};

const PreviewTable = ({ columns, rows }) => {
  if (!rows || rows.length === 0) return null;

  return (
    <div>
      <div className="preview-label">Preview ({rows.length} {rows.length === 1 ? 'row' : 'rows'})</div>
      <div className="data-table-container">
        <table>
          <thead>
            <tr>
              {columns.map(col => <th key={col}>{col}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map(col => (
                  <td key={col}>
                    {row[col] !== undefined && row[col] !== null ? row[col].toString() : 'null'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ExpandableResultsTable = ({ columns, rows, expanded }) => {
  if (!rows || rows.length === 0) return null;

  return (
    <div className={`results-expandable-section ${expanded ? 'expanded' : ''}`}>
      <div style={{ marginBottom: '8px', fontWeight: '600', fontSize: '0.85rem', color: 'var(--accent)' }}>
        Complete Results ({rows.length} rows)
      </div>
      <table>
        <thead>
          <tr>
            {columns.map(col => <th key={col}>{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map(col => (
                <td key={col}>
                  {row[col] !== undefined && row[col] !== null ? row[col].toString() : 'null'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const getSentenceAnswer = (columns, rows) => {
  if (!rows || rows.length !== 1 || !columns || columns.length !== 1) return null;
  const col = columns[0];
  const val = rows[0][col];
  
  // Format column name: replace underscores/dashes with spaces, trim, lowercase
  let colClean = col.replace(/[_-]/g, ' ').trim().toLowerCase();
  
  // If it's a count, e.g. "count"
  if (colClean === 'count') {
    return `The total count is ${val}.`;
  }
  
  // Format value
  const valStr = val !== undefined && val !== null ? val.toString() : 'null';
  
  return `The ${colClean} is ${valStr}.`;
};

const ResponseCard = ({ msg }) => {
  const [showSql, setShowSql] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showAsTable, setShowAsTable] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!cardRef.current || msg.role !== 'ai' || msg.data?.error) return;

    // Get current size before toggle state commits
    const rect = cardRef.current.getBoundingClientRect();
    const originalWidth = rect.width;
    const originalHeight = rect.height;

    // Reset styles temporarily to read new natural flow size
    cardRef.current.style.width = 'auto';
    cardRef.current.style.height = 'auto';
    cardRef.current.style.transition = 'none';

    // Measure target natural size
    const targetRect = cardRef.current.getBoundingClientRect();
    const targetWidth = targetRect.width;
    const targetHeight = targetRect.height;

    // Set it back to the original size
    cardRef.current.style.width = `${originalWidth}px`;
    cardRef.current.style.height = `${originalHeight}px`;

    // Force browser reflow
    cardRef.current.offsetHeight;

    // Smoothly transition width and height
    cardRef.current.style.transition = 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1), height 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
    cardRef.current.style.width = `${targetWidth}px`;
    cardRef.current.style.height = `${targetHeight}px`;

    const timer = setTimeout(() => {
      if (cardRef.current) {
        cardRef.current.style.width = 'auto';
        cardRef.current.style.height = 'auto';
        cardRef.current.style.transition = 'none';
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [showResults, showSql, showAsTable]);

  if (msg.role === 'user') {
    return <div className="chat-message message-user">{msg.content}</div>;
  }

  const { sql, rows, columns, error, full_rows, full_columns } = msg.data;
  const hasRows = rows && rows.length > 0;
  const isSingleCell = hasRows && rows.length === 1 && columns && columns.length === 1;

  return (
    <div ref={cardRef} className="chat-message message-ai ai-bubble">
      {error ? (
        <div style={{ color: 'var(--danger)', fontSize: '0.95rem' }}>
          <strong>Error:</strong> {error}
        </div>
      ) : (
        <>
          <Header rowCount={hasRows ? rows.length : 0} />
          
          <Actions 
            showSql={showSql} 
            setShowSql={setShowSql} 
            showResults={showResults} 
            setShowResults={setShowResults} 
            hasRows={hasRows} 
            isSingleCell={isSingleCell}
            showAsTable={showAsTable}
            setShowAsTable={setShowAsTable}
          />

          {showSql && (
            <pre className="sql-preview">
              <code>{sql}</code>
            </pre>
          )}

          {hasRows ? (
            <>
              {isSingleCell && !showAsTable ? (
                <div style={{ 
                  fontSize: '1.05rem', 
                  fontWeight: '500', 
                  color: 'var(--text-primary)', 
                  padding: '12px 4px 8px 4px',
                  lineHeight: '1.4'
                }}>
                  {getSentenceAnswer(columns, rows)}
                </div>
              ) : (
                <PreviewTable columns={columns || []} rows={rows} />
              )}
              <ExpandableResultsTable 
                columns={full_columns || columns || []} 
                rows={full_rows || rows} 
                expanded={showResults} 
              />
            </>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.9rem' }}>
              No rows returned.
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ResponseCard;
