/**
 * FormPilot AI — Content Script v2.4
 * Better checkbox grouping, radio detection, Google Forms support
 */
(function() {
  'use strict';
  if (window.__FORMPILOT_V2__) return;
  window.__FORMPILOT_V2__ = true;

  const FS = { DETECTED:'detected', FILLED:'filled', ERROR:'error', SKIPPED:'skipped' };

  // ─── Visibility ────────────────────────────────────────────────────────────
  function isVisible(el) {
    if (!el || !document.contains(el)) return false;
    let n = el;
    while (n && n !== document.documentElement) {
      const s = window.getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      n = n.parentElement;
    }
    return true;
  }

  // ─── Get Label ─────────────────────────────────────────────────────────────
  function getLabel(el) {
    // 1. aria-labelledby
    const lby = el.getAttribute('aria-labelledby');
    if (lby) {
      const t = lby.split(' ')
        .map(id => (document.getElementById(id)||{}).textContent||'')
        .join(' ').trim();
      if (t) return t;
    }
    // 2. aria-label
    const al = el.getAttribute('aria-label');
    if (al && al.trim()) return al.trim();
    // 3. <label for=id>
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) return lbl.textContent.trim();
    }
    // 4. Wrapping label
    const wl = el.closest('label');
    if (wl) {
      const cl = wl.cloneNode(true);
      cl.querySelectorAll('input,select,textarea,button').forEach(e => e.remove());
      const t = cl.textContent.trim();
      if (t) return t;
    }
    // 5. placeholder / title / name
    if (el.placeholder && el.placeholder.trim()) return el.placeholder.trim();
    if (el.title && el.title.trim()) return el.title.trim();
    if (el.name) return el.name.replace(/[-_[\].]/g, ' ').trim();
    // 6. textContent fallback (for role=checkbox divs)
    const tc = el.textContent && el.textContent.trim();
    if (tc && tc.length < 150) return tc;
    return '';
  }

  // ─── Find group title by walking up DOM ───────────────────────────────────
  function findGroupTitle(el) {
    // 1. fieldset legend
    const fs = el.closest('fieldset');
    if (fs) {
      const leg = fs.querySelector('legend');
      if (leg) return leg.textContent.trim();
    }
    // 2. aria-labelledby on parent group container
    let p = el.parentElement;
    for (let i = 0; i < 8; i++) {
      if (!p) break;
      const lby = p.getAttribute('aria-labelledby');
      if (lby) {
        const t = lby.split(' ').map(id => (document.getElementById(id)||{}).textContent||'').join(' ').trim();
        if (t) return t;
      }
      const al = p.getAttribute('aria-label');
      if (al && al.trim()) return al.trim();
      // Previous sibling text that looks like a question
      let sib = p.previousElementSibling;
      if (sib) {
        const t = sib.textContent.trim();
        if (t && t.length > 2 && t.length < 300 && !sib.querySelector('input,select,textarea')) return t;
      }
      p = p.parentElement;
    }
    return '';
  }

  // ─── Smart Checkbox Grouping ───────────────────────────────────────────────
  // Key insight: checkboxes in the SAME group share a common CLOSE ancestor
  // We find the smallest container that holds ONLY related checkboxes
  function groupCheckboxes(allCbs) {
    const groups = [];
    const used = new Set();

    for (const cb of allCbs) {
      if (used.has(cb)) continue;

      // Find siblings: checkboxes within 3 levels of the same parent
      const nearSiblings = findNearSiblings(cb, allCbs);

      if (nearSiblings.length >= 2) {
        nearSiblings.forEach(c => used.add(c));
        groups.push(nearSiblings);
      } else {
        used.add(cb);
        groups.push([cb]); // lone checkbox
      }
    }
    return groups;
  }

  function findNearSiblings(cb, allCbs) {
    // Strategy: find the TIGHTEST container that has 2+ checkboxes
    // AND has a question title (legend/heading/label) associated with it
    let p = cb.parentElement;
    let bestGroup = null;
    
    for (let depth = 0; depth < 8; depth++) {
      if (!p || p === document.body || p === document.documentElement) break;
      
      const contained = allCbs.filter(c => p.contains(c));
      
      if (contained.length >= 2) {
        // Check if this container has a clear question title
        // (legend, heading, or an element that does NOT contain any checkbox)
        const hasTitle = (
          p.querySelector('legend') ||
          p.getAttribute('aria-labelledby') ||
          p.getAttribute('aria-label') ||
          hasDirectHeading(p)
        );
        
        if (hasTitle) {
          // This is a proper question group - use it and stop
          return contained;
        }
        
        // No title yet, but remember this as potential group
        if (!bestGroup || contained.length < bestGroup.length) {
          bestGroup = contained;
        }
      }
      p = p.parentElement;
    }
    
    // If we found a group (even without title), use smallest one
    if (bestGroup && bestGroup.length >= 2 && bestGroup.length <= 8) {
      return bestGroup;
    }
    
    return [cb];
  }
  
  function hasDirectHeading(el) {
    // Check if element has a direct text/heading child that looks like a question
    for (const child of Array.from(el.children)) {
      if (child.querySelector('input,select,textarea')) continue; // skip form children
      const t = child.textContent.trim();
      if (t && t.length > 3 && t.length < 500) return true;
    }
    return false;
  }

  function getDepth(el) {
    let d = 0, n = el;
    while (n) { d++; n = n.parentElement; }
    return d;
  }

  // ─── Simulate input ────────────────────────────────────────────────────────
  function simInput(el, val) {
    const is = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    const ts = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    const tag = el.tagName.toLowerCase();
    if (tag==='input' && is) is.call(el, val);
    else if (tag==='textarea' && ts) ts.call(el, val);
    else el.value = val;
    ['input','change','blur'].forEach(ev =>
      el.dispatchEvent(new Event(ev, {bubbles:true, cancelable:true}))
    );
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ─── Fill Select ──────────────────────────────────────────────────────────
  function fillSelect(el, val) {
    const v = String(val).toLowerCase().trim();
    for (let pass = 0; pass < 4; pass++) {
      for (const opt of el.options) {
        const ov = opt.value.toLowerCase(), ot = opt.text.toLowerCase().trim();
        if ([ov===v, ot===v, ot.startsWith(v)||ov.startsWith(v), ot.includes(v)||v.includes(ot)][pass]) {
          el.value = opt.value;
          el.dispatchEvent(new Event('change', {bubbles:true}));
          return true;
        }
      }
    }
    if (window.FPFuzzy) {
      let best=null, bs=0;
      for (const opt of el.options) {
        const s = FPFuzzy.matchScore(v, opt.text.toLowerCase().trim());
        if (s > bs) { bs=s; best=opt; }
      }
      if (bs > 0.4 && best) {
        el.value = best.value;
        el.dispatchEvent(new Event('change', {bubbles:true}));
        return true;
      }
    }
    return false;
  }

  // ─── Fill Radio ───────────────────────────────────────────────────────────
  function fillRadio(opts, val) {
    const v = String(val).toLowerCase().trim();
    // exact match first
    for (const opt of opts) {
      const ol = (opt.label||opt.value||'').toLowerCase().trim();
      if (ol===v || opt.value?.toLowerCase()===v) {
        if (opt.el) { opt.el.click(); return true; }
      }
    }
    // fuzzy
    if (window.FPFuzzy) {
      let best=null, bs=0;
      for (const opt of opts) {
        const s = FPFuzzy.matchScore(v, (opt.label||'').toLowerCase());
        if (s > bs) { bs=s; best=opt; }
      }
      if (bs > 0.4 && best?.el) { best.el.click(); return true; }
    }
    return false;
  }

  // ─── Click checkbox element (handles real + role=checkbox) ────────────────
  function clickCheckbox(el) {
    el.focus();
    el.click();
    const isRole = el.getAttribute('role') === 'checkbox';
    if (isRole) {
      el.dispatchEvent(new KeyboardEvent('keydown', {key:' ', bubbles:true, cancelable:true}));
      el.dispatchEvent(new KeyboardEvent('keyup', {key:' ', bubbles:true}));
      el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
      el.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
    }
  }

  function isChecked(el) {
    if (el.getAttribute('role') === 'checkbox') {
      return el.getAttribute('aria-checked') === 'true';
    }
    return el.checked;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  EXTRACT ALL FIELDS
  // ═══════════════════════════════════════════════════════════════════════════
  function extractAllFields() {
    const fields = [];
    const usedEls = new Set();

    // ── 1. CHECKBOX GROUPS (group by name attr, like radio buttons) ───────────
    const allCbs = Array.from(document.querySelectorAll(
      'input[type="checkbox"], [role="checkbox"]'
    )).filter(isVisible);

    // Group by name attribute first (most reliable)
    const cbByName = new Map();
    const cbNoName = [];
    for (const cb of allCbs) {
      const name = cb.name || cb.getAttribute('data-name') || '';
      if (name) {
        if (!cbByName.has(name)) cbByName.set(name, []);
        cbByName.get(name).push(cb);
      } else {
        cbNoName.push(cb);
      }
    }

    // Named groups → each name = one checkbox_group field
    for (const [name, cbs] of cbByName) {
      if (cbs.length < 1) continue;
      cbs.forEach(cb => usedEls.add(cb));
      const first = cbs[0];
      const groupTitle = findGroupTitle(first) || getLabel(first) || name;
      const options = cbs.map(cb => {
        const lbl = getLabel(cb) || cb.textContent.trim() || cb.value || '';
        return { el: cb, value: cb.value || lbl, label: lbl };
      });

      if (cbs.length === 1) {
        // Single named checkbox = lone checkbox field
        fields.push({
          element: first, label: groupTitle, type: 'checkbox',
          options: [], placeholder: '', required: first.required || first.getAttribute('aria-required')==='true',
          name: first.name||'', id: first.id||'', currentValue: isChecked(first)?'yes':'no', fillState: FS.DETECTED,
        });
      } else {
        fields.push({
          element: first, allElements: cbs, label: groupTitle, type: 'checkbox_group',
          options, placeholder: '',
          required: cbs.some(cb => cb.required || cb.getAttribute('aria-required')==='true'),
          name: first.name||'', id: first.id||'',
          currentValue: cbs.filter(isChecked).map(cb => getLabel(cb)||cb.value).join(', '),
          fillState: FS.DETECTED,
        });
      }
    }

    // Unnamed checkboxes → group by closest container using tight grouping
    const unnamedGroups = groupUnamedCheckboxes(cbNoName);
    for (const grp of unnamedGroups) {
      grp.forEach(cb => usedEls.add(cb));
      const first = grp[0];
      const groupTitle = findGroupTitle(first) || getLabel(first) || 'Checkbox Group';
      const options = grp.map(cb => {
        const lbl = getLabel(cb) || cb.textContent.trim() || cb.value || '';
        return { el: cb, value: cb.value || lbl, label: lbl };
      });
      if (grp.length === 1) {
        fields.push({
          element: first, label: groupTitle, type: 'checkbox',
          options: [], placeholder: '', required: first.required || first.getAttribute('aria-required')==='true',
          name: first.name||'', id: first.id||'', currentValue: isChecked(first)?'yes':'no', fillState: FS.DETECTED,
        });
      } else {
        fields.push({
          element: first, allElements: grp, label: groupTitle, type: 'checkbox_group',
          options, placeholder: '',
          required: grp.some(cb => cb.required || cb.getAttribute('aria-required')==='true'),
          name: first.name||'', id: first.id||'',
          currentValue: grp.filter(isChecked).map(cb => getLabel(cb)||cb.value).join(', '),
          fillState: FS.DETECTED,
        });
      }
    }

    // ── 2. RADIO GROUPS ─────────────────────────────────────────────────────
    const allRadios = Array.from(document.querySelectorAll(
      'input[type="radio"], [role="radio"]'
    )).filter(isVisible);

    const radioByName = new Map();
    for (const r of allRadios) {
      const name = r.name || r.getAttribute('data-name') || r.closest('[role="radiogroup"]')?.id || ('rg_'+allRadios.indexOf(r));
      if (!radioByName.has(name)) radioByName.set(name, []);
      radioByName.get(name).push(r);
    }

    for (const [name, radios] of radioByName) {
      radios.forEach(r => usedEls.add(r));
      const first = radios[0];
      const groupTitle = findGroupTitle(first) || getLabel(first) || 'Choice';
      const options = radios.map(r => ({
        el: r, value: r.value || '',
        label: getLabel(r) || r.textContent.trim() || r.value || '',
      }));

      fields.push({
        element: first, allElements: radios, label: groupTitle, type: 'radio_group',
        options, placeholder: '',
        required: radios.some(r => r.required || r.getAttribute('aria-required')==='true'),
        name, id: first.id||'',
        currentValue: (radios.find(r => r.checked || r.getAttribute('aria-checked')==='true')||{}).value||'',
        fillState: FS.DETECTED,
      });
    }

    // ── 3. TEXT / SELECT / TEXTAREA ──────────────────────────────────────────
    const SELECTORS = [
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="radio"]):not([type="checkbox"])',
      'textarea', 'select',
      '[contenteditable="true"]:not([contenteditable="false"])',
    ].join(',');

    const others = Array.from(document.querySelectorAll(SELECTORS)).filter(isVisible);
    for (const el of others) {
      if (usedEls.has(el)) continue;
      usedEls.add(el);
      const tag = el.tagName.toLowerCase();
      const type = (el.type||'').toLowerCase();
      if (['submit','button','reset','hidden','file','image'].includes(type)) continue;
      let fieldType = 'text';
      if (tag==='select') fieldType='select';
      else if (tag==='textarea') fieldType='textarea';
      else if (el.contentEditable==='true') fieldType='contenteditable';
      else if (['email','tel','number','date','time','url','search','password','month','week'].includes(type)) fieldType=type;
      const label = getLabel(el) || `Field ${fields.length+1}`;
      let options = [];
      if (tag==='select') options = Array.from(el.options).filter(o=>o.text.trim()).map(o=>({value:o.value,label:o.text.trim()}));
      fields.push({
        element: el, label, type: fieldType, options,
        placeholder: el.placeholder||'', required: el.required||el.getAttribute('aria-required')==='true',
        name: el.name||'', id: el.id||'', currentValue: el.value||'', fillState: FS.DETECTED,
      });
    }

    // Sort by DOM position
    fields.sort((a, b) => {
      const pos = a.element.compareDocumentPosition(b.element);
      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });
    return fields;
  }

  // Group unnamed checkboxes by closest shared container
  function groupUnamedCheckboxes(cbs) {
    if (!cbs.length) return [];
    const groups = [];
    const used = new Set();
    for (const cb of cbs) {
      if (used.has(cb)) continue;
      // Find smallest container that has 2+ of these checkboxes AND has a title
      let p = cb.parentElement;
      let found = null;
      for (let d = 0; d < 6; d++) {
        if (!p || p === document.body) break;
        const inP = cbs.filter(c => !used.has(c) && p.contains(c));
        if (inP.length >= 2 && (p.querySelector('legend') || p.getAttribute('aria-labelledby') || p.getAttribute('aria-label'))) {
          found = inP; break;
        }
        p = p.parentElement;
      }
      if (found) {
        found.forEach(c => used.add(c));
        groups.push(found);
      } else {
        used.add(cb);
        groups.push([cb]);
      }
    }
    return groups;
  }


  // ─── Highlight ─────────────────────────────────────────────────────────────
  const COLORS = { detected:'#6366f1', filled:'#16a34a', error:'#dc2626', skipped:'#d97706' };
  function highlight(el, state) {
    if (!el) return;
    el.style.outline = `2px solid ${COLORS[state]||'#6366f1'}`;
    el.style.outlineOffset = '2px';
    el.style.transition = 'outline 0.2s';
  }
  function highlightGroup(els, state) {
    (els||[]).forEach(el => highlight(el, state));
  }

  // ─── Fill a Field ──────────────────────────────────────────────────────────
  async function fillField(field, value, delay) {
    if (value === '' || value == null) return FS.SKIPPED;
    await sleep(delay == null ? 80 : delay);
    const { element: el, type } = field;
    try {
      // SELECT
      if (type === 'select') return fillSelect(el, value) ? FS.FILLED : FS.SKIPPED;

      // RADIO GROUP
      if (type === 'radio_group') return fillRadio(field.options, value) ? FS.FILLED : FS.SKIPPED;

      // CHECKBOX GROUP
       if (type === 'checkbox_group') {
         const valStr = String(value).toLowerCase().trim();
         // Empty or "none" = don't check anything
         if (!valStr || valStr === 'none') return FS.SKIPPED;
         const vals = valStr.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
         let any = false;
 
         for (const opt of field.options) {
           const ol = (opt.label || opt.value || '').toLowerCase().trim();
           const should = vals.some(v => {
             if (!v || v === 'none') return false;
             if (v === 'all') return true;
             // STRICT: exact match only (prevents "Day 1" matching "Day 2","Day 3")
             if (ol === v) return true;
             // Only fuzzy if very short labels won't cause false positives
             if (window.FPFuzzy && v.length >= 4 && ol.length >= 4) {
               return FPFuzzy.matchScore(ol, v) > 0.85;
             }
             return false;
           });
           if (!should || !opt.el) continue;
           if (!isChecked(opt.el)) {
             clickCheckbox(opt.el);
             any = true;
             await sleep(60);
           }
         }
         return any ? FS.FILLED : FS.SKIPPED;
       }

      // SINGLE CHECKBOX
      if (type === 'checkbox') {
        const should = /^(yes|true|1|on|✓|check)/i.test(String(value));
        if (isChecked(el) !== should) clickCheckbox(el);
        return FS.FILLED;
      }

      // CONTENTEDITABLE
      if (type === 'contenteditable' || el.contentEditable === 'true') {
        el.focus();
        document.execCommand('selectAll');
        document.execCommand('insertText', false, String(value));
        el.dispatchEvent(new Event('input', {bubbles:true}));
        return FS.FILLED;
      }

      // TEXT / EMAIL / PHONE / TEXTAREA etc.
      el.focus();
      simInput(el, String(value));
      el.blur();
      return FS.FILLED;

    } catch(e) { return FS.ERROR; }
  }

  // ─── State ─────────────────────────────────────────────────────────────────
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
          payload: { url: location.href, title: document.title, fieldCount: fields.length }
        }).catch(() => {});
      }
    }
  }

  setTimeout(checkForForms, 800);
  setTimeout(checkForForms, 2500);

  const obs = new MutationObserver(muts => {
    const changed = muts.some(m =>
      Array.from(m.addedNodes).some(n =>
        n.nodeType===1 && (n.matches?.('form,input,select,textarea') || n.querySelector?.('input,select,textarea'))
      )
    );
    if (changed) { formDetected = false; setTimeout(checkForForms, 600); }
  });
  try { obs.observe(document.body, {childList:true, subtree:true}); } catch(e) {}

  // ─── Messages ──────────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handleMsg(msg).then(sendResponse).catch(err => sendResponse({success:false, error:err.message}));
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
            options: f.options.map(o => ({ value: o.value, label: o.label || o.value })),
            placeholder: f.placeholder,
            required: f.required,
            currentValue: f.currentValue,
            name: f.name,
          })),
          url: location.href,
          title: document.title,
        };
      }

      case 'FILL_FORM': {
        const { answers, delay=80, highlightFields=true } = payload;
        if (!currentFields.length) currentFields = extractAllFields();

        const results = {};
        let filled = 0, skipped = 0, errors = 0;

        // Mark ALL fields as skipped first (unattempted = skipped)
        currentFields.forEach((f, i) => { results[i] = FS.SKIPPED; });

        for (const [idx, value] of Object.entries(answers)) {
          const i = parseInt(idx), field = currentFields[i];
          if (!field) continue;
          const state = await fillField(field, value, delay);
          results[i] = state;
          field.fillState = state;
          if (highlightFields) {
            if (field.allElements) highlightGroup(field.allElements, state);
            else highlight(field.element, state);
          }
          if (state === FS.FILLED) filled++;
          else if (state === FS.ERROR) errors++;
          else skipped++;
        }

        chrome.runtime.sendMessage({type:'FORM_FILLED', payload:{filled}}).catch(()=>{});
        return {success:true, filled, skipped, errors, total:Object.keys(answers).length, results};
      }

      case 'HIGHLIGHT_FIELDS': {
        currentFields.forEach((f, i) => {
          if (f.allElements) highlightGroup(f.allElements, FS.DETECTED);
          else highlight(f.element, FS.DETECTED);
          f.element.setAttribute('data-fp-index', String(i));
        });
        return {success:true};
      }

      case 'CLEAR_HIGHLIGHTS': {
        currentFields.forEach(f => {
          (f.allElements || [f.element]).forEach(el => {
            el.style.outline = '';
            el.style.outlineOffset = '';
          });
        });
        return {success:true};
      }

      case 'SCROLL_TO_FIELD': {
        const f = currentFields[payload.fieldIndex];
        if (!f) return {success:false, error:'Not found'};
        f.element.scrollIntoView({behavior:'smooth', block:'center'});
        if (f.allElements) highlightGroup(f.allElements, FS.ERROR);
        else highlight(f.element, FS.ERROR);
        setTimeout(() => f.element.focus(), 400);
        return {success:true};
      }

      case 'FILL_SINGLE': {
        const f = currentFields[payload.fieldIndex];
        if (!f) return {success:false, error:'Not found'};
        const state = await fillField(f, payload.value, payload.delay || 80);
        f.fillState = state;
        if (f.allElements) highlightGroup(f.allElements, state);
        else highlight(f.element, state);
        return {success:true, state};
      }

      case 'GET_FORM_INFO':
        return {
          success: true,
          url: location.href,
          title: document.title,
          fieldCount: currentFields.length,
          hasForm: currentFields.length >= 1,
        };

      default:
        return {success:false, error:`Unknown: ${type}`};
    }
  }
})();
