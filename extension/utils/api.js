/**
 * FormPilot AI — API Client
 */
 
const API_URLS = {
  production: 'https://formpilot-backend.onrender.com',
  development: 'http://localhost:5000',
};
 
async function getBaseURL() {
  const result = await chrome.storage.local.get(['fp_env']);
  const env = result['fp_env'] || 'production';
  return API_URLS[env] || API_URLS.production;
}
 
async function getAccessToken() {
  const result = await chrome.storage.local.get(['fp_access_token', 'fp_token_expiry']);
  const token = result['fp_access_token'];
  const expiry = result['fp_token_expiry'];
  if (!token) return null;
  if (expiry && Date.now() >= expiry) return await refreshAndGetToken();
  return token;
}
 
async function refreshAndGetToken() {
  try {
    const result = await chrome.storage.local.get(['fp_refresh_token']);
    const refreshToken = result['fp_refresh_token'];
    if (!refreshToken) return null;
    const base = await getBaseURL();
    const res = await fetch(base + '/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      await chrome.storage.local.remove(['fp_access_token', 'fp_refresh_token', 'fp_user', 'fp_token_expiry']);
      return null;
    }
    const data = await res.json();
    const newToken = data.data && data.data.accessToken;
    if (newToken) {
      const payload = JSON.parse(atob(newToken.split('.')[1]));
      await chrome.storage.local.set({
        'fp_access_token': newToken,
        'fp_token_expiry': payload.exp * 1000,
      });
      return newToken;
    }
    return null;
  } catch (e) {
    return null;
  }
}
 
var FPApi = {
  request: async function(endpoint, options) {
    options = options || {};
    var base = await getBaseURL();
    var token = await getAccessToken();
    var headers = { 'Content-Type': 'application/json' };
    if (options.headers) {
      Object.assign(headers, options.headers);
    }
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 30000);
    try {
      var res = await fetch(base + endpoint, Object.assign({}, options, {
        headers: headers,
        signal: controller.signal,
      }));
      var data;
      try { data = await res.json(); } catch(e) { data = { success: false, message: 'Invalid response' }; }
      if (!res.ok) {
        var err = new Error(data.message || ('HTTP ' + res.status));
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Request timed out. Check your connection.');
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  },
 
  get: function(endpoint, options) {
    return FPApi.request(endpoint, Object.assign({}, options || {}, { method: 'GET' }));
  },
  post: function(endpoint, body, options) {
    return FPApi.request(endpoint, Object.assign({}, options || {}, { method: 'POST', body: JSON.stringify(body) }));
  },
  put: function(endpoint, body, options) {
    return FPApi.request(endpoint, Object.assign({}, options || {}, { method: 'PUT', body: JSON.stringify(body) }));
  },
  delete: function(endpoint, options) {
    return FPApi.request(endpoint, Object.assign({}, options || {}, { method: 'DELETE' }));
  },
 
  auth: {
    register: function(data) { return FPApi.post('/api/auth/register', data); },
    login: function(data) { return FPApi.post('/api/auth/login', data); },
    logout: function() { return FPApi.post('/api/auth/logout', {}); },
    getMe: function() { return FPApi.get('/api/auth/me'); },
    updateMe: function(data) { return FPApi.put('/api/auth/me', data); },
    changePassword: function(data) { return FPApi.put('/api/auth/change-password', data); },
  },
 
  profiles: {
    list: function() { return FPApi.get('/api/profiles'); },
    get: function(id) { return FPApi.get('/api/profiles/' + id); },
    create: function(data) { return FPApi.post('/api/profiles', data); },
    update: function(id, data) { return FPApi.put('/api/profiles/' + id, data); },
    delete: function(id) { return FPApi.delete('/api/profiles/' + id); },
    duplicate: function(id) { return FPApi.post('/api/profiles/' + id + '/duplicate', {}); },
    setDefault: function(id) { return FPApi.put('/api/profiles/' + id + '/set-default', {}); },
  },
 
  ai: {
    generateAnswers: function(data) { return FPApi.post('/api/ai/generate-answers', data); },
    parseResume: function(data) { return FPApi.post('/api/ai/parse-resume', data); },
    getUsage: function() { return FPApi.get('/api/ai/usage'); },
  },
 
  forms: {
    getHistory: function(params) {
      var qs = new URLSearchParams(params || {}).toString();
      return FPApi.get('/api/forms/history' + (qs ? '?' + qs : ''));
    },
    getAnalytics: function() { return FPApi.get('/api/forms/analytics'); },
    save: function(data) { return FPApi.post('/api/forms/history', data); },
    delete: function(id) { return FPApi.delete('/api/forms/history/' + id); },
    clearAll: function() { return FPApi.delete('/api/forms/history'); },
  },
};
 
window.FPApi = FPApi;