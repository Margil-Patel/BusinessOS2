import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import ResponseCard from './ResponseCard';

const ChatArea = ({ messages, setMessages, explainMode, setExplainMode, activeModule, setActiveModule }) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  // Field setup wizard states
  const [formStep, setFormStep] = useState(1); // 1: fields configuration, 2: data input form
  const [fields, setFields] = useState([
    { name: 'tile_id', label: 'Tile ID', isCustom: false, isRequired: true },
    { name: 'tile_name', label: 'Tile Name', isCustom: false, isRequired: true },
    { name: 'category', label: 'Category', isCustom: false, isRequired: false },
    { name: 'finish_type', label: 'Finish Type', isCustom: false, isRequired: false },
    { name: 'size', label: 'Size', isCustom: false, isRequired: false },
    { name: 'price_per_box', label: 'Price per Box', isCustom: false, isRequired: false },
    { name: 'stock_boxes', label: 'Stock Boxes', isCustom: false, isRequired: false },
    { name: 'warehouse', label: 'Warehouse', isCustom: false, isRequired: false }
  ]);
  const [customFieldName, setCustomFieldName] = useState('');

  // Values entered in the form
  const [formValues, setFormValues] = useState({});
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Reset to dashboard if chat is cleared
  useEffect(() => {
    if (messages.length === 0) {
      setActiveModule(null);
    }
  }, [messages]);

  // Reset form when activeModule changes
  useEffect(() => {
    if (activeModule !== 'add_inventory') {
      setFormStep(1);
      setFields([
        { name: 'tile_id', label: 'Tile ID', isCustom: false, isRequired: true },
        { name: 'tile_name', label: 'Tile Name', isCustom: false, isRequired: true },
        { name: 'category', label: 'Category', isCustom: false, isRequired: false },
        { name: 'finish_type', label: 'Finish Type', isCustom: false, isRequired: false },
        { name: 'size', label: 'Size', isCustom: false, isRequired: false },
        { name: 'price_per_box', label: 'Price per Box', isCustom: false, isRequired: false },
        { name: 'stock_boxes', label: 'Stock Boxes', isCustom: false, isRequired: false },
        { name: 'warehouse', label: 'Warehouse', isCustom: false, isRequired: false }
      ]);
      setFormValues({});
      setFormErrors({});
      setCustomFieldName('');
    }
  }, [activeModule]);

  const handleSend = async (overrideQuery) => {
    const queryToSend = overrideQuery || input.trim();
    if (!queryToSend || loading) return;

    if (!overrideQuery) {
      setInput('');
    }
    setMessages(prev => [...prev, { role: 'user', content: queryToSend }]);
    setLoading(true);

    try {
      const history = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.role === 'user' ? msg.content : (msg.data?.sql || msg.data?.error || 'Processed')
      }));

      const result = await api.query(queryToSend, history, explainMode);
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

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // Field setup wizard handlers
  const handleRemoveField = (fieldName) => {
    setFields(prev => prev.filter(f => f.name !== fieldName));
    setFormValues(prev => {
      const copy = { ...prev };
      delete copy[fieldName];
      return copy;
    });
  };

  const handleAddCustomField = () => {
    if (!customFieldName.trim()) return;

    // Sanitize key name to match database conventions (snake_case)
    const keyName = customFieldName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const displayLabel = customFieldName.trim();

    if (fields.some(f => f.name === keyName)) {
      alert("A field with this name already exists.");
      return;
    }

    setFields(prev => [...prev, { name: keyName, label: displayLabel, isCustom: true, isRequired: false }]);
    setCustomFieldName('');
  };

  const handleCustomFieldKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCustomField();
    }
  };

  const handleSaveFields = () => {
    if (fields.length === 0) {
      alert("Please add at least one field.");
      return;
    }
    // Initialize form values for any empty fields
    const nextValues = { ...formValues };
    fields.forEach(f => {
      if (nextValues[f.name] === undefined) {
        nextValues[f.name] = '';
      }
    });
    setFormValues(nextValues);
    setFormStep(2);
  };

  // Form submission handler
  const validateForm = () => {
    const errors = {};
    fields.forEach(f => {
      if (f.isRequired && (!formValues[f.name] || !formValues[f.name].trim())) {
        errors[f.name] = `${f.label} is required`;
      }
      
      // Basic numeric validations for stock and price if they exist
      if (f.name === 'price_per_box' && formValues[f.name] && isNaN(Number(formValues[f.name]))) {
        errors[f.name] = 'Price must be a number';
      }
      if (f.name === 'stock_boxes' && formValues[f.name] && isNaN(Number(formValues[f.name]))) {
        errors[f.name] = 'Stock boxes must be a number';
      }
    });
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    
    // Construct natural language representation based only on active configured fields
    const detailsList = fields.map(f => {
      const val = formValues[f.name];
      if (val === undefined || val === null || val.trim() === '') return null;
      
      // Detect if column is a numeric or boolean to avoid wrapping in quotes in NL
      const isNumericCol = ['price', 'box', 'stock', 'qty', 'quantity', 'cost'].some(keyword => f.name.includes(keyword));
      const valEscaped = isNumericCol ? Number(val.trim()) : `'${val.trim()}'`;
      return `${f.name}=${valEscaped}`;
    }).filter(Boolean);

    const userPrompt = `Add a new tile to inventory with details: ${detailsList.join(', ')}`;
    
    // Mount chatbot page immediately by setting initial user message
    setMessages([{ role: 'user', content: userPrompt }]);

    try {
      // Build insertion payload from form values
      const rowData = {};
      fields.forEach(f => {
        const val = formValues[f.name];
        if (val !== undefined && val !== null && val.trim() !== '') {
          const isNumericCol = ['price', 'box', 'stock', 'qty', 'quantity', 'cost'].some(keyword => f.name.includes(keyword));
          rowData[f.name] = isNumericCol ? Number(val.trim()) : val.trim();
        }
      });

      // Execute secure database insertion API
      await api.insertRow('tiles_business.tile_inventory', rowData);

      // Create simulated SQL for visual display
      const cols = Object.keys(rowData);
      const colNamesStr = cols.map(c => `"${c}"`).join(', ');
      const valStr = cols.map(c => typeof rowData[c] === 'number' ? rowData[c] : `'${rowData[c]}'`).join(', ');
      const simulatedSql = `INSERT INTO tiles_business.tile_inventory (${colNamesStr}) VALUES (${valStr});`;

      // Append success AI response card
      setMessages(prev => [
        ...prev,
        {
          role: 'ai',
          data: {
            sql: simulatedSql,
            rows: [rowData],
            columns: cols,
            error: null,
            full_rows: [rowData],
            full_columns: cols
          }
        }
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'ai',
          data: {
            error: err.message
          }
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = (moduleName, defaultQuery) => {
    setActiveModule(moduleName);
    if (defaultQuery) {
      setInput(defaultQuery);
      // Wait briefly for DOM input mount before focusing
      setTimeout(() => {
        const textarea = document.querySelector('.query-input');
        if (textarea) {
          textarea.focus();
          textarea.style.height = 'auto';
          textarea.style.height = `${textarea.scrollHeight}px`;
        }
      }, 50);
    }
  };

  // 1. Render Dashboard Landing Operation Cards (Chatbot hidden)
  if (activeModule === null) {
    return (
      <div className="view-container" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '70vh' }}>
        <div style={{ textAlign: 'center', marginBottom: 40, maxWidth: 650 }}>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 700, marginBottom: 12, background: 'linear-gradient(135deg, #ffffff 0%, var(--accent) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Inventory Management Dashboard
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', lineHeight: '1.5' }}>
            Select an operation below to modify stock or query the database in natural language.
          </p>
        </div>

        <div className="quick-actions-grid" style={{ marginTop: 0 }}>
          {/* Card 1: Add to inventory */}
          <div className="action-card" onClick={() => handleCardClick('add_inventory', '')}>
            <div className="action-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </div>
            <h3>Add to inventory</h3>
            <p>Define fields and insert a new tile record dynamically into the database.</p>
          </div>

          {/* Card 2: Check into inventory */}
          <div className="action-card" onClick={() => handleCardClick('check_inventory', '')}>
            <div className="action-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h3>Check into inventory</h3>
            <p>Use the intelligent chatbot to query stock levels and locations in natural language.</p>
          </div>

          {/* Card 3: Removed items from inventory */}
          <div className="action-card" onClick={() => handleCardClick('removed_items', "Removed items from inventory: show all items with 0 stock boxes")}>
            <div className="action-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </div>
            <h3>Removed items from inventory</h3>
            <p>Query items out of stock or check items removed from availability.</p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Add to Inventory Wizard Render
  if (activeModule === 'add_inventory' && messages.length === 0) {
    return (
      <div className="view-container" style={{ overflowY: 'auto' }}>
        <div style={{ maxWidth: 700, margin: '0 auto 20px auto' }}>
          <button className="back-to-dashboard-btn" onClick={() => setActiveModule(null)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
            Back to operations
          </button>
        </div>

        {formStep === 1 ? (
          /* Step 1: Dynamic Fields Configuration */
          <div className="fields-setup-container">
            <h2 className="inventory-form-title" style={{ borderBottom: 'none', marginBottom: 6 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
                <line x1="15" y1="3" x2="15" y2="21"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="3" y1="15" x2="21" y2="15"/>
              </svg>
              Step 1: Configure Fields
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 20 }}>
              Select which database columns to include, or add custom fields to dynamically expand the inventory table.
            </p>

            <div className="fields-list">
              {fields.map(f => (
                <div key={f.name} className="field-item">
                  <div className="field-info">
                    <span className="field-name-label">{f.label}</span>
                    <span style={{ fontSize: '0.75rem', opacity: 0.6, fontFamily: 'var(--font-mono)' }}>({f.name})</span>
                    {f.isRequired && <span className="field-tag required">Required</span>}
                    {f.isCustom ? (
                      <span className="field-tag custom">Custom Field</span>
                    ) : (
                      !f.isRequired && <span className="field-tag standard">Standard</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="remove-field-btn"
                    onClick={() => handleRemoveField(f.name)}
                    disabled={f.isRequired}
                    title={f.isRequired ? "Required fields cannot be deleted" : "Remove this field"}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <div className="add-custom-field-row">
              <input
                type="text"
                className="add-custom-field-input"
                placeholder="Type field name (e.g. Color, Brand)..."
                value={customFieldName}
                onChange={e => setCustomFieldName(e.target.value)}
                onKeyDown={handleCustomFieldKeyDown}
              />
              <button
                type="button"
                className="btn-primary"
                style={{ padding: '10px 16px', fontSize: '0.9rem' }}
                onClick={handleAddCustomField}
              >
                + Add Field
              </button>
            </div>

            <div className="form-actions" style={{ marginTop: 24 }}>
              <button type="button" className="btn-secondary" onClick={() => setActiveModule(null)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleSaveFields}>
                Save Fields & Continue
              </button>
            </div>
          </div>
        ) : (
          /* Step 2: Dynamic Form Rendering with Saved Fields */
          <div className="inventory-form-container">
            <div className="inventory-form-title">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              Step 2: Enter Inventory Data
            </div>

            <form onSubmit={handleFormSubmit}>
              <div className="form-grid">
                {fields.map(f => (
                  <div key={f.name} className="form-group">
                    <label className="form-label">
                      {f.label} {f.isRequired && '*'}
                    </label>
                    <input
                      type="text"
                      name={f.name}
                      className="form-input"
                      placeholder={`Enter ${f.label.toLowerCase()}...`}
                      value={formValues[f.name] || ''}
                      onChange={handleInputChange}
                    />
                    {formErrors[f.name] && <div className="form-error-msg">{formErrors[f.name]}</div>}
                  </div>
                ))}
              </div>

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setFormStep(1)}>
                  Back to Field Setup
                </button>
                <button type="submit" className="btn-primary">
                  Add to Inventory
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // 3. Render Chatbot Interface once an operation is active
  return (
    <div className="chat-container">
      <div className="chat-header-bar">
        <button className="back-to-dashboard-btn" onClick={() => { setActiveModule(null); setInput(''); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to operations
        </button>
        <span className="chat-header-title">
          {activeModule === 'check_inventory' && '🔍 Checking Inventory'}
          {activeModule === 'add_inventory' && '➕ Adding to Inventory'}
          {activeModule === 'removed_items' && '❌ Removed Items Query'}
        </span>
      </div>

      <div className="chat-history">
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '8vh' }}>
            <div className="chatbot-welcome-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <h2>
              {activeModule === 'check_inventory' && 'Check Inventory Chatbot'}
              {activeModule === 'add_inventory' && 'Add to Inventory Assistant'}
              {activeModule === 'removed_items' && 'Removed Items Assistant'}
            </h2>
            <p style={{ marginTop: 8, maxWidth: 500, margin: '8px auto 0', lineHeight: 1.4 }}>
              {activeModule === 'check_inventory' && "Ask any natural language question to search what's in inventory (e.g. 'Show me all granite tiles' or 'Which warehouse has Galaxy Pearl?')."}
              {activeModule === 'add_inventory' && "Type your addition request or use/edit the prefilled query below to insert stock."}
              {activeModule === 'removed_items' && "Search out of stock or archived items in the inventory database."}
            </p>
          </div>
        ) : (
          messages.map((msg, i) => <ResponseCard key={i} msg={msg} />)
        )}
        {loading && <div className="chat-message message-ai" style={{ color: 'var(--text-secondary)' }}>Generating SQL...</div>}
        <div ref={endRef} />
      </div>

      <div className="input-area">
        <div className="input-wrapper">
          <div className="mode-toggle">
            <label style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={explainMode} onChange={(e) => setExplainMode(e.target.checked)} style={{ marginRight: 6 }} />
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
          <button className="send-btn" onClick={() => handleSend()} disabled={!input.trim() || loading}>
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
