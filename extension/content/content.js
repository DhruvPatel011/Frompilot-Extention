/**
 * FormPilot AI — Content Script v2.3
 * Full checkbox group, radio group, select detection with options
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

  // ─── Label ─────────────────────────────────────────────────────────────────
  function getLabel(el) {
    const lby = el.getAttribute('aria-labelledby');
    if (lby) {
      const t = lby.split(' ').map(id => (document.getElementById(id)||{}).textContent||'').join(' ').trim();
      if (t) return t;
    }
    const al = el.getAttribute('aria-label');
    if (al && al.trim()) return al.trim();
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) return lbl.textContent.trim();
    }
    const wl = el.closest('label');
    if (wl) {
      const cl = wl.cloneNode(true);
      cl.querySelectorAll('input,select,textarea,button').forEach(e => e.remove());
      const t = cl.textContent.trim();
      if (t) return t;
    }
    if (el.placeholder && el.placeholder.trim()) return el.placeholder.trim();
    if (el.title && el.title.trim()) return el.title.trim();
    if (el.name) return el.name.replace(/[-_[\].]/g,' ').trim();
    return '';
  }

  // ─── Walk up DOM to find a question title ─────────────────────────────────
  function findGroupTitle(el, depth) {
    depth = depth || 8;
    let p = el.parentElement;
    for (let i = 0; i < depth; i++) {
      if (!p) break;
      // Fieldset legend
      if (p.tagName === 'FIELDSET') {
        const leg = p.querySelector('legend');
        if (leg) return leg.textContent.trim();
      }
      // aria-labelledby on parent group
      const lby = p.getAttribute('aria-labelledby');
      if (lby) {
        const t = lby.split(' ').map(id => (document.getElementById(id)||{}).textContent||'').join(' ').trim();
        if (t) return t;
      }
      const al = p.getAttribute('aria-label');
      if (al) return al.trim();
      // Look for a heading/label sibling BEFORE this element
      let sib = p.previousElementSibling;
      while (sib) {
        const tag = sib.tagName.toLowerCase();
        if (['h1','h2','h3','h4','h5','h6','label','legend','p','div','span'].includes(tag)) {
          const t = sib.textContent.trim();
          if (t && t.length > 1 && t.length < 300 && !sib.querySelector('input,select,textarea')) return t;
        }
        sib = sib.previousElementSibling;
      }
      // Check first text-only child of parent
      for (const child of Array.from(p.children)) {
        if (!child.querySelector('input,select,textarea,button')) {
          const t = child.textContent.trim();
          if (t && t.length > 1 && t.length < 300) return t;
        }
      }
      p = p.parentElement;
    }
    return '';
  }

  // ─── Simulate input for React/Vue/Angular ─────────────────────────────────
  function simInput(el, val) {
    const is = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')?.set;
    const ts = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value')?.set;
    const tag = el.tagName.toLowerCase();
    if (tag==='input' && is) is.call(el, val);
    else if (tag==='textarea' && ts) ts.call(el, val);
    else el.value = val;
    ['input','change','blur'].forEach(ev => el.dispatchEvent(new Event(ev,{bubbles:true,cancelable:true})));
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ─── Fill select ──────────────────────────────────────────────────────────
  function fillSelect(el, val) {
    const v = String(val).toLowerCase().trim();
    for (let pass = 0; pass < 4; pass++) {
      for (const opt of el.options) {
        const ov = opt.value.toLowerCase(), ot = opt.text.toLowerCase().trim();
        if ([ov===v, ot===v, ot.startsWith(v)||ov.startsWith(v), ot.includes(v)||v.includes(ot)][pass]) {
          el.value = opt.value; el.dispatchEvent(new Event('change',{bubbles:true})); return true;
        }
      }
    }
    if (window.FPFuzzy) {
      let best=null,bs=0;
      for (const opt of el.options) { const s=FPFuzzy.matchScore(v,opt.text.toLowerCase().trim()); if(s>bs){bs=s;best=opt;} }
      if (bs>0.4&&best) { el.value=best.value; el.dispatchEvent(new Event('change',{bubbles:true})); return true; }
    }
    return false;
  }

  // ─── Fill radio ───────────────────────────────────────────────────────────
  function fillRadio(opts, val) {
    const v = String(val).toLowerCase().trim();
    for (const opt of opts) {
      const ol = (opt.label||opt.value||'').toLowerCase().trim();
      if (ol===v || opt.value?.toLowerCase()===v) { if(opt.el){opt.el.click();return true;} }
    }
    if (window.FPFuzzy) {
      let best=null,bs=0;
      for (const opt of opts) { const s=FPFuzzy.matchScore(v,(opt.label||'').toLowerCase()); if(s>bs){bs=s;best=opt;} }
      if (bs>0.4&&best?.el) { best.el.click(); return true; }
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN EXTRACTION — handles text, select, radio groups, checkbox groups
  // ═══════════════════════════════════════════════════════════════════════════
  function extractAllFields() {
    const fields = [];
    const usedEls = new Set();
    const radioGroupsDone = new Set();
    const checkboxGroupsDone = new Set();

    // ── STEP 1: Find all checkbox groups ────────────────────────────────────
    // A checkbox group = multiple checkboxes that share a common ancestor question
    const allCheckboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(isVisible);

    // Group checkboxes by their closest container (fieldset, role=group, or common ancestor)
    const cbContainers = new Map();
    for (const cb of allCheckboxes) {
      // Find container
      const container =
        cb.closest('fieldset') ||
        cb.closest('[role="group"]') ||
        cb.closest('[role="listbox"]') ||
        cb.closest('form') ||
        document.body;
      if (!cbContainers.has(container)) cbContainers.set(container, []);
      cbContainers.get(container).push(cb);
    }

    for (const [container, cbs] of cbContainers) {
      if (cbs.length < 2) {
        // Single checkbox — treat individually below
        continue;
      }
      // Multiple checkboxes in same container = a group
      const containerKey = container;
      if (checkboxGroupsDone.has(containerKey)) continue;
      checkboxGroupsDone.add(containerKey);

      // Find group title
      const firstCb = cbs[0];
      const groupTitle = findGroupTitle(firstCb) || getLabel(firstCb) || 'Checkbox Group';

      // Collect options
      const options = cbs.map(cb => ({
        el: cb,
        value: cb.value || cb.getAttribute('data-value') || '',
        label: getLabel(cb) || cb.value || cb.getAttribute('data-value') || '',
      }));

      cbs.forEach(cb => usedEls.add(cb));

      fields.push({
        element: firstCb,
        allElements: cbs,
        label: groupTitle,
        type: 'checkbox_group',
        options: options,
        placeholder: '',
        required: cbs.some(cb => cb.required || cb.getAttribute('aria-required')==='true'),
        name: firstCb.name || '',
        id: firstCb.id || '',
        currentValue: cbs.filter(cb=>cb.checked).map(cb=>getLabel(cb)||cb.value).join(', '),
        fillState: FS.DETECTED,
      });
    }

    // ── STEP 2: Find all radio groups ────────────────────────────────────────
    const allRadios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(isVisible);
    const radioByName = new Map();
    for (const r of allRadios) {
      const name = r.name || r.getAttribute('data-name') || 'unnamed_'+Math.random();
      if (!radioByName.has(name)) radioByName.set(name, []);
      radioByName.get(name).push(r);
    }

    for (const [name, radios] of radioByName) {
      if (radioGroupsDone.has(name)) continue;
      radioGroupsDone.add(name);

      const first = radios[0];
      const groupTitle = findGroupTitle(first) || getLabel(first) || 'Choice';
      const options = radios.map(r => ({
        el: r,
        value: r.value || '',
        label: getLabel(r) || r.value || '',
      }));

      radios.forEach(r => usedEls.add(r));

      fields.push({
        element: first,
        allElements: radios,
        label: groupTitle,
        type: 'radio_group',
        options: options,
        placeholder: '',
        required: radios.some(r => r.required || r.getAttribute('aria-required')==='true'),
        name: name,
        id: first.id || '',
        currentValue: (radios.find(r=>r.checked)||{}).value || '',
        fillState: FS.DETECTED,
      });
    }

    // ── STEP 3: All other interactive fields ─────────────────────────────────
    const SELECTORS = [
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="radio"]):not([type="checkbox"])',
      'textarea',
      'select',
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
      if (tag==='select') {
        options = Array.from(el.options).filter(o=>o.text.trim()).map(o=>({value:o.value,label:o.text.trim()}));
      }

      fields.push({
        element: el,
        label,
        type: fieldType,
        options,
        placeholder: el.placeholder||'',
        required: el.required||el.getAttribute('aria-required')==='true',
        name: el.name||'',
        id: el.id||'',
        currentValue: el.value||'',
        fillState: FS.DETECTED,
      });
    }

    // Sort by DOM order
    fields.sort((a,b) => {
      const pos = a.element.compareDocumentPosition(b.element);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    return fields;
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

  // ─── Fill a field ──────────────────────────────────────────────────────────
  async function fillField(field, value, delay) {
    if (value===''||value==null) return FS.SKIPPED;
    await sleep(delay==null?80:delay);
    const { element: el, type } = field;
    try {
      if (type==='select') return fillSelect(el,value)?FS.FILLED:FS.SKIPPED;

      if (type==='radio_group') {
        return fillRadio(field.options, value)?FS.FILLED:FS.SKIPPED;
      }

      if (type==='checkbox_group') {
        // value can be comma-separated: "Day 1,Day 2"
        const vals = String(value).toLowerCase().split(/[,;]+/).map(s=>s.trim());
        let any = false;
        for (const opt of field.options) {
          const ol = (opt.label||opt.value||'').toLowerCase().trim();
          const should = vals.some(v => {
            if (ol===v) return true;
            if (window.FPFuzzy) return FPFuzzy.matchScore(ol,v)>0.6;
            return false;
          });
          if (should && opt.el && !opt.el.checked) { opt.el.click(); any=true; await sleep(30); }
        }
        return any?FS.FILLED:FS.SKIPPED;
      }

      if (type==='checkbox') {
        const should = /^(yes|true|1|on|✓|check)/i.test(String(value));
        if (el.checked!==should) el.click();
        return FS.FILLED;
      }

      if (type==='contenteditable'||el.contentEditable==='true') {
        el.focus(); document.execCommand('selectAll'); document.execCommand('insertText',false,String(value));
        el.dispatchEvent(new Event('input',{bubbles:true})); return FS.FILLED;
      }

      el.focus(); simInput(el, String(value)); el.blur();
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
        chrome.runtime.sendMessage({type:'FORM_DETECTED',payload:{url:location.href,title:document.title,fieldCount:fields.length}}).catch(()=>{});
      }
    }
  }

  setTimeout(checkForForms, 800);
  setTimeout(checkForForms, 2500);

  const obs = new MutationObserver(muts => {
    const changed = muts.some(m => Array.from(m.addedNodes).some(n => n.nodeType===1&&(n.matches?.('form,input,select,textarea')||n.querySelector?.('input,select,textarea'))));
    if (changed) { formDetected=false; setTimeout(checkForForms,600); }
  });
  try { obs.observe(document.body,{childList:true,subtree:true}); } catch(e){}

  // ─── Messages ──────────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
    handleMsg(msg).then(sendResponse).catch(err=>sendResponse({success:false,error:err.message}));
    return true;
  });

  async function handleMsg(msg) {
    const {type,payload} = msg;
    switch(type) {

      case 'GET_FIELDS': {
        currentFields = extractAllFields();
        return {
          success:true,
          fields: currentFields.map((f,i)=>({
            index:i, label:f.label, type:f.type,
            options: f.options.map(o=>({value:o.value,label:o.label||o.value})),
            placeholder:f.placeholder, required:f.required,
            currentValue:f.currentValue, name:f.name,
          })),
          url:location.href, title:document.title,
        };
      }

      case 'FILL_FORM': {
        const {answers,delay=80,highlightFields=true} = payload;
        if (!currentFields.length) currentFields = extractAllFields();
        const results={};
        let filled=0,skipped=0,errors=0;
        for (const [idx,value] of Object.entries(answers)) {
          const i=parseInt(idx), field=currentFields[i];
          if (!field) continue;
          const state = await fillField(field,value,delay);
          results[i]=state; field.fillState=state;
          if (highlightFields) {
            if (field.allElements) highlightGroup(field.allElements,state);
            else highlight(field.element,state);
          }
          if(state===FS.FILLED) filled++;
          else if(state===FS.ERROR) errors++;
          else skipped++;
        }
        chrome.runtime.sendMessage({type:'FORM_FILLED',payload:{filled}}).catch(()=>{});
        return {success:true,filled,skipped,errors,total:Object.keys(answers).length,results};
      }

      case 'HIGHLIGHT_FIELDS': {
        currentFields.forEach((f,i)=>{
          if(f.allElements) highlightGroup(f.allElements,FS.DETECTED);
          else highlight(f.element,FS.DETECTED);
          f.element.setAttribute('data-fp-index',String(i));
        });
        return {success:true};
      }

      case 'CLEAR_HIGHLIGHTS': {
        currentFields.forEach(f=>{
          (f.allElements||[f.element]).forEach(el=>{el.style.outline='';el.style.outlineOffset='';});
        });
        return {success:true};
      }

      case 'SCROLL_TO_FIELD': {
        const f=currentFields[payload.fieldIndex];
        if(!f) return {success:false,error:'Not found'};
        f.element.scrollIntoView({behavior:'smooth',block:'center'});
        if(f.allElements) highlightGroup(f.allElements,FS.ERROR);
        else highlight(f.element,FS.ERROR);
        setTimeout(()=>f.element.focus(),400);
        return {success:true};
      }

      case 'FILL_SINGLE': {
        const f=currentFields[payload.fieldIndex];
        if(!f) return {success:false,error:'Not found'};
        const state=await fillField(f,payload.value,payload.delay||80);
        f.fillState=state;
        if(f.allElements) highlightGroup(f.allElements,state);
        else highlight(f.element,state);
        return {success:true,state};
      }

      case 'GET_FORM_INFO':
        return {success:true,url:location.href,title:document.title,fieldCount:currentFields.length,hasForm:currentFields.length>=1};

      default:
        return {success:false,error:`Unknown: ${type}`};
    }
  }
})();
