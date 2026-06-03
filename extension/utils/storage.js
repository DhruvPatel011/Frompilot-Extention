/**
 * FormPilot AI — Storage Module v2
 * Handles tokens, profiles (key-value), settings, categories, aliases, mappings
 */

(function() {
  'use strict';

  var KEYS = {
    ACCESS_TOKEN:  'fp_access_token',
    REFRESH_TOKEN: 'fp_refresh_token',
    USER:          'fp_user',
    TOKEN_EXPIRY:  'fp_token_expiry',
    PROFILES:      'fp_profiles_v2',         // key-value profiles
    ACTIVE_PROFILE:'fp_active_profile_v2',
    CATEGORIES:    'fp_categories',
    ALIASES:       'fp_aliases',             // { fieldLabel: [profileKey, ...] }
    MAPPINGS:      'fp_mappings',            // { websiteField: profileKey }
    SETTINGS:      'fp_settings',
    ENV:           'fp_env',
    HISTORY:       'fp_history',
  };

  var FPStorage = {

    // ─── Tokens ──────────────────────────────────────────────────────────────
    setTokens: function(accessToken, refreshToken) {
      var expiry = null;
      try { expiry = JSON.parse(atob(accessToken.split('.')[1])).exp * 1000; } catch(e) {}
      var d = {};
      d[KEYS.ACCESS_TOKEN]  = accessToken;
      d[KEYS.TOKEN_EXPIRY]  = expiry;
      if (refreshToken) d[KEYS.REFRESH_TOKEN] = refreshToken;
      return chrome.storage.local.set(d);
    },

    getAccessToken: async function() {
      var r = await chrome.storage.local.get([KEYS.ACCESS_TOKEN, KEYS.TOKEN_EXPIRY]);
      var t = r[KEYS.ACCESS_TOKEN], exp = r[KEYS.TOKEN_EXPIRY];
      if (!t) return null;
      if (exp && Date.now() >= exp) { await FPStorage.clearTokens(); return null; }
      return t;
    },

    clearTokens: function() {
      return chrome.storage.local.remove([KEYS.ACCESS_TOKEN, KEYS.REFRESH_TOKEN, KEYS.TOKEN_EXPIRY]);
    },

    setUser: function(user) {
      var d = {}; d[KEYS.USER] = user;
      return chrome.storage.local.set(d);
    },

    getUser: async function() {
      var r = await chrome.storage.local.get([KEYS.USER]);
      return r[KEYS.USER] || null;
    },

    logout: function() {
      return chrome.storage.local.remove([
        KEYS.ACCESS_TOKEN, KEYS.REFRESH_TOKEN,
        KEYS.USER, KEYS.ACTIVE_PROFILE, KEYS.TOKEN_EXPIRY,
      ]);
    },

    // ─── Key-Value Profiles ───────────────────────────────────────────────────
    // Profile: { id, name, isDefault, fields: [{ id, key, value, aliases }], categories: {} }

    getProfiles: async function() {
      var r = await chrome.storage.local.get([KEYS.PROFILES]);
      return r[KEYS.PROFILES] || [];
    },

    saveProfiles: function(profiles) {
      var d = {}; d[KEYS.PROFILES] = profiles;
      return chrome.storage.local.set(d);
    },

    getActiveProfile: async function() {
      var [profiles, r] = await Promise.all([
        FPStorage.getProfiles(),
        chrome.storage.local.get([KEYS.ACTIVE_PROFILE]),
      ]);
      var activeId = r[KEYS.ACTIVE_PROFILE];
      return profiles.find(function(p) { return p.id === activeId; })
          || profiles.find(function(p) { return p.isDefault; })
          || profiles[0]
          || null;
    },

    setActiveProfile: function(id) {
      var d = {}; d[KEYS.ACTIVE_PROFILE] = id;
      return chrome.storage.local.set(d);
    },

    createProfile: async function(name) {
      var profiles = await FPStorage.getProfiles();
      var profile = {
        id: 'p_' + Date.now(),
        name: name || 'My Profile',
        isDefault: profiles.length === 0,
        fields: [],
        createdAt: Date.now(),
      };
      profiles.push(profile);
      await FPStorage.saveProfiles(profiles);
      return profile;
    },

    updateProfile: async function(id, updates) {
      var profiles = await FPStorage.getProfiles();
      var idx = profiles.findIndex(function(p) { return p.id === id; });
      if (idx === -1) return null;
      Object.assign(profiles[idx], updates);
      await FPStorage.saveProfiles(profiles);
      return profiles[idx];
    },

    deleteProfile: async function(id) {
      var profiles = await FPStorage.getProfiles();
      var filtered = profiles.filter(function(p) { return p.id !== id; });
      if (filtered.length && !filtered.some(function(p) { return p.isDefault; })) {
        filtered[0].isDefault = true;
      }
      return FPStorage.saveProfiles(filtered);
    },

    setDefaultProfile: async function(id) {
      var profiles = await FPStorage.getProfiles();
      profiles.forEach(function(p) { p.isDefault = (p.id === id); });
      return FPStorage.saveProfiles(profiles);
    },

    // ─── Field CRUD ───────────────────────────────────────────────────────────
    addField: async function(profileId, key, value, aliases) {
      var profiles = await FPStorage.getProfiles();
      var p = profiles.find(function(p) { return p.id === profileId; });
      if (!p) return null;
      var field = {
        id: 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        key: key,
        value: value || '',
        aliases: aliases || [],
        category: 'General',
        updatedAt: Date.now(),
      };
      p.fields.push(field);
      await FPStorage.saveProfiles(profiles);
      return field;
    },

    updateField: async function(profileId, fieldId, updates) {
      var profiles = await FPStorage.getProfiles();
      var p = profiles.find(function(p) { return p.id === profileId; });
      if (!p) return null;
      var f = p.fields.find(function(f) { return f.id === fieldId; });
      if (!f) return null;
      Object.assign(f, updates, { updatedAt: Date.now() });
      await FPStorage.saveProfiles(profiles);
      return f;
    },

    deleteField: async function(profileId, fieldId) {
      var profiles = await FPStorage.getProfiles();
      var p = profiles.find(function(p) { return p.id === profileId; });
      if (!p) return;
      p.fields = p.fields.filter(function(f) { return f.id !== fieldId; });
      return FPStorage.saveProfiles(profiles);
    },

    bulkDeleteFields: async function(profileId, fieldIds) {
      var profiles = await FPStorage.getProfiles();
      var p = profiles.find(function(p) { return p.id === profileId; });
      if (!p) return;
      var ids = new Set(fieldIds);
      p.fields = p.fields.filter(function(f) { return !ids.has(f.id); });
      return FPStorage.saveProfiles(profiles);
    },

    // ─── Categories ───────────────────────────────────────────────────────────
    getCategories: async function() {
      var r = await chrome.storage.local.get([KEYS.CATEGORIES]);
      return r[KEYS.CATEGORIES] || ['General', 'Personal', 'Education', 'Work', 'Contact'];
    },

    saveCategories: function(cats) {
      var d = {}; d[KEYS.CATEGORIES] = cats;
      return chrome.storage.local.set(d);
    },

    // ─── Mappings ─────────────────────────────────────────────────────────────
    getMappings: async function() {
      var r = await chrome.storage.local.get([KEYS.MAPPINGS]);
      return r[KEYS.MAPPINGS] || {};
    },

    saveMappings: function(m) {
      var d = {}; d[KEYS.MAPPINGS] = m;
      return chrome.storage.local.set(d);
    },

    addMapping: async function(websiteField, profileKey) {
      var m = await FPStorage.getMappings();
      m[websiteField.toLowerCase()] = profileKey;
      return FPStorage.saveMappings(m);
    },

    // ─── Settings ─────────────────────────────────────────────────────────────
    getSettings: async function() {
      var r = await chrome.storage.local.get([KEYS.SETTINGS]);
      return Object.assign({
        theme: 'light',
        fillDelay: 80,
        autoFill: false,
        saveManualEntries: true,
        fuzzyThreshold: 0.45,
        highlightFields: true,
      }, r[KEYS.SETTINGS] || {});
    },

    saveSettings: async function(updates) {
      var current = await FPStorage.getSettings();
      var merged = Object.assign({}, current, updates);
      var d = {}; d[KEYS.SETTINGS] = merged;
      return chrome.storage.local.set(d);
    },

    // ─── Local History ────────────────────────────────────────────────────────
    getHistory: async function() {
      var r = await chrome.storage.local.get([KEYS.HISTORY]);
      return r[KEYS.HISTORY] || [];
    },

    addHistoryEntry: async function(entry) {
      var history = await FPStorage.getHistory();
      history.unshift(Object.assign({ id: 'h_' + Date.now(), createdAt: Date.now() }, entry));
      if (history.length > 100) history = history.slice(0, 100);
      var d = {}; d[KEYS.HISTORY] = history;
      return chrome.storage.local.set(d);
    },

    clearHistory: function() {
      var d = {}; d[KEYS.HISTORY] = [];
      return chrome.storage.local.set(d);
    },

    // ─── Export / Import ──────────────────────────────────────────────────────
    exportProfile: async function(profileId) {
      var profiles = await FPStorage.getProfiles();
      var p = profiles.find(function(p) { return p.id === profileId; });
      return p ? JSON.stringify(p, null, 2) : null;
    },

    importProfile: async function(jsonStr) {
      var data = JSON.parse(jsonStr);
      var profiles = await FPStorage.getProfiles();
      var imported = Object.assign({}, data, {
        id: 'p_' + Date.now(),
        isDefault: false,
        name: (data.name || 'Imported') + ' (copy)',
      });
      profiles.push(imported);
      await FPStorage.saveProfiles(profiles);
      return imported;
    },
  };

  if (typeof module !== 'undefined') module.exports = { FPStorage, KEYS };
  else window.FPStorage = FPStorage;
})();
