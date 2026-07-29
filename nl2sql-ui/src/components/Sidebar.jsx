import React from 'react';

const Sidebar = ({ currentView, onNavigate, onNewChat, health, activeModule, onSelectOperation }) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        NL2SQL
      </div>

      <nav className="nav-menu">
        <button 
          className="btn-primary" 
          onClick={onNewChat}
          style={{marginBottom: 16, justifyContent: 'center', padding: '12px'}}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Chat
        </button>

        <button 
          className={`nav-item ${currentView === 'chat' ? 'active' : ''}`}
          onClick={() => onNavigate('chat')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Query Chat
        </button>
        <button 
          className={`nav-item ${currentView === 'tables' ? 'active' : ''}`}
          onClick={() => onNavigate('tables')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>
          </svg>
          Schema Explorer
        </button>
        <button 
          className={`nav-item ${currentView === 'schema_designer' ? 'active' : ''}`}
          onClick={() => onNavigate('schema_designer')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
          Schema Designer
        </button>
        <button 
          className={`nav-item ${currentView === 'data_view' ? 'active' : ''}`}
          onClick={() => onNavigate('data_view')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 3v18"/>
            <path d="M15 3v18"/>
          </svg>
          Data Viewer
        </button>
        <button 
          className={`nav-item ${currentView === 'history' ? 'active' : ''}`}
          onClick={() => onNavigate('history')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          History
        </button>

        {activeModule && (
          <>
            <div style={{ 
              margin: '24px 0 8px 16px', 
              fontSize: '0.7rem', 
              fontWeight: 700, 
              color: 'var(--text-secondary)', 
              textTransform: 'uppercase', 
              letterSpacing: '0.08em',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              paddingTop: '16px'
            }}>
              Inventory Actions
            </div>
            
            {activeModule !== 'add_inventory' && (
              <button 
                className="nav-item"
                onClick={() => onSelectOperation('add_inventory')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add to inventory
              </button>
            )}

            {activeModule !== 'check_inventory' && (
              <button 
                className="nav-item"
                onClick={() => onSelectOperation('check_inventory')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                Check into inventory
              </button>
            )}

            {activeModule !== 'removed_items' && (
              <button 
                className="nav-item"
                onClick={() => onSelectOperation('removed_items')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  <line x1="10" y1="11" x2="10" y2="17"/>
                  <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
                Removed items
              </button>
            )}
          </>
        )}
      </nav>

      <div className="health-panel">
        <div style={{fontWeight: 600, marginBottom: 12}}>System Status</div>
        
        {health ? (
          <>
            <div className="health-row">
              <span>Engine</span>
              <span>
                <span className={`status-indicator ${health.status === 'ok' ? 'status-ok' : 'status-error'}`}></span>
                {health.status === 'ok' ? 'Online' : 'Degraded'}
              </span>
            </div>
            <div className="health-row">
              <span>Database</span>
              <span style={{color: health.db_connected ? 'var(--success)' : 'var(--danger)'}}>
                {health.db_connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="health-row">
              <span>Model</span>
              <span style={{fontFamily: 'var(--font-mono)', fontSize: '0.75rem'}}>{health.model}</span>
            </div>
            <div className="health-row">
              <span>Tables</span>
              <span>{health.tables_loaded} indexed</span>
            </div>
          </>
        ) : (
          <div style={{color: 'var(--text-secondary)'}}>Checking health...</div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
