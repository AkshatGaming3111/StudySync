// API Client Wrapper with Token Interceptor

const API_BASE = '/api';

class ApiClient {
  static getToken() {
    return localStorage.getItem('studysync_token') || '';
  }

  static setToken(token) {
    if (token) {
      localStorage.setItem('studysync_token', token);
    } else {
      localStorage.removeItem('studysync_token');
    }
  }

  static getHeaders(customHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...customHeaders
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  static async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = this.getHeaders(options.headers || {});
    
    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json().catch(() => ({}));

      if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/register')) {
        // Token expired or unauthorized -> redirect to auth.html
        this.setToken(null);
        if (window.location.pathname.includes('dashboard.html')) {
          window.location.href = 'auth.html';
        }
      }

      if (!response.ok) {
        throw new Error(data.message || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  static get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  static post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  static put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  static delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
}

window.ApiClient = ApiClient;
