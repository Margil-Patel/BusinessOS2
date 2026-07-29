import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import TablesView from './components/TablesView';
import HistoryView from './components/HistoryView';
import TableDetail from './components/TableDetail';
import SchemaDesigner from './components/SchemaDesigner';
import DataView from './components/DataView';
import ErrorBoundary from './components/ErrorBoundary';
import { api } from './services/api';

/**
 * Helper to parse HTML5 pathname into view + params.
 */
const parseUrlPath = (pathname) => {
  const path = pathname.toLowerCase().replace(/\/$/, '');
  
  if (path === '' || path === '/chat') {
    return { view: 'chat', tableFqn: null };
  }
  if (path === '/tables') {
    return { view: 'tables', tableFqn: null };
  }
  if (path.startsWith('/tables/')) {
    const rawFqn = pathname.slice(8).replace(/\/$/, '');
    if (rawFqn) {
      return { view: 'table_detail', tableFqn: decodeURIComponent(rawFqn) };
    }
    return { view: 'tables', tableFqn: null };
  }
  if (path.startsWith('/schema-designer')) {
    return { view: 'schema_designer', tableFqn: null };
  }
  if (path.startsWith('/data-view')) {
    const rawFqn = pathname.slice(10).replace(/\/$/, '').replace(/^\//, '');
    return { view: 'data_view', tableFqn: rawFqn ? decodeURIComponent(rawFqn) : null };
  }
  if (path.startsWith('/history')) {
    return { view: 'history', tableFqn: null };
  }
  return { view: 'chat', tableFqn: null };
};

/**
 * Helper to construct URL path from view + params.
 */
const getPathForView = (view, tableFqn = null) => {
  switch (view) {
    case 'tables':          return '/tables';
    case 'table_detail':    return tableFqn ? `/tables/${encodeURIComponent(tableFqn)}` : '/tables';
    case 'schema_designer': return '/schema-designer';
    case 'data_view':       return tableFqn ? `/data-view/${encodeURIComponent(tableFqn)}` : '/data-view';
    case 'history':         return '/history';
    case 'chat':
    default:                return '/chat';
  }
};

function App() {
  const [currentView, setCurrentView]   = useState('chat');
  const [selectedTable, setSelectedTable] = useState(null);
  const [health, setHealth]               = useState(null);
  
  // Chat state lifted to preserve history across view switches
  const [chatMessages, setChatMessages] = useState([]);
  const [explainMode, setExplainMode]   = useState(false);
  const [activeModule, setActiveModule] = useState(null);

  // Splash screen state
  const [showSplash, setShowSplash] = useState(true);
  const [splashFade, setSplashFade] = useState(false);

  // ── Sync initial route on mount & handle browser Back/Forward (popstate) ─────
  useEffect(() => {
    const initialRoute = parseUrlPath(window.location.pathname);
    setCurrentView(initialRoute.view);
    if (initialRoute.tableFqn) {
      setSelectedTable((prev) => prev?.qualified_name === initialRoute.tableFqn ? prev : { qualified_name: initialRoute.tableFqn, name: initialRoute.tableFqn.split('.').pop() });
    }

    const handlePopState = () => {
      const route = parseUrlPath(window.location.pathname);
      setCurrentView(route.view);
      if (route.tableFqn) {
        setSelectedTable((prev) => prev?.qualified_name === route.tableFqn ? prev : { qualified_name: route.tableFqn, name: route.tableFqn.split('.').pop() });
      } else {
        setSelectedTable(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // ── Router Navigation Handler ─────────────────────────────────────────────
  const navigateTo = useCallback((view, tableFqn = null, fullTableObj = null) => {
    const targetPath = getPathForView(view, tableFqn);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ view, tableFqn }, '', targetPath);
    }
    setCurrentView(view);
    if (fullTableObj) {
      setSelectedTable(fullTableObj);
    } else if (tableFqn) {
      setSelectedTable({ qualified_name: tableFqn, name: tableFqn.split('.').pop() });
    } else if (view !== 'table_detail') {
      setSelectedTable(null);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSplashFade(true);
      const removeTimer = setTimeout(() => {
        setShowSplash(false);
      }, 800);
      return () => clearTimeout(removeTimer);
    }, 4000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchHealth = async () => {
    try {
      const data = await api.getHealth();
      setHealth(data);
    } catch (e) {
      setHealth({ status: 'error', error: e.message });
    }
  };

  const renderView = () => {
    switch (currentView) {
      case 'tables': 
        return (
          <TablesView
            onSelectTable={(table) => {
              const fqn = table.qualified_name || `${table.schema_name || 'public'}.${table.name}`;
              navigateTo('table_detail', fqn, table);
            }}
          />
        );
      case 'table_detail':
        return (
          <TableDetail
            table={selectedTable || { qualified_name: 'public.tables' }}
            onBack={() => navigateTo('tables')}
          />
        );
      case 'history': 
        return <HistoryView onSelectQuery={() => navigateTo('chat')} />;
      case 'schema_designer':
        return <SchemaDesigner />;
      case 'data_view':
        return <DataView initialFqn={selectedTable?.qualified_name} />;
      case 'chat':
      default:
        return (
          <ChatArea 
            messages={chatMessages} 
            setMessages={setChatMessages}
            explainMode={explainMode}
            setExplainMode={setExplainMode}
            activeModule={activeModule}
            setActiveModule={setActiveModule}
          />
        );
    }
  };

  const handleNewChat = () => {
    setChatMessages([]);
    navigateTo('chat');
    setActiveModule(null);
  };

  const handleSelectOperation = (op) => {
    setChatMessages([]);
    navigateTo('chat');
    setActiveModule(op);
  };

  return (
    <>
      {showSplash && (
        <div className={`splash-container ${splashFade ? 'fade-out' : ''}`}>
          <div className="splash-content">
            <h1 className="splash-logo">NL2SQL</h1>
            <div className="splash-subtitle">Intelligent Query Engine</div>
            <div className="splash-loader">
              <div className="splash-loader-bar"></div>
            </div>
          </div>
        </div>
      )}
      <Sidebar 
        currentView={currentView} 
        onNavigate={(view) => navigateTo(view)} 
        onNewChat={handleNewChat}
        health={health} 
        activeModule={activeModule}
        onSelectOperation={handleSelectOperation}
      />
      <main className="main-content">
        <header className="topbar">
          <h2>NL2SQL Engine 
            <span style={{color: 'var(--text-secondary)', fontSize: '0.9rem', marginLeft: 12}}>
              {currentView === 'chat' && 'Query Chat'}
              {currentView === 'tables' && 'Schema Explorer'}
              {currentView === 'table_detail' && `Table: ${selectedTable?.qualified_name || selectedTable?.name}`}
              {currentView === 'schema_designer' && 'Schema Designer'}
              {currentView === 'data_view' && 'Data Viewer'}
              {currentView === 'history' && 'Query History'}
            </span>
          </h2>
        </header>
        <ErrorBoundary key={currentView} onReset={() => navigateTo('chat')}>
          {renderView()}
        </ErrorBoundary>
      </main>
    </>
  );
}

export default App;
