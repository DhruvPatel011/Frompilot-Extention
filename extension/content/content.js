/**
 * FormPilot AI — Content Script v2
 * Universal form detection: theme-independent, framework-aware, Shadow DOM, multi-step, AJAX.
 */

(function() {
  'use strict';
  if (window.__FORMPILOT_V2__) return;
  window.__FORMPILOT_V2__ = true;

  // ─── Constants ────────────────────────────────────────────────────────────
  const FILL_STATES = { DETECTED: 'detected', FILLED: 'filled', ERROR: 'error', SKIPPED: 'skipped' };

  const INTERACTIVE_SELECTORS = [
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])',
    'textarea',
    'select',
    '[role="textbox"]',
    '[role="combobox"]',
    '[role="listbox"]',
    '[role="radiogroup"]',
    '[contenteditable="true"]:not([contenteditable="false"])',
    '[data-testid*="input"]',
    '[data-cy*="input"]',
    '[data-qa*="input"]',
  ].join(',');

  // ─── Visibility Check ─────────────────────────────────────────────────────
  // Theme-independent: only check actual visibility, not color/class
  function isVisible(el) {
    if (!el) return false;
    // Check if in DOM
    if (!document.contains(el)) return false;
    const rect = el.getBoundingClientRect();
    // Hidden via display:none or visibility:hidden
    let node = el;
    while (node && node !== document.documentElement) {
      const s = window.getComputedStyle(node);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      if (s.opacity === '0') return false;
      node = node.parentElement;
    }
    // Allow zero-size inputs that React/Vue might use (they often have real size via parent)
    return true;
  }

  // ─── Shadow DOM traversal ─────────────────────────────────────────────────
  function queryShadow(root, selector) {
    const results = [];
    function walk(node) {
      try {
        const found = Array.from(node.querySelectorAll(selector));
        results.push(...found);
        // Walk shadow roots
        const all = Array.from(node.querySelectorAll('*'));
        for (const el of all) {
          if (el.shadowRoot) walk(el.shadowRoot);
        }
      } catch(e) {}
    }
    walk(root);
    return results;
  }

  // ─── Field Type ───────────────────────────────────────────────────────────
  function getFieldType(el) {
    const tag = el.tagName.toLowerCase();
    const type = (el.type || '').toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (tag === 'select' || role === 'listbox') return 'select';
    if (tag === 'textarea' || role === 'textbox' && el.tagName !== 'INPUT') return 'textarea';
    if (type === 'checkbox' || role === 'checkbox') return 'checkbox';
    if (type === 'radio' || role === 'radio') return 'radio';
    if (type === 'file') return 'file';
    if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
    if (type === 'hidden') return 'hidden';
    if (role === 'radiogroup') return 'radio_group';
    if (role === 'group' && el.querySelector('[role="checkbox"]')) return 'checkbox_group';
    const knownTypes = ['email','phone','tel','number','date','time','url','search','password','text','month','week','color','range'];
    if (knownTypes.includes(type)) return type === 'tel' ? 'phone' : type;
    if (el.contentEditable === 'true') return 'contenteditable';
    return 'text';
  }

  // ─── Label Extraction (7-step chain) ─────────────────────────────────────
  function extractLabel(el) {
    // 1. aria-labelledby
    const lby = el.getAttribute('aria-labelledby');
    if (lby) {
      const text = lby.split(' ').map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ');
      if (text) return text;
    }
    // 2. aria-label
    const al = el.getAttribute('aria-label');
    if (al && al.trim()) return al.trim();
    // 3. <label for>
    const id = el.id;
    if (id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (lbl) return lbl.textContent.trim();
    }
    // 4. Wrapping label
    const wl = el.closest('label');
    if (wl) {
      const cloned = wl.cloneNode(true);
      cloned.querySelectorAll('input,select,textarea').forEach(e => e.remove());
      const t = cloned.textContent.trim();
      if (t) return t;
    }
    // 5. Legend / fieldset
    const fs = el.closest('fieldset');
    if (fs) {
      const leg = fs.querySelector('legend');
      if (leg) return leg.textContent.trim();
    }
    // 6. Nearest heading or label-like element preceding
    const parent = el.parentElement;
    if (parent) {
      // Walk siblings backward
      let sib = el.previousElementSibling;
      while (sib) {
        const tag = sib.tagName.toLowerCase();
        if (['label','span','p','div','h1','h2','h3','h4','h5','h6'].includes(tag)) {
          const t = sib.textContent.trim();
          if (t && t.length < 250) return t;
        }
        sib = sib.previousElementSibling;
      }
      // Check parent text nodes
      const parentText = Array.from(parent.childNodes)
        .filter(n => n.nodeType === 3)
        .map(n => n.textContent.trim())
        .filter(Boolean).join(' ');
      if (parentText && parentText.length < 250) return parentText;
    }
    // 7. Placeholder / name / data attributes
    const ph = el.getAttribute('placeholder');
    if (ph && ph.trim()) return ph.trim();
    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();
    const name = el.getAttribute('name');
    if (name) return name.replace(/[-_[\].]/g, ' ').trim();
    return '';
  }

  // ─── Options Extraction ───────────────────────────────────────────────────
  function extractOptions(el) {
    const type = getFieldType(el);
    if (type === 'select') {
      return Array.from(el.options)
        .filter(o => o.value !== '' && o.text.trim())
        .map(o => ({ value: o.value, label: o.text.trim() }));
    }
    if (type === 'radio' || type === 'radio_group') {
      const name = el.name;
      if (name) {
        return Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`))
          .map(r => ({ value: r.value, label: extractLabel(r) || r.value, element: r }));
      }
    }
    const grp = el.closest('[role="group"], fieldset, [role="radiogroup"]');
    if (grp) {
      const items = grp.querySelectorAll('input[type="checkbox"],[role="checkbox"],input[type="radio"],[role="radio"]');
      if (items.length > 1) {
        return Array.from(items).map(cb => ({
          value: cb.value || cb.getAttribute('data-value') || '',
          label: extractLabel(cb) || cb.value,
          element: cb,
        }));
      }
    }
    return [];
  }

  // ─── Universal Form Extraction ────────────────────────────────────────────
  function extractAllFields(root) {
    root = root || document;
    const fields = [];
    const seen = new Set();
    const radioGroups = new Set();

    // Include Shadow DOM
    const elements = queryShadow(root, INTERACTIVE_SELECTORS);

    for (const el of elements) {
      if (seen.has(el)) continue;
      if (!isVisible(el)) continue;
      seen.add(el);

      const type = getFieldType(el);
      if (type === 'button' || type === 'hidden' || type === 'file') continue;

      // Deduplicate radio groups
      if (type === 'radio' && el.name) {
        const gk = `radio_${el.name}`;
        if (radioGroups.has(gk)) continue;
        radioGroups.add(gk);
      }

      const label = extractLabel(el);
      const options = extractOptions(el);

      fields.push({
        element: el,
        label: label || `Field ${fields.length + 1}`,
        type,
        options,
        placeholder: el.placeholder || el.getAttribute('data-placeholder') || '',
        required: el.required || el.getAttribute('aria-required') === 'true',
        name: el.name || el.getAttribute('data-field') || '',
        id: el.id || '',
        currentValue: el.value || el.getAttribute('data-value') || '',
        fillState: FILL_STATES.DETECTED,
      });
    }

    return fields;
  }

  // ─── React/Vue/Angular native setter ─────────────────────────────────────
  function simulateInput(el, value) {
    const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    const textareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' && inputSetter) inputSetter.call(el, value);
    else if (tag === 'textarea' && textareaSetter) textareaSetter.call(el, value);
    else el.value = value;
    ['input','change','blur'].forEach(ev =>
      el.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }))
    );
    // Angular-specific
    el.dispatchEvent(new CustomEvent('ngModelChange', { bubbles: true, detail: value }));
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ─── Fill Helpers ─────────────────────────────────────────────────────────
  function fillSelect(el, value) {
    const v = String(value).toLowerCase().trim();
    let matched = false;
    for (let pass = 0; pass < 4; pass++) {
      for (const opt of el.options) {
        const ov = opt.value.toLowerCase(), ot = opt.text.toLowerCase().trim();
        const match = [
          ov === v, ot === v,
          ot.startsWith(v), ov.startsWith(v),
        ][pass];
        if (match) { el.value = opt.value; matched = true; break; }
      }
      if (matched) break;
    }
    // fuzzy fallback
    if (!matched && window.FPFuzzy) {
      let best = null, bestScore = 0;
      for (const opt of el.options) {
        const s = FPFuzzy.matchScore(v, opt.text.toLowerCase().trim());
        if (s > bestScore) { bestScore = s; best = opt; }
      }
      if (bestScore > 0.5 && best) { el.value = best.value; matched = true; }
    }
    if (matched) el.dispatchEvent(new Event('change', { bubbles: true }));
    return matched;
  }

  function fillRadio(field, value) {
    const v = String(value).toLowerCase().trim();
    const options = field.options.length ? field.options : extractOptions(field.element);
    for (const opt of options) {
      const ol = (opt.label || opt.value || '').toLowerCase();
      if (ol === v || opt.value?.toLowerCase() === v) {
        if (opt.element) { opt.element.click(); return true; }
      }
    }
    // Fuzzy
    if (window.FPFuzzy) {
      let best = null, bestScore = 0;
      for (const opt of options) {
        const s = FPFuzzy.matchScore(v, (opt.label || '').toLowerCase());
        if (s > bestScore) { bestScore = s; best = opt; }
      }
      if (bestScore > 0.5 && best?.element) { best.element.click(); return true; }
    }
    return false;
  }

  // ─── Fill a Single Field ──────────────────────────────────────────────────
  async function fillField(field, value, delay) {
    delay = delay == null ? 80 : delay;
    if (value === '' || value == null) return FILL_STATES.SKIPPED;
    await sleep(delay);
    const { element: el, type } = field;

    try {
      if (type === 'select') return fillSelect(el, value) ? FILL_STATES.FILLED : FILL_STATES.SKIPPED;
      if (type === 'checkbox') {
        const should = /^(yes|true|1|on|✓|checked)$/i.test(String(value));
        if (el.checked !== should) el.click();
        return FILL_STATES.FILLED;
      }
      if (type === 'radio' || type === 'radio_group') {
        return fillRadio(field, value) ? FILL_STATES.FILLED : FILL_STATES.SKIPPED;
      }
      if (type === 'contenteditable' || el.contentEditable === 'true') {
        el.focus();
        document.execCommand('selectAll');
        document.execCommand('insertText', false, String(value));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return FILL_STATES.FILLED;
      }
      // Text/email/phone/number/textarea
      el.focus();
      simulateInput(el, String(value));
      el.blur();
      return FILL_STATES.FILLED;
    } catch (err) {
      console.warn('[FormPilot] Fill error on:', field.label, err);
      return FILL_STATES.ERROR;
    }
  }

  // ─── Highlight Fields ─────────────────────────────────────────────────────
  const HIGHLIGHT_COLORS = {
    [FILL_STATES.DETECTED]: '#6366f1',
    [FILL_STATES.FILLED]:   '#22c55e',
    [FILL_STATES.ERROR]:    '#ef4444',
    [FILL_STATES.SKIPPED]:  '#f59e0b',
  };

  function highlightField(el, state) {
    const color = HIGHLIGHT_COLORS[state] || '#6366f1';
    el.style.outline = `2px solid ${color}`;
    el.style.outlineOffset = '2px';
    el.style.transition = 'outline 0.2s ease';
    el.setAttribute('data-fp-state', state);
  }

  function clearHighlights(fields) {
    (fields || currentFields).forEach(f => {
      f.element.style.outline = '';
      f.element.style.outlineOffset = '';
      f.element.removeAttribute('data-fp-state');
    });
  }

  // ─── State ────────────────────────────────────────────────────────────────
  let currentFields = [];
  let formDetected = false;

  function checkForForms() {
    const fields = extractAllFields();
    if (fields.length >= 1) {
      currentFields = fields;
      if (!formDetected) {
        formDetected = true;
        chrome.runtime.sendMessage({
          type: 'FORM_DETECTED',
          payload: {
            url: window.location.href,
            title: document.title,
            fieldCount: fields.length,
          },
        }).catch(() => {});
      }
    }
  }

  setTimeout(checkForForms, 800);
  setTimeout(checkForForms, 2500); // retry for SPA lazy load

  // MutationObserver for SPA/AJAX forms
  const observer = new MutationObserver(mutations => {
    const changed = mutations.some(m =>
      Array.from(m.addedNodes).some(n =>
        n.nodeType === 1 && (
          n.matches?.('form,input,select,textarea,[role="form"]') ||
          n.querySelector?.('input,select,textarea')
        )
      )
    );
    if (changed) {
      formDetected = false;
      setTimeout(checkForForms, 600);
    }
  });
  try { observer.observe(document.body, { childList: true, subtree: true }); } catch(e) {}

  // ─── Message Handler ──────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handleMsg(msg).then(sendResponse).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  });

  async function handleMsg(msg) {
    const { type, payload } = msg;

    switch (type) {
      case 'GET_FIELDS': {
        currentFields = extractAllFields();
        return {
          success: true,
          fields: currentFields.map((f, i) => ({
            index: i,
            label: f.label,
            type: f.type,
            options: f.options.map(o => ({ value: o.value, label: o.label })),
            placeholder: f.placeholder,
            required: f.required,
            currentValue: f.currentValue,
            name: f.name,
          })),
          url: window.location.href,
          title: document.title,
        };
      }

      case 'FILL_FORM': {
        const { answers, delay = 80, highlightFields = true } = payload;
        if (!currentFields.length) currentFields = extractAllFields();

        const results = {};
        let filled = 0, skipped = 0, errors = 0;

        for (const [indexStr, value] of Object.entries(answers)) {
          const index = parseInt(indexStr);
          const field = currentFields[index];
          if (!field) continue;
          const state = await fillField(field, value, delay);
          results[index] = state;
          field.fillState = state;
          if (highlightFields) highlightField(field.element, state);
          if (state === FILL_STATES.FILLED) filled++;
          else if (state === FILL_STATES.ERROR) errors++;
          else skipped++;
        }

        chrome.runtime.sendMessage({ type: 'FORM_FILLED', payload: { filled } }).catch(() => {});
        return { success: true, filled, skipped, errors, total: Object.keys(answers).length, results };
      }

      case 'HIGHLIGHT_FIELDS': {
        currentFields.forEach((f, i) => {
          highlightField(f.element, FILL_STATES.DETECTED);
          f.element.setAttribute('data-fp-index', String(i));
        });
        return { success: true };
      }

      case 'CLEAR_HIGHLIGHTS': {
        clearHighlights(currentFields);
        return { success: true };
      }

      case 'SCROLL_TO_FIELD': {
        const { fieldIndex } = payload;
        const field = currentFields[fieldIndex];
        if (!field) return { success: false, error: 'Field not found' };
        field.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightField(field.element, FILL_STATES.ERROR);
        setTimeout(() => field.element.focus(), 400);
        return { success: true };
      }

      case 'FILL_SINGLE': {
        const { fieldIndex, value, delay = 80 } = payload;
        const field = currentFields[fieldIndex];
        if (!field) return { success: false, error: 'Field not found' };
        const state = await fillField(field, value, delay);
        field.fillState = state;
        highlightField(field.element, state);
        return { success: true, state };
      }

      case 'GET_FORM_INFO': {
        return {
          success: true,
          url: window.location.href,
          title: document.title,
          fieldCount: currentFields.length,
          hasForm: currentFields.length >= 1,
        };
      }

      default:
        return { success: false, error: `Unknown type: ${type}` };
    }
  }
})();
