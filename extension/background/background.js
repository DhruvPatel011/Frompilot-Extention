/**
 * FormPilot AI — Background Service Worker v2
 * Handles API proxy, auth, badge management, Gemini AI
 */

const API_URLS = {
  production: 'https://formpilot-backend.onrender.com',
  development: 'http://localhost:5000',
};

async function getBaseURL() {
  const r = await chrome.storage.local.get(['fp_env']);
  return API_URLS[r['fp_env'] || 'production'];
}

async function getToken() {
  const r = await chrome.storage.local.get(['fp_access_token', 'fp_token_expiry']);
  const token = r['fp_access_token'], exp = r['fp_token_expiry'];
  if (!token) return null;
  if (exp && Date.now() >= exp) return null;
  return token;
}

async function apiCall(endpoint, method, body, retries) {
  retries = retries == null ? 2 : retries;
  const base = await getBaseURL();
  const token = await getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`${base}${endpoint}`, {
        method: method || 'GET',
        headers,
        signal: controller.signal,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) {
        const err = new Error(data.message || `HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Request timed out');
      if (err.status === 401) throw err; // don't retry auth errors
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

// ─── Gemini AI ───────────────────────────────────────────────────────────────
async function callGemini(apiKey, prompt, retries) {
  retries = retries == null ? 2 : retries;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
        }),
      });
      clearTimeout(timeout);

      if (res.status === 400) throw new Error('Invalid Gemini API key or bad request');
      if (res.status === 403) throw new Error('Gemini API key invalid or access denied');
      if (res.status === 429) throw new Error('Gemini quota exceeded. Please wait or upgrade your plan.');
      if (res.status === 503) {
        if (attempt < retries) { await new Promise(r => setTimeout(r, 1200 * (attempt + 1))); continue; }
        throw new Error('Gemini service unavailable. Try again later.');
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error.message || 'Gemini API error');
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return text;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Gemini request timed out');
      if (attempt < retries && !err.message.includes('key') && !err.message.includes('quota')) {
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

// ─── Install ──────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await chrome.storage.local.set({ 'fp_env': 'production' });
    // Default light theme
    const settings = { theme: 'light', fillDelay: 80, autoFill: false, fuzzyThreshold: 0.45, highlightFields: true };
    await chrome.storage.local.set({ 'fp_settings': settings });
  }
});

// ─── Message Handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(err => sendResponse({ success: false, error: err.message }));
  return true;
});

async function handleMessage(message, sender) {
  const { type, payload } = message;

  switch (type) {
    case 'GET_AUTH_STATE': {
      const r = await chrome.storage.local.get(['fp_access_token', 'fp_token_expiry', 'fp_user']);
      const token = r['fp_access_token'], exp = r['fp_token_expiry'];
      return { isLoggedIn: !!(token && !(exp && Date.now() >= exp)), user: r['fp_user'] };
    }

    case 'SAVE_TOKENS': {
      const { accessToken, refreshToken, user } = payload;
      const parts = accessToken.split('.');
      const decoded = JSON.parse(atob(parts[1]));
      const data = {
        'fp_access_token': accessToken,
        'fp_token_expiry': decoded.exp * 1000,
        'fp_user': user,
      };
      if (refreshToken) data['fp_refresh_token'] = refreshToken;
      await chrome.storage.local.set(data);
      return { success: true };
    }

    case 'LOGOUT': {
      await chrome.storage.local.remove(['fp_access_token','fp_refresh_token','fp_user','fp_token_expiry']);
      return { success: true };
    }

    case 'API_REQUEST': {
      const { endpoint, method, body } = payload;
      try {
        const data = await apiCall(endpoint, method, body);
        return { success: true, data };
      } catch (err) {
        return { success: false, error: err.message, status: err.status };
      }
    }

    // ─── Gemini AI Answer Generation ────────────────────────────────────────
    case 'GEMINI_GENERATE': {
      const { apiKey, fields, profileKV, formContext, formType } = payload;
      if (!apiKey) return { success: false, error: 'No Gemini API key configured. Add it in Settings.' };
      try {
        const profileSummary = profileKV.map(kv => `${kv.key}: ${kv.value}`).join('\n');
        const fieldList = fields.map((f, i) =>
          `${i}. ${f.label}${f.type !== 'text' ? ` [${f.type}]` : ''}${f.options?.length ? ` Options: ${f.options.join(', ')}` : ''}${f.required ? ' *required' : ''}`
        ).join('\n');
        const prompt = `You are a form-filling assistant. Given the user profile and form fields, generate appropriate answers.

FORM TYPE: ${formType || 'general'}
CONTEXT: ${formContext || 'none'}

USER PROFILE:
${profileSummary}

FORM FIELDS (index. label [type]):
${fieldList}

Respond ONLY with valid JSON: {"answers": {"0": "value", "1": "value", ...}}
Use the field index as the key. Leave empty string "" for fields you cannot answer from the profile.
For select/radio fields, use one of the provided options exactly.
For checkboxes, use "yes" or "no".`;

        const text = await callGemini(apiKey, prompt);
        const clean = text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        return { success: true, data: parsed };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    case 'FORM_DETECTED': {
      const tabId = sender.tab?.id;
      if (tabId) {
        chrome.action.setBadgeText({ text: '!', tabId }).catch(() => {});
        chrome.action.setBadgeBackgroundColor({ color: '#6366f1', tabId }).catch(() => {});
      }
      return { success: true };
    }

    case 'FORM_FILLED': {
      const tabId = sender.tab?.id;
      if (tabId) {
        chrome.action.setBadgeText({ text: '✓', tabId }).catch(() => {});
        chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId }).catch(() => {});
        setTimeout(() => chrome.action.setBadgeText({ text: '', tabId }).catch(() => {}), 3000);
      }
      return { success: true };
    }

    case 'INJECT_FILL': {
      const { tabId, answers } = payload;
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'FILL_FORM', payload: { answers } });
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    case 'SCROLL_TO_FIELD': {
      const { tabId, fieldIndex } = payload;
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'SCROLL_TO_FIELD', payload: { fieldIndex } });
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    default:
      return { success: false, error: `Unknown type: ${type}` };
  }
}

// ─── Tab Updates ──────────────────────────────────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
  }
});

// ─── Keep Alive ───────────────────────────────────────────────────────────────
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'keepAlive') {} // keep SW alive
});
