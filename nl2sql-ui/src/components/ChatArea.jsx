import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import ResponseCard from './ResponseCard';


const ChatArea = ({ messages, setMessages, explainMode, setExplainMode }) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
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
      // Map existing messages to history format for the LLM
      const history = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.role === 'user' ? msg.content : (msg.data?.sql || msg.data?.error || 'Processed')
      }));

      const result = await api.query(userMsg, history, explainMode);
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
          messages.map((msg, i) => <ResponseCard key={i} msg={msg} />)
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
