import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';

const MessageBubble = ({ msg }) => {
  if (msg.role === 'user') {
    return <div className="chat-message message-user">{msg.content}</div>;
  }

  const { sql, rows, columns, error, trace, latency_ms } = msg.data;

  return (
    <div className="chat-message message-ai ai-bubble">
      {error ? (
        <div style={{color: 'var(--danger)'}}><strong>Error:</strong> {error}</div>
      ) : (
        <>
          <div style={{display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.8rem'}}>
            <span>✓ SQL Generated in {latency_ms?.toFixed(0)}ms</span>
            {trace?.tables_used?.length > 0 && <span>Tables used: {trace.tables_used.join(', ')}</span>}
          </div>
          
          <pre><code>{sql}</code></pre>
          
          {rows && rows.length > 0 ? (
            <div className="data-table-container">
              <table>
                <thead>
                  <tr>{columns.map(col => <th key={col}>{col}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      {columns.map(col => <td key={col}>{row[col]?.toString() || 'null'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{color: 'var(--text-secondary)', fontStyle: 'italic'}}>No rows returned.</div>
          )}
        </>
      )}
    </div>
  );
};

const ChatArea = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [explainMode, setExplainMode] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const result = await api.query(userMsg, explainMode);
      setMessages(prev => [...prev, { role: 'ai', data: result }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', data: { error: e.message } }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-history">
        {messages.length === 0 ? (
          <div style={{textAlign: 'center', color: 'var(--text-secondary)', marginTop: '10vh'}}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{marginBottom: 16}}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <h2>Ask your database anything</h2>
            <p style={{marginTop: 8}}>e.g. "Show me the top 10 customers by revenue"</p>
          </div>
        ) : (
          messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)
        )}
        {loading && <div className="chat-message message-ai" style={{color: 'var(--text-secondary)'}}>Generating SQL...</div>}
        <div ref={endRef} />
      </div>

      <div className="input-area">
        <div className="input-wrapper">
          <div className="mode-toggle">
            <label style={{cursor: 'pointer'}}>
              <input type="checkbox" checked={explainMode} onChange={(e) => setExplainMode(e.target.checked)} style={{marginRight: 6}} />
              Explain Only (Dry-run)
            </label>
          </div>
          <textarea
            className="query-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your data..."
            rows={1}
            disabled={loading}
          />
          <button className="send-btn" onClick={handleSend} disabled={!input.trim() || loading}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatArea;
