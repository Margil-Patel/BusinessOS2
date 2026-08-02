import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';

/**
 * getTableDomainMeta
 * Assigns a unique domain accent color and icon based on table and schema keywords.
 */
const getTableDomainMeta = (name = '', schema = '') => {
  const str = `${schema}.${name}`.toLowerCase();
  
  if (str.includes('agri') || str.includes('farmer') || str.includes('crop') || str.includes('farm')) {
    return {
      accent: '#3fb950', // Green
      border: 'rgba(63, 185, 80, 0.4)',
      bg: 'rgba(63, 185, 80, 0.12)',
      glow: 'rgba(63, 185, 80, 0.25)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.4 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/>
          <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
        </svg>
      )
    };
  }
  
  if (str.includes('milk') || str.includes('dairy') || str.includes('med') || str.includes('pharm') || str.includes('health')) {
    return {
      accent: '#f0883e', // Orange
      border: 'rgba(240, 136, 62, 0.4)',
      bg: 'rgba(240, 136, 62, 0.12)',
      glow: 'rgba(240, 136, 62, 0.25)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f0883e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.5 20.5h3s1 0 1-1v-12s0-1-1-1h-3s-1 0-1 1v12s0 1 1 1Z"/>
          <path d="M9.5 6.5h5v-3h-5z"/>
          <path d="m8.5 12.5 7 0"/>
        </svg>
      )
    };
  }

  if (str.includes('vehicle') || str.includes('car') || str.includes('auto') || str.includes('garage') || str.includes('truck')) {
    return {
      accent: '#a371f7', // Purple
      border: 'rgba(163, 113, 247, 0.4)',
      bg: 'rgba(163, 113, 247, 0.12)',
      glow: 'rgba(163, 113, 247, 0.25)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a371f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="3" width="15" height="13" rx="2"/>
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
          <circle cx="5.5" cy="18.5" r="2.5"/>
          <circle cx="18.5" cy="18.5" r="2.5"/>
        </svg>
      )
    };
  }

  if (str.includes('version') || str.includes('schema') || str.includes('system') || str.includes('meta')) {
    return {
      accent: '#f778ba', // Pink
      border: 'rgba(247, 120, 186, 0.4)',
      bg: 'rgba(247, 120, 186, 0.12)',
      glow: 'rgba(247, 120, 186, 0.25)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f778ba" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/>
          <polyline points="2 17 12 22 22 17"/>
          <polyline points="2 12 12 17 22 12"/>
        </svg>
      )
    };
  }

  if (str.includes('student') || str.includes('edu') || str.includes('school') || str.includes('course') || str.includes('class')) {
    return {
      accent: '#38bdf8', // Cyan
      border: 'rgba(56, 189, 248, 0.4)',
      bg: 'rgba(56, 189, 248, 0.12)',
      glow: 'rgba(56, 189, 248, 0.25)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
          <path d="M6 12v5c3 3 9 3 12 0v-5"/>
        </svg>
      )
    };
  }

  if (str.includes('tile') || str.includes('inventory') || str.includes('stock') || str.includes('store') || str.includes('item')) {
    return {
      accent: '#e3b341', // Amber
      border: 'rgba(227, 179, 65, 0.4)',
      bg: 'rgba(227, 179, 65, 0.12)',
      glow: 'rgba(227, 179, 65, 0.25)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e3b341" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m7.5 4.27 9 5.15"/>
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
          <path d="m3.3 7 8.7 5 8.7-5"/>
          <path d="M12 22V12"/>
        </svg>
      )
    };
  }

  if (str.includes('sale') || str.includes('fin') || str.includes('pay') || str.includes('order') || str.includes('bill')) {
    return {
      accent: '#388bfd', // Blue
      border: 'rgba(56, 139, 253, 0.4)',
      bg: 'rgba(56, 139, 253, 0.12)',
      glow: 'rgba(56, 139, 253, 0.25)',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#388bfd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2"/>
          <line x1="2" y1="10" x2="22" y2="10"/>
        </svg>
      )
    };
  }

  // Default Blue Table Icon
  return {
    accent: '#388bfd',
    border: 'rgba(56, 139, 253, 0.4)',
    bg: 'rgba(56, 139, 253, 0.12)',
    glow: 'rgba(56, 139, 253, 0.25)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#388bfd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M3 9h18M3 15h18M9 3v18"/>
      </svg>
    )
  };
};

/**
 * Schema Explorer (TablesView)
 * Redesigned Schema Explorer page inspired by Supabase Studio, PlanetScale, Neon, and Prisma Studio.
 */
const TablesView = ({ onSelectTable }) => {
  const [tables, setTables]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState('');
  const [viewMode, setViewMode]   = useState(() => localStorage.getItem('schema_explorer_view_mode') || 'grid');
  const [activeMenuFqn, setActiveMenuFqn] = useState(null);
  const [toastMsg, setToastMsg]   = useState(null);

  const searchInputRef = useRef(null);

  useEffect(() => {
    fetchTables();
  }, []);

  // Save view mode preference
  const handleSetViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem('schema_explorer_view_mode', mode);
  };

  // Keyboard shortcut Ctrl+K to focus search input
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close active dropdown menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuFqn(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const fetchTables = async () => {
    try {
      const data = await api.getTables();
      setTables(data || []);
    } catch (e) {
      setError(e.message || 'Failed to fetch discovered tables');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Search filter matching Table Name, Schema Name, or Column Names
  const filteredTables = (tables || []).filter((t) => {
    const nameStr   = (t.name || t.qualified_name || '').toLowerCase();
    const schemaStr = (t.schema_name || t.schema || '').toLowerCase();
    const colsStr   = (t.columns || []).map((c) => c.name.toLowerCase()).join(' ');
    const q         = search.toLowerCase().trim();
    
    if (!q) return true;
    return nameStr.includes(q) || schemaStr.includes(q) || colsStr.includes(q);
  });

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text);
    showToast(`Copied ${label} to clipboard!`);
    setActiveMenuFqn(null);
  };

  return (
    <div className="se-container" style={{ padding: '24px 32px', height: '100%', overflowY: 'auto', background: '#0d1117' }}>
      
      {/* ── Toast Notification ────────────────────────────────────────── */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 24, right: 32, zIndex: 9999,
          background: '#1c2128', border: '1px solid #388bfd', color: '#58a6ff',
          padding: '10px 18px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', gap: 8,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <span>✨</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ── Compact Header (60px) ────────────────────────────────────── */}
      <div className="se-header" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 60, marginBottom: 24, borderBottom: '1px solid rgba(48,54,61,0.5)',
        paddingBottom: 16
      }}>
        {/* Left Side: Title & Table Count Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'white', letterSpacing: '-0.02em' }}>
            Discovered Tables
          </h1>
          <span style={{
            background: 'rgba(48,54,61,0.6)', border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)', padding: '3px 10px', borderRadius: 12,
            fontSize: '0.78rem', fontWeight: 600, fontFamily: 'var(--font-mono)'
          }}>
            {tables.length} {tables.length === 1 ? 'table' : 'tables'}
          </span>
        </div>

        {/* Right Side: Search Box & View Mode Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Modern Search Input */}
          <div style={{ position: 'relative', width: 280 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Search tables or columns..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', background: '#161b22', border: '1px solid var(--border-color)', 
                color: 'white', padding: '8px 36px 8px 36px', borderRadius: 8, outline: 'none',
                fontSize: '0.85rem', transition: 'border-color 0.15s',
                boxSizing: 'border-box'
              }}
            />
            <span style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(48,54,61,0.5)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4, padding: '2px 5px', fontSize: '0.68rem', color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)', pointerEvents: 'none'
            }}>
              Ctrl+K
            </span>
          </div>

          {/* View Mode Switcher (Grid / List) */}
          <div style={{ display: 'flex', background: '#161b22', border: '1px solid var(--border-color)', borderRadius: 8, padding: 3 }}>
            <button
              onClick={() => handleSetViewMode('grid')}
              title="Grid View"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 6, border: 'none',
                background: viewMode === 'grid' ? '#388bfd' : 'transparent',
                color: viewMode === 'grid' ? 'white' : 'var(--text-secondary)',
                cursor: 'pointer', transition: 'all 0.15s'
              }}
            >
              {/* Grid Icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
            </button>

            <button
              onClick={() => handleSetViewMode('list')}
              title="List View"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 6, border: 'none',
                background: viewMode === 'list' ? '#388bfd' : 'transparent',
                color: viewMode === 'list' ? 'white' : 'var(--text-secondary)',
                cursor: 'pointer', transition: 'all 0.15s'
              }}
            >
              {/* List Icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Status States ─────────────────────────────────────────────── */}
      {loading && (
        <div style={{ color: 'var(--text-secondary)', padding: '48px 0', textAlign: 'center', fontSize: '0.95rem' }}>
          Loading database schema explorer...
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--danger)', padding: '24px', background: 'rgba(218,54,51,0.1)', border: '1px solid rgba(218,54,51,0.3)', borderRadius: 10, marginBottom: 24 }}>
          {error}
        </div>
      )}

      {!loading && !error && filteredTables.length === 0 && (
        <div style={{ color: 'var(--text-secondary)', padding: '64px 0', textAlign: 'center' }}>
          <div style={{ fontSize: '1.1rem', color: 'white', marginBottom: 8, fontWeight: 600 }}>No matching tables found</div>
          <div style={{ fontSize: '0.85rem' }}>Try refining your search term or search for specific column names.</div>
        </div>
      )}

      {/* ── GRID VIEW MODE ────────────────────────────────────────────── */}
      {!loading && !error && viewMode === 'grid' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 20,
          paddingBottom: 40
        }}>
          {filteredTables.map((table) => {
            const tableName   = table.name || table.qualified_name?.split('.').pop();
            const schemaName  = table.schema_name || table.schema || table.qualified_name?.split('.')[0] || 'public';
            const fqn         = table.qualified_name || `${schemaName}.${tableName}`;
            const cols        = table.columns || [];
            const pkCol       = cols.find((c) => c.is_primary_key)?.name || cols[0]?.name || 'id';
            const meta        = getTableDomainMeta(tableName, schemaName);
            const previewCols = cols.slice(0, 5);
            const extraCount  = cols.length > 5 ? cols.length - 5 : 0;
            const isMenuOpen  = activeMenuFqn === fqn;

            return (
              <div 
                key={fqn} 
                className="se-card"
                onClick={() => onSelectTable?.(table)}
                style={{
                  background: '#161b22',
                  border: '1px solid var(--border-color)',
                  borderRadius: 14,
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.borderColor = meta.accent;
                  e.currentTarget.style.boxShadow = `0 12px 28px -6px ${meta.glow}`;
                  const arrow = e.currentTarget.querySelector('.se-card-arrow');
                  if (arrow) arrow.style.transform = 'translateX(3px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.boxShadow = 'none';
                  const arrow = e.currentTarget.querySelector('.se-card-arrow');
                  if (arrow) arrow.style.transform = 'translateX(0)';
                }}
              >
                {/* ── Card Header ──────────────────────────────────────── */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden', flex: 1, minWidth: 0 }}>
                    {/* Domain Icon */}
                    <div style={{
                      width: 42, height: 42, borderRadius: 10,
                      background: meta.bg, border: `1px solid ${meta.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {meta.icon}
                    </div>

                    <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                      {/* Table Name (20px bold) */}
                      <div 
                        title={tableName}
                        style={{
                          fontSize: '1.25rem', fontWeight: 700, color: 'white', lineHeight: 1.2, letterSpacing: '-0.01em',
                          textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap'
                        }}
                      >
                        {tableName}
                      </div>
                      {/* Schema Name (14px muted) */}
                      <div style={{
                        fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 2,
                        textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap'
                      }}>
                        {schemaName}
                      </div>
                    </div>
                  </div>

                  {/* Right Header: Column Count Badge & Arrow Button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{
                      background: 'rgba(48,54,61,0.5)', border: '1px solid rgba(255,255,255,0.08)',
                      color: 'var(--text-secondary)', padding: '3px 8px', borderRadius: 10,
                      fontSize: '0.75rem', fontWeight: 500, fontFamily: 'var(--font-mono)',
                      whiteSpace: 'nowrap'
                    }}>
                      {cols.length} {cols.length === 1 ? 'column' : 'columns'}
                    </span>

                    <button
                      className="se-card-arrow"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTable?.(table);
                      }}
                      title="Open Table Detail"
                      style={{
                        width: 28, height: 28, borderRadius: 6, border: 'none',
                        background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', transition: 'transform 0.15s ease'
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* ── Divider ─────────────────────────────────────────── */}
                <div style={{ height: 1, background: 'rgba(48,54,61,0.5)', marginBottom: 14 }} />

                {/* ── Column Preview ──────────────────────────────────── */}
                <div style={{ flex: 1, marginBottom: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {previewCols.map((col) => (
                      <div key={col.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                          <span style={{ color: meta.accent, fontSize: '0.9rem', lineHeight: 1 }}>•</span>
                          <span style={{ color: '#e6edf3', fontWeight: 500, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {col.name}
                          </span>
                          {col.is_primary_key && <span title="Primary Key" style={{ fontSize: '0.8rem' }}>🔑</span>}
                        </div>

                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', fontFamily: 'var(--font-mono)', flexShrink: 0, marginLeft: 12 }}>
                          {(col.type || col.data_type || 'TEXT').toUpperCase()}
                        </span>
                      </div>
                    ))}

                    {extraCount > 0 && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 4 }}>
                        + {extraCount} more {extraCount === 1 ? 'column' : 'columns'}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Divider ─────────────────────────────────────────── */}
                <div style={{ height: 1, background: 'rgba(48,54,61,0.5)', marginBottom: 12 }} />

                {/* ── Card Footer: Primary Key & More Menu ────────────── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#e3b341', fontWeight: 600 }}>
                    <span>🔑</span>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>Primary Key:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: '#e3b341' }}>{pkCol}</span>
                  </div>

                  {/* Three Dot More Menu */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuFqn(isMenuOpen ? null : fqn);
                    }}
                    title="More actions"
                    style={{
                      width: 28, height: 28, borderRadius: 6, border: 'none',
                      background: isMenuOpen ? 'rgba(255,255,255,0.1)' : 'transparent',
                      color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', fontSize: '1rem', fontWeight: 700, transition: 'all 0.15s'
                    }}
                  >
                    ⋮
                  </button>

                  {/* Dropdown Menu Popup */}
                  {isMenuOpen && (
                    <div style={{
                      position: 'absolute', bottom: 34, right: 0, zIndex: 100,
                      background: '#1c2128', border: '1px solid var(--border-color)',
                      borderRadius: 8, padding: '6px 0', width: 180,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                    }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTable?.(table);
                        }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 14px', background: 'none', border: 'none',
                          color: '#e6edf3', fontSize: '0.82rem', cursor: 'pointer', textAlign: 'left'
                        }}
                      >
                        <span>🔍</span> View Schema Details
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(fqn, 'Table Name');
                        }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 14px', background: 'none', border: 'none',
                          color: '#e6edf3', fontSize: '0.82rem', cursor: 'pointer', textAlign: 'left'
                        }}
                      >
                        <span>📋</span> Copy Table Name
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(`SELECT * FROM ${fqn};`, 'SELECT Query');
                        }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 14px', background: 'none', border: 'none',
                          color: '#e6edf3', fontSize: '0.82rem', cursor: 'pointer', textAlign: 'left'
                        }}
                      >
                        <span>⚡</span> Copy SELECT Query
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── LIST VIEW MODE ────────────────────────────────────────────── */}
      {!loading && !error && viewMode === 'list' && (
        <div style={{ background: '#161b22', border: '1px solid var(--border-color)', borderRadius: 14, overflow: 'hidden', marginBottom: 40 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '48px 2fr 1fr 1fr 1fr 60px',
            padding: '12px 20px', background: '#0d1117', borderBottom: '1px solid var(--border-color)',
            fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase'
          }}>
            <div>Icon</div>
            <div>Table Name</div>
            <div>Schema</div>
            <div>Columns</div>
            <div>Primary Key</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {filteredTables.map((table) => {
            const tableName   = table.name || table.qualified_name?.split('.').pop();
            const schemaName  = table.schema_name || table.schema || table.qualified_name?.split('.')[0] || 'public';
            const fqn         = table.qualified_name || `${schemaName}.${tableName}`;
            const cols        = table.columns || [];
            const pkCol       = cols.find((c) => c.is_primary_key)?.name || cols[0]?.name || 'id';
            const meta        = getTableDomainMeta(tableName, schemaName);

            return (
              <div 
                key={fqn}
                onClick={() => onSelectTable?.(table)}
                style={{
                  display: 'grid', gridTemplateColumns: '48px 2fr 1fr 1fr 1fr 60px',
                  alignItems: 'center', padding: '14px 20px',
                  borderBottom: '1px solid rgba(48,54,61,0.5)',
                  cursor: 'pointer', transition: 'background 0.1s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                {/* Icon */}
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: meta.bg, border: `1px solid ${meta.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {meta.icon}
                </div>

                {/* Table Name */}
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'white' }}>
                  {tableName}
                </div>

                {/* Schema */}
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {schemaName}
                </div>

                {/* Columns */}
                <div>
                  <span style={{
                    background: 'rgba(48,54,61,0.5)', border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: 10,
                    fontSize: '0.75rem', fontWeight: 500, fontFamily: 'var(--font-mono)'
                  }}>
                    {cols.length} cols
                  </span>
                </div>

                {/* Primary Key */}
                <div style={{ fontSize: '0.82rem', color: '#e3b341', fontFamily: 'var(--font-mono)' }}>
                  🔑 {pkCol}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTable?.(table);
                    }}
                    style={{
                      width: 28, height: 28, borderRadius: 6, border: 'none',
                      background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TablesView;
