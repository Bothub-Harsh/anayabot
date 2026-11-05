const SERVER_URL = (import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '');

class ApiService {
  constructor() {
    this.baseUrl = `${SERVER_URL}/api`;
    this.initData = null;
  }

  setInitData(data) {
    this.initData = data;
  }

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.initData) {
      headers['x-telegram-init-data'] = this.initData;
    }
    return headers;
  }

  async request(method, path, body = null) {
    const options = {
      method,
      headers: this.getHeaders()
    };
    if (body) options.body = JSON.stringify(body);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, options);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      return data;
    } catch (err) {
      if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
        throw new Error('Unable to reach Ludo Arena server. If the server is spinning up, please wait a few seconds and try again.');
      }
      throw err;
    }
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  put(path, body) { return this.request('PUT', path, body); }
  delete(path) { return this.request('DELETE', path); }

  // Auth
  login() { return this.post('/auth/login'); }
  getMe() { return this.get('/auth/me'); }

  // Matches
  getMatches() { return this.get('/matches'); }
  getMatch(id) { return this.get(`/matches/${id}`); }
  findByRoomCode(code) { return this.get(`/matches/join/${code}`); }
  createMatch(data) { return this.post('/matches', data); }
  joinMatch(id) { return this.post(`/matches/${id}/join`); }
  startMatch(id) { return this.post(`/matches/${id}/start`); }
  leaveMatch(id) { return this.post(`/matches/${id}/leave`); }
  getMatchComments(id, params = '') { return this.get(`/matches/${id}/comments${params}`); }

  // Users
  getUser(id) { return this.get(`/users/${id}`); }
  getUserMatches(id) { return this.get(`/users/${id}/matches`); }

  // Leaderboard
  getLeaderboard(params = '') { return this.get(`/leaderboard${params}`); }

  // Admin
  getAdminStats() { return this.get('/admin/stats'); }
  banUser(id, reason) { return this.post(`/admin/ban/${id}`, { reason }); }
  unbanUser(id) { return this.post(`/admin/unban/${id}`); }
  deleteComment(id) { return this.delete(`/admin/comments/${id}`); }
  getAdminUsers(page = 1) { return this.get(`/admin/users?page=${page}`); }
}

export const api = new ApiService();
export default api;

