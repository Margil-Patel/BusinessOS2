import React from 'react';

const Sidebar = ({ currentView, onNavigate, health }) => {
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
          className={`nav-item ${currentView === 'history' ? 'active' : ''}`}
          onClick={() => onNavigate('history')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          History
        </button>
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
