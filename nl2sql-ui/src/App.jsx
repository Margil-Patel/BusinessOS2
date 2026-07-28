import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import TablesView from './components/TablesView';
import HistoryView from './components/HistoryView';
import TableDetail from './components/TableDetail';
import SchemaDesigner from './components/SchemaDesigner';
import { api } from './services/api';

function App() {
  const [currentView, setCurrentView] = useState('chat'); // 'chat', 'tables', 'history', 'table_detail'
  const [selectedTable, setSelectedTable] = useState(null);
  const [health, setHealth] = useState(null);
  
  // Chat state lifted to preserve history across view switches
  const [chatMessages, setChatMessages] = useState([]);
  const [explainMode, setExplainMode] = useState(false);
  const [activeModule, setActiveModule] = useState(null); // Lifted to coordinate with sidebar

  // Splash screen state
  const [showSplash, setShowSplash] = useState(true);
  const [splashFade, setSplashFade] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSplashFade(true);
      const removeTimer = setTimeout(() => {
        setShowSplash(false);
      }, 800); // Matches CSS transition duration
      return () => clearTimeout(removeTimer);
    }, 4000); // Show splash for 4 seconds

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
        return <TablesView onSelectTable={(table) => {
          setSelectedTable(table);
          setCurrentView('table_detail');
        }} />;
      case 'table_detail':
        return <TableDetail table={selectedTable} onBack={() => setCurrentView('tables')} />;
      case 'history': 
        return <HistoryView onSelectQuery={(q) => setCurrentView('chat')} />;
      case 'schema_designer':
        return <SchemaDesigner />;
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
    setCurrentView('chat');
    setActiveModule(null);
  };

  const handleSelectOperation = (op) => {
    setChatMessages([]);
    setCurrentView('chat');
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
        onNavigate={setCurrentView} 
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
              {currentView === 'table_detail' && `Table: ${selectedTable?.name}`}
              {currentView === 'schema_designer' && 'Schema Designer'}
              {currentView === 'history' && 'Query History'}
            </span>
          </h2>
        </header>
        {renderView()}
      </main>
    </>
  );
}

export default App;
