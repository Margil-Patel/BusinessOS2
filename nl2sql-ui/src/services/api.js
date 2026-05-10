const API_BASE = 'http://localhost:8000';

export const api = {
  async query(nlQuery, explainOnly = false) {
    const endpoint = explainOnly ? '/explain' : '/query';
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nl_query: nlQuery, options: { explain_only: explainOnly } })
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
  }
};
