import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import TablesView from './components/TablesView';
import HistoryView from './components/HistoryView';
import TableDetail from './components/TableDetail';
import { api } from './services/api';

function App() {
  const [currentView, setCurrentView] = useState('chat'); // 'chat', 'tables', 'history', 'table_detail'
  const [selectedTable, setSelectedTable] = useState(null);
  const [health, setHealth] = useState(null);
  
  // Chat state lifted to preserve history across view switches
  const [chatMessages, setChatMessages] = useState([]);
  const [explainMode, setExplainMode] = useState(false);

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
      case 'chat':
      default:
        return (
          <ChatArea 
            messages={chatMessages} 
            setMessages={setChatMessages}
            explainMode={explainMode}
            setExplainMode={setExplainMode}
          />
        );
    }
  };

  const handleNewChat = () => {
    setChatMessages([]);
    setCurrentView('chat');
  };

  return (
    <>
      <Sidebar 
        currentView={currentView} 
        onNavigate={setCurrentView} 
        onNewChat={handleNewChat}
        health={health} 
      />
      <main className="main-content">
        <header className="topbar">
          <h2>NL2SQL Engine 
            <span style={{color: 'var(--text-secondary)', fontSize: '0.9rem', marginLeft: 12}}>
              {currentView === 'chat' && 'Query Chat'}
              {currentView === 'tables' && 'Schema Explorer'}
              {currentView === 'table_detail' && `Table: ${selectedTable?.name}`}
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
