const API_BASE = 'http://localhost:8000';

export const api = {
  async query(nlQuery, history = [], explainOnly = false) {
    const endpoint = explainOnly ? '/explain' : '/query';
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        nl_query: nlQuery, 
        history: history,
        options: { explain_only: explainOnly } 
      })
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server error: ${response.status}`);
    }
    return response.json();
  },

  async getHealth() {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) throw new Error('Health check failed');
    return response.json();
  },

  async getTables() {
    const response = await fetch(`${API_BASE}/tables`);
    if (!response.ok) throw new Error('Failed to fetch tables');
    return response.json();
  },

  async getHistory() {
    const response = await fetch(`${API_BASE}/log`);
    if (!response.ok) throw new Error('Failed to fetch history');
    return response.json();
  },

  async getTableData(fqn) {
    // encodeURIComponent is important because fqn contains dots
    const response = await fetch(`${API_BASE}/tables/${encodeURIComponent(fqn)}/data`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Failed to fetch data for ${fqn}`);
    }
    return response.json();
  },

  async insertRow(fqn, rowData) {
    const response = await fetch(`${API_BASE}/tables/${encodeURIComponent(fqn)}/insert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rowData)
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server error: ${response.status}`);
    }
    return response.json();
  },

  async createTable(fqn, columns) {
    const response = await fetch(`${API_BASE}/schema/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fqn, columns })
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server error: ${response.status}`);
    }
    return response.json();
  },

  async addColumn(fqn, name, type) {
    const response = await fetch(`${API_BASE}/schema/tables/${encodeURIComponent(fqn)}/columns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type })
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server error: ${response.status}`);
    }
    return response.json();
  },

  async renameColumn(fqn, oldName, newName) {
    const response = await fetch(`${API_BASE}/schema/tables/${encodeURIComponent(fqn)}/columns/${encodeURIComponent(oldName)}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_name: newName })
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server error: ${response.status}`);
    }
    return response.json();
  },

  async changeColumnType(fqn, columnName, newType) {
    const response = await fetch(`${API_BASE}/schema/tables/${encodeURIComponent(fqn)}/columns/${encodeURIComponent(columnName)}/type`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_type: newType })
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server error: ${response.status}`);
    }
    return response.json();
  },

  async dropColumn(fqn, columnName) {
    const response = await fetch(`${API_BASE}/schema/tables/${encodeURIComponent(fqn)}/columns/${encodeURIComponent(columnName)}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server error: ${response.status}`);
    }
    return response.json();
  },

  async alterTable(fqn, columns) {
    const response = await fetch(`${API_BASE}/schema/tables/${encodeURIComponent(fqn)}/alter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columns })
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server error: ${response.status}`);
    }
    return response.json();
  },

  async checkTableDelete(fqn) {
    const response = await fetch(`${API_BASE}/schema/tables/${encodeURIComponent(fqn)}/delete-check`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server error: ${response.status}`);
    }
    return response.json();
  },

  async checkColumnDelete(fqn, columnName) {
    const response = await fetch(`${API_BASE}/schema/tables/${encodeURIComponent(fqn)}/columns/${encodeURIComponent(columnName)}/delete-check`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server error: ${response.status}`);
    }
    return response.json();
  },

  async dropTable(fqn) {
    const response = await fetch(`${API_BASE}/schema/tables/${encodeURIComponent(fqn)}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server error: ${response.status}`);
    }
    return response.json();
  },

  async getTableVersions(fqn) {
    const response = await fetch(`${API_BASE}/schema/tables/${encodeURIComponent(fqn)}/versions`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server error: ${response.status}`);
    }
    return response.json();
  },

  async restoreSchemaVersion(fqn, versionNumber) {
    const response = await fetch(`${API_BASE}/schema/tables/${encodeURIComponent(fqn)}/versions/${encodeURIComponent(versionNumber)}/restore`, {
      method: 'POST'
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server error: ${response.status}`);
    }
    return response.json();
  },

  async generateAISchema(prompt) {
    const response = await fetch(`${API_BASE}/schema/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server error: ${response.status}`);
    }
    return response.json();
  }
};
