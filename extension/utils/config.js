/**
 * FormPilot AI — Configuration
 * Handles environment-based API URLs. No hardcoded localhost.
 */

const CONFIG = {
  // ─── API URLs ───────────────────────────────────────────────────────────────
  // Set your deployed backend URL here for production builds
  // For development: set in chrome.storage.local via the options page
  API_URLS: {
    production: 'https://formpilot-backend.onrender.com',
    staging: 'https://formpilot-api-staging.onrender.com',
    development: 'http://localhost:5000',
  },
  
  // ─── Storage Keys ───────────────────────────────────────────────────────────
  STORAGE_KEYS: {
    ACCESS_TOKEN: 'fp_access_token',
    REFRESH_TOKEN: 'fp_refresh_token',
    USER: 'fp_user',
    ACTIVE_PROFILE: 'fp_active_profile',
    SETTINGS: 'fp_settings',
    ENV: 'fp_env',
    TOKEN_EXPIRY: 'fp_token_expiry',
  },

  // ─── Limits ─────────────────────────────────────────────────────────────────
  TOKEN_REFRESH_THRESHOLD: 5 * 60 * 1000, // Refresh if < 5 min left

  // ─── Timeouts ───────────────────────────────────────────────────────────────
  API_TIMEOUT: 30000, // 30s
  FILL_DELAY: 80,     // ms between field fills

  // ─── Field Matching ─────────────────────────────────────────────────────────
  MATCH_THRESHOLD: 0.6, // Minimum fuzzy match score

  // ─── Version ─────────────────────────────────────────────────────────────────
  VERSION: '1.0.0',
};

/**
 * Get the current API base URL
 * Reads from storage to allow runtime configuration
 */
async function getAPIBase() {
  return new Promise((resolve) => {
    chrome.storage.local.get([CONFIG.STORAGE_KEYS.ENV], (result) => {
      const env = result[CONFIG.STORAGE_KEYS.ENV] || 'production';
      const url = CONFIG.API_URLS[env] || CONFIG.API_URLS.production;
      resolve(url);
    });
  });
}

/**
 * Set the environment (for dev/staging overrides)
 */
async function setEnvironment(env) {
  if (!CONFIG.API_URLS[env]) throw new Error(`Unknown environment: ${env}`);
  return chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.ENV]: env });
}

// Make available globally within extension context
if (typeof module !== 'undefined') {
  module.exports = { CONFIG, getAPIBase, setEnvironment };
}
