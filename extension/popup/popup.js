/**
 * FormPilot AI — Popup v2.2 (Full Fix)
 */

/* ═══════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════ */
var S = {
  user: null, isGuest: false,
  profiles: [],
  activePid: null,   // currently open in KV editor
  fillMethod: 'ai',
  detectedFields: [],
  formInfo: null,
  settings: {},
  categories: ['General','Personal','Education','Work','Contact'],
  kvFilter: 'all',
  selectedFids: new Set(),
  geminiKey: '',
  userFilled: 0, aiFilled: 0,
  pendingSave: [],
  kvOpen: false,   // whether KV editor is expanded
};

/* ═══════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════ */
var $ = function(id){ return document.getElementById(id); };
var $$ = function(sel){ return Array.from(document.querySelectorAll(sel)); };
function show(el){ if(el) el.classList.remove('hidden'); }
function hide(el){ if(el) el.classList.add('hidden'); }
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(ts){ return ts ? new Date(ts).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : ''; }

var _tt;
function toast(msg, type, dur){
  type = type||'info'; dur = dur||3000;
  var el = $('toast'); if(!el) return;
  el.textContent = msg; el.className = 'toast '+type;
  show(el); clearTimeout(_tt);
  _tt = setTimeout(function(){ hide(el); }, dur);
}

function setBtn(btn, on){
  if(!btn) return; btn.disabled = on;
  var t = btn.querySelector('.btn-text'), s = btn.querySelector('.spin');
  if(t) t.classList.toggle('hidden', on);
  if(s) s.classList.toggle('hidden', !on);
}

function showScreen(name){
  $$('.screen').forEach(function(s){ s.classList.remove('active'); });
  var el = $(name+'Screen'); if(el) el.classList.add('active');
}

function switchTab(name){
  $$('.tab-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.tab===name); });
  $$('.tab-pane').forEach(function(p){ p.classList.toggle('active', p.id==='tab-'+name); });
  if(name==='profiles') initProfilesTab();
  if(name==='history')  loadHistory();
  if(name==='stats')    loadStats();
  if(name==='settings') initSettings();
}

/* ═══════════════════════════════════════════════
   THEME
═══════════════════════════════════════════════ */
function applyTheme(t){
  t = t||'light';
  if(t==='system'){
    var dark = window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches;
    document.documentElement.setAttribute('data-theme', dark?'dark':'light');
  } else {
    document.documentElement.setAttribute('data-theme', t);
  }
  $$('.theme-opt').forEach(function(b){ b.classList.toggle('active', b.dataset.themeOpt===t); });
  S.settings.theme = t;
}

/* ═══════════════════════════════════════════════
   API / BACKEND
═══════════════════════════════════════════════ */
function apiProxy(method, endpoint, body){
  return new Promise(function(resolve, reject){
    chrome.runtime.sendMessage(
      {type:'API_REQUEST', payload:{method:method, endpoint:endpoint, body:body||null}},
      function(res){
        if(chrome.runtime.lastError){ reject(new Error(chrome.runtime.lastError.message)); return; }
        if(res&&res.success) resolve(res.data);
        else reject(Object.assign(new Error((res&&res.error)||'Request failed'),{status:res&&res.status}));
      }
    );
  });
}

function geminiGenerate(fields, profileKV, ctx, formType){
  return new Promise(function(resolve, reject){
    chrome.runtime.sendMessage({
      type:'GEMINI_GENERATE',
      payload:{ apiKey:S.geminiKey, fields:fields, profileKV:profileKV, formContext:ctx||'', formType:formType||'general' }
    }, function(res){
      if(chrome.runtime.lastError){ reject(new Error(chrome.runtime.lastError.message)); return; }
      if(res&&res.success) resolve(res.data);
      else reject(new Error((res&&res.error)||'AI failed'));
    });
  });
}

/* ═══════════════════════════════════════════════
   AUTH
═══════════════════════════════════════════════ */
function checkAuth(){
  return new Promise(function(resolve){
    chrome.runtime.sendMessage({type:'GET_AUTH_STATE'}, function(res){
      if(chrome.runtime.lastError||!res){ resolve(false); return; }
      if(res.isLoggedIn){ S.user = res.user; resolve(true); } else resolve(false);
    });
  });
}

function saveAuthData(data){
  return new Promise(function(resolve){
    chrome.runtime.sendMessage({
      type:'SAVE_TOKENS',
      payload:{accessToken:data.accessToken, refreshToken:data.refreshToken, user:data.user}
    }, resolve);
  });
}

function doLogout(){
  try{ apiProxy('POST','/api/auth/logout'); }catch(e){}
  chrome.runtime.sendMessage({type:'LOGOUT'}, function(){
    S.user=null; S.profiles=[]; showScreen('auth');
  });
}

/* ═══════════════════════════════════════════════
   PROFILE HELPERS
   KEY RULE: always use p.id (local) — never p._id
   Backend profiles get normalized on load.
═══════════════════════════════════════════════ */
// normProfile removed - local storage only

async function loadProfiles(){
  // ALWAYS local storage only. Never auto-import from backend.
  // User creates profiles manually inside the extension.
  S.profiles = await FPStorage.getProfiles();
}

function getPid(p){ return p.id; }

function findProfile(pid){
  return S.profiles.find(function(p){ return getPid(p)===pid; });
}

function getProfileKV(pid){
  var p = findProfile(pid); if(!p||!p.fields) return [];
  return p.fields.map(function(f){ return {key:f.key, value:f.value, aliases:f.aliases||[]}; });
}

/* Fill-tab profile select */
function renderProfileSelect(){
  var sel = $('profileSelect'); if(!sel) return;
  if(!S.profiles.length){
    sel.innerHTML = '<option value="">No profiles — create one in Profiles tab</option>';
    return;
  }
  sel.innerHTML = S.profiles.map(function(p){
    return '<option value="'+esc(getPid(p))+'"'+(p.isDefault?' selected':'')+'>'+esc(p.name)+(p.isDefault?' ★':'')+'</option>';
  }).join('');
}

/* ═══════════════════════════════════════════════
   FORM DETECTION
═══════════════════════════════════════════════ */
async function getTab(){
  var tabs = await chrome.tabs.query({active:true,currentWindow:true});
  return tabs[0]||null;
}

async function detectForm(){
  var banner=$('formStatusBanner'), txt=$('formStatusText');
  if(banner) banner.className='status-banner detecting';
  if(txt) txt.textContent='Scanning page…';
  try{
    var tab = await getTab(); if(!tab||!tab.id) throw new Error('No tab');
    if(tab.url&&(tab.url.startsWith('chrome://')||tab.url.startsWith('chrome-extension://'))){
      if(banner) banner.className='status-banner not-found';
      if(txt) txt.textContent='Cannot access Chrome system pages';
      return;
    }
    var res = await chrome.tabs.sendMessage(tab.id, {type:'GET_FORM_INFO'});
    if(res&&res.hasForm){
      S.formInfo = res;
      if(banner) banner.className='status-banner found';
      if(txt) txt.textContent='Form found — '+res.fieldCount+' fields detected';
      await fetchFields(tab.id);
    } else {
      if(banner) banner.className='status-banner not-found';
      if(txt) txt.textContent='No form detected on this page';
    }
  }catch(e){
    if(banner) banner.className='status-banner not-found';
    if(txt) txt.textContent='Navigate to a page with a form';
  }
}

async function fetchFields(tabId){
  try{
    var res = await chrome.tabs.sendMessage(tabId, {type:'GET_FIELDS'});
    if(res&&res.success&&res.fields&&res.fields.length){
      S.detectedFields = res.fields;
      setStats(res.fields.length, res.fields.filter(function(f){return f.required;}).length, 0, 0);
      show($('fieldsInfo'));
      var fb=$('fillBtn'); if(fb) fb.removeAttribute('disabled');
      if(S.settings.highlightFields!==false){
        chrome.tabs.sendMessage(tabId,{type:'HIGHLIGHT_FIELDS'}).catch(function(){});
      }
    }
  }catch(e){}
}

function setStats(total, req, filled, missing){
  var c=$('fieldsCount'),r=$('fieldsRequired'),f=$('fieldsFilled'),m=$('fieldsMissing');
  if(c) c.textContent=total; if(r) r.textContent=req;
  if(f) f.textContent=filled; if(m) m.textContent=missing;
}

/* ═══════════════════════════════════════════════
   FILL ENGINE
═══════════════════════════════════════════════ */
async function handleFill(){
  if(!S.detectedFields.length){ toast('No fields detected. Click Analyze Form first.','error'); return; }
  var btn=$('fillBtn'), sp=$('fillSpinner'), bt=$('fillBtnText');
  setBtn(btn,true); if(bt) bt.classList.add('hidden');
  hide($('completionReport')); hide($('manualPanel')); hide($('savePrompt'));
  S.userFilled=0; S.aiFilled=0; S.pendingSave=[];

  try{
    var pid = $('profileSelect')&&$('profileSelect').value;
    var kv = getProfileKV(pid);
    var ctx = ($('formContext')&&$('formContext').value)||'';
    var method = S.fillMethod;
    var answers = localMatch(kv);

    if(S.geminiKey&&(method==='ai'||method==='job'||method==='scholarship')){
      try{
        var aiRes = await geminiGenerate(S.detectedFields, kv, ctx,
          method==='job'?'job':method==='scholarship'?'scholarship':'general');
        var aiAns = (aiRes&&aiRes.answers)||{};
        Object.keys(aiAns).forEach(function(k){ if((!answers[k]||!answers[k])&&aiAns[k]) answers[k]=aiAns[k]; });
        S.aiFilled = Object.values(aiAns).filter(function(v){return v;}).length;
      }catch(err){ toast('AI: '+err.message,'error',4000); }
    }

    var tab = await getTab(); if(!tab) throw new Error('No active tab');
    var fillRes = await chrome.tabs.sendMessage(tab.id,{
      type:'FILL_FORM',
      payload:{answers:answers, delay:S.settings.fillDelay||80, highlightFields:S.settings.highlightFields!==false}
    });

    var filled = fillRes.filled||0, total = S.detectedFields.length, missing = total-filled;
    setStats(total, S.detectedFields.filter(function(f){return f.required;}).length, filled, missing);
    showReport(total, S.aiFilled, S.userFilled, missing);
    if(missing>0) showManualPanel(answers, fillRes.results||{});

    FPStorage.addHistoryEntry({
      formUrl:(S.formInfo&&S.formInfo.url)||tab.url,
      formTitle:(S.formInfo&&S.formInfo.title)||tab.title||'Untitled',
      website:(function(){ try{return new URL(tab.url).hostname;}catch(e){return '';} })(),
      totalFields:total, filledFields:filled, status:missing===0?'completed':'partial'
    }).catch(function(){});

    var b=$('formStatusBanner'),t=$('formStatusText');
    if(b) b.className=filled===total?'status-banner success':'status-banner found';
    if(t) t.textContent=(filled===total?'✓ ':'')+'Filled '+filled+' of '+total+' fields';
    toast('Filled '+filled+' of '+total+' fields!', filled===total?'success':'info');
  }catch(err){ toast(err.message||'Fill failed','error'); }
  finally{ setBtn(btn,false); if(bt) bt.classList.remove('hidden'); }
}

function localMatch(kv){
  var answers={}, threshold=(S.settings.fuzzyThreshold||45)/100;
  S.detectedFields.forEach(function(field,i){
    var match = FPFuzzy.findBestMatch(field.label, kv, threshold);
    if(match) answers[i] = match.item.value;
  });
  return answers;
}

function showReport(total,ai,user,manual){
  var rate = total>0?Math.round(((total-manual)/total)*100):0;
  var r=$('rTotal'),ra=$('rAI'),ru=$('rUser'),rm=$('rManual'),rr=$('rRate');
  if(r) r.textContent=total; if(ra) ra.textContent=ai;
  if(ru) ru.textContent=user; if(rm) rm.textContent=manual;
  if(rr) rr.textContent=rate+'%';
  show($('completionReport'));
}

function showManualPanel(answers, results){
  var list=$('missingFieldsList'); if(!list) return;
  var missing = S.detectedFields.map(function(f,i){return{f:f,i:i};})
    .filter(function(x){ return !answers[x.i]||answers[x.i]===''||results[x.i]!=='filled'; });
  if(!missing.length){ hide($('manualPanel')); return; }
  list.innerHTML = missing.map(function(x){
    return '<div class="missing-field" data-index="'+x.i+'">'
      +'<span class="mf-label">'+esc(x.f.label)+(x.f.required?' *':'')+'</span>'
      +'<input type="text" class="mf-input" data-mf-index="'+x.i+'" placeholder="Enter value…">'
      +'<div class="mf-actions">'
        +'<button class="btn-icon accent mf-go" data-mf-goto="'+x.i+'" title="Go to field">'
          +'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>'
        +'</button>'
        +'<button class="btn-icon mf-fill-one" data-mf-idx="'+x.i+'" title="Fill this field">'
          +'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>'
        +'</button>'
      +'</div>'
    +'</div>';
  }).join('');
  show($('manualPanel'));
}

/* ═══════════════════════════════════════════════
   PROFILES TAB
═══════════════════════════════════════════════ */
async function initProfilesTab(){
  await loadProfiles();
  S.categories = await FPStorage.getCategories();
  renderProfileList();
}

function renderProfileList(){
  var list=$('profilesList'); if(!list) return;
  if(!S.profiles.length){
    list.innerHTML='<div class="empty-state"><p>No profiles yet.<br>Click "+ New" to create one.</p></div>';
    hide($('kvEditorWrap')); return;
  }
  list.innerHTML = S.profiles.map(function(p){
    var pid = getPid(p);
    var isOpen = pid===S.activePid;
    return '<div class="profile-card'+(isOpen?' active-card':'')+'" data-pid="'+esc(pid)+'">'
      +'<div class="p-avatar">'+esc((p.name||'P')[0].toUpperCase())+'</div>'
      +'<div class="p-info">'
        +'<div class="p-name">'+esc(p.name||'Unnamed')+'</div>'
        +'<div class="p-meta">'+(p.fields?p.fields.length:0)+' fields'+(p.isDefault?' <span class="badge-default">DEFAULT</span>':'')+'</div>'
      +'</div>'
      +'<div class="p-actions">'
        +(!p.isDefault?'<button class="btn-icon accent p-btn" data-action="default" data-pid="'+esc(pid)+'" title="Set default">★</button>':'')
        +'<button class="btn-icon p-btn" data-action="rename" data-pid="'+esc(pid)+'" title="Rename">✏</button>'
        +'<button class="btn-icon danger p-btn" data-action="delete" data-pid="'+esc(pid)+'" title="Delete profile">✕</button>'
      +'</div>'
    +'</div>';
  }).join('');

  // Show/hide KV editor
  if(S.activePid && findProfile(S.activePid)){
    show($('kvEditorWrap'));
    renderKVEditor(S.activePid);
  } else {
    hide($('kvEditorWrap'));
  }

  // Also update fill-tab select
  renderProfileSelect();
}

/* Handle action buttons on profile cards */
async function onProfileAction(action, pid){
  if(action==='delete'){
    if(!confirm('Delete this profile and all its fields?')) return;
    // Remove from local storage
    await FPStorage.deleteProfile(pid);
    // Try backend too (silently)
    if(!S.isGuest){ try{ await apiProxy('DELETE','/api/profiles/'+pid); }catch(e){} }
    // If it was open in editor, close editor
    if(S.activePid===pid){ S.activePid=null; S.kvOpen=false; }
    // Reload
    S.profiles = await FPStorage.getProfiles();
    renderProfileList();
    toast('Profile deleted','info');
    return;
  }
  if(action==='rename'){
    openProfileModal(pid);
    return;
  }
  if(action==='default'){
    await FPStorage.setDefaultProfile(pid);
    S.profiles = await FPStorage.getProfiles();
    renderProfileList();
    toast('Default updated','success');
    return;
  }
  if(action==='open'){
    // Toggle: if already open, close it
    if(S.activePid===pid){
      S.activePid=null; S.kvOpen=false;
      hide($('kvEditorWrap'));
      // Remove active-card class
      $$('.profile-card').forEach(function(c){ c.classList.remove('active-card'); });
    } else {
      S.activePid=pid; S.kvOpen=true;
      $$('.profile-card').forEach(function(c){ c.classList.toggle('active-card', c.dataset.pid===pid); });
      show($('kvEditorWrap'));
      renderKVEditor(pid);
    }
  }
}

/* ═══════════════════════════════════════════════
   KV EDITOR
═══════════════════════════════════════════════ */
function renderKVEditor(pid){
  var p = findProfile(pid); if(!p) return;
  var nameEl=$('kvProfileName'); if(nameEl) nameEl.textContent=(p.name||'Profile')+' Fields';
  renderCatChips();
  renderKVList(pid);
}

function renderCatChips(){
  var row=$('catRow'); if(!row) return;
  row.innerHTML =
    '<span class="cat-chip'+(S.kvFilter==='all'?' active':'')+'" data-cat="all">All</span>'
    + S.categories.map(function(c){
        return '<span class="cat-chip'+(S.kvFilter===c?' active':'')+'" data-cat="'+esc(c)+'">'+esc(c)+'</span>';
      }).join('')
    + '<button class="cat-add" id="addCatBtn">+ Cat</button>';
}

function renderKVList(pid){
  if(!pid) return;
  var p = findProfile(pid);
  var fields = (p&&p.fields)||[];
  var filtered = fields.filter(function(f){
    return S.kvFilter==='all' || f.category===S.kvFilter;
  });

  var countEl=$('kvCount'); if(countEl) countEl.textContent=filtered.length+' of '+fields.length+' fields';
  var list=$('kvList'); if(!list) return;

  if(!filtered.length){
    list.innerHTML='<div class="empty-state"><p>'+(S.kvFilter!=='all'?'No fields in this category.':'No fields yet.')+'<br>Use the form above to add one.</p></div>';
    return;
  }

  list.innerHTML = filtered.map(function(f){
    var sel = S.selectedFids.has(f.id);
    return '<div class="kv-row'+(sel?' sel':'')+'" data-fid="'+esc(f.id)+'">'
      +'<input type="text" class="kv-cell key kv-key" data-fid="'+esc(f.id)+'" value="'+esc(f.key)+'" placeholder="Key">'
      +'<input type="text" class="kv-cell kv-val" data-fid="'+esc(f.id)+'" value="'+esc(f.value)+'" placeholder="Value">'
      +'<div class="kv-row-acts">'
        +'<input type="checkbox" class="kv-cb" data-fid="'+esc(f.id)+'"'+(sel?' checked':'')+' title="Select">'
        +'<button class="btn-icon danger kv-del" data-fid="'+esc(f.id)+'" title="Delete field" style="padding:3px">'
          +'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">'
          +'<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        +'</button>'
      +'</div>'
    +'</div>';
  }).join('');
}

async function addField(){
  if(!S.activePid){ toast('Select a profile first','error'); return; }
  var keyEl=$('newFieldKey'), valEl=$('newFieldVal');
  var key=(keyEl&&keyEl.value.trim())||'';
  var val=(valEl&&valEl.value.trim())||'';
  if(!key){ toast('Key is required','error'); if(keyEl) keyEl.focus(); return; }
  await FPStorage.addField(S.activePid, key, val, []);
  // Reload profiles from storage so S.profiles is fresh
  S.profiles = await FPStorage.getProfiles();
  if(keyEl) keyEl.value=''; if(valEl) valEl.value='';
  if(keyEl) keyEl.focus();
  renderKVList(S.activePid);
  var countEl=$('kvCount');
  var p=findProfile(S.activePid);
  if(countEl&&p) countEl.textContent=(p.fields?p.fields.length:0)+' fields';
  // Update profile list field count
  var card=document.querySelector('.profile-card[data-pid="'+esc(S.activePid)+'"] .p-meta');
  if(card&&p) card.innerHTML=(p.fields?p.fields.length:0)+' fields'+(p.isDefault?' <span class="badge-default">DEFAULT</span>':'');
  toast('Field added','success');
}

/* ═══════════════════════════════════════════════
   PROFILE MODAL (create / rename)
═══════════════════════════════════════════════ */
function openProfileModal(pid){
  // pid = null → create new, pid = string → rename
  var isNew = !pid;
  var title=$('modalTitle'); if(title) title.textContent=isNew?'New Profile':'Rename Profile';
  var inp=$('mpName');
  if(inp){
    if(!isNew){
      var p = findProfile(pid);
      inp.value = (p&&p.name)||'';
    } else {
      inp.value='';
    }
    setTimeout(function(){ inp.focus(); inp.select(); }, 120);
  }
  // Store which profile we're editing in a data attribute on the modal
  var modal=$('profileModal');
  if(modal) modal.dataset.editPid = pid||'';
  show(modal);
}

async function saveProfile(){
  var modal=$('profileModal');
  var pid = modal&&modal.dataset.editPid;
  var isNew = !pid;
  var name = ($('mpName')&&$('mpName').value.trim())||'';
  if(!name){ toast('Profile name is required','error'); return; }

  var btn=$('saveProfileBtn'); if(btn) btn.disabled=true;
  try{
    if(isNew){
      // CREATE
      var newP = await FPStorage.createProfile(name);
      S.activePid = newP.id;
      S.kvOpen = true;
      toast('Profile created!','success');
    } else {
      // RENAME — update in local storage
      await FPStorage.updateProfile(pid, {name:name});
      // Also try backend silently
      if(!S.isGuest){ try{ await apiProxy('PUT','/api/profiles/'+pid,{profileName:name}); }catch(e){} }
      toast('Renamed!','success');
    }
    hide(modal);
    // Reload
    S.profiles = await FPStorage.getProfiles();
    renderProfileList();
    renderProfileSelect();
    if(S.activePid){
      show($('kvEditorWrap'));
      renderKVEditor(S.activePid);
    }
  }catch(err){ toast(err.message||'Failed to save','error'); }
  finally{ if(btn) btn.disabled=false; }
}

/* ═══════════════════════════════════════════════
   IMPORT / EXPORT
═══════════════════════════════════════════════ */
function exportProfile(){
  if(!S.activePid){ toast('Open a profile first','error'); return; }
  FPStorage.exportProfile(S.activePid).then(function(json){
    if(!json){ toast('Export failed','error'); return; }
    var b=new Blob([json],{type:'application/json'});
    var u=URL.createObjectURL(b);
    var a=document.createElement('a'); a.href=u; a.download='formpilot-profile.json'; a.click();
    URL.revokeObjectURL(u); toast('Exported!','success');
  });
}

function importProfile(){
  var inp=document.createElement('input'); inp.type='file'; inp.accept='.json';
  inp.onchange=async function(){
    var file=inp.files[0]; if(!file) return;
    try{
      var text=await file.text();
      var p=await FPStorage.importProfile(text);
      S.profiles=await FPStorage.getProfiles();
      renderProfileList(); renderProfileSelect();
      toast('Imported: '+p.name,'success');
    }catch(e){ toast('Invalid JSON','error'); }
  };
  inp.click();
}

/* ═══════════════════════════════════════════════
   HISTORY
═══════════════════════════════════════════════ */
async function loadHistory(search){
  var list=$('historyList'); if(!list) return;
  list.innerHTML='<div class="loading-state">Loading…</div>';
  var entries=await FPStorage.getHistory();
  if(search){ var q=search.toLowerCase(); entries=entries.filter(function(e){return (e.formTitle||'').toLowerCase().includes(q)||(e.website||'').toLowerCase().includes(q);}); }
  if(!S.isGuest){
    try{
      var res=await apiProxy('GET','/api/forms/history?limit=30'+(search?'&search='+encodeURIComponent(search):''));
      var remote=(res&&res.data&&res.data.forms)||[];
      var us=new Set(remote.map(function(r){return r.formUrl;}));
      entries=remote.concat(entries.filter(function(e){return !us.has(e.formUrl);}));
    }catch(e){}
  }
  if(!entries.length){ list.innerHTML='<div class="empty-state"><p>No history yet.</p></div>'; return; }
  list.innerHTML=entries.slice(0,50).map(function(e){
    var s=e.status||'completed', cc=s==='completed'?'chip-success':s==='partial'?'chip-warn':'chip-error';
    return '<div class="history-card">'
      +'<div class="history-title">'+esc(e.formTitle||e.formUrl||'Untitled')+'</div>'
      +'<div class="history-meta"><span>'+esc(e.website||'')+'</span><span class="chip '+cc+'">'+s+'</span></div>'
      +'<div class="history-meta" style="margin-top:2px;"><span>'+fmtDate(e.createdAt)+'</span><span>'+(e.filledFields||0)+'/'+(e.totalFields||0)+' fields</span></div>'
    +'</div>';
  }).join('');
}

/* ═══════════════════════════════════════════════
   STATS
═══════════════════════════════════════════════ */
async function loadStats(){
  var c=$('statsData'); if(!c) return;
  var entries=await FPStorage.getHistory();
  var total=entries.length, done=entries.filter(function(e){return e.status==='completed';}).length;
  var rate=total>0?Math.round((done/total)*100):0;
  var n=new Date(), thisMonth=entries.filter(function(e){ var d=new Date(e.createdAt); return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear(); }).length;
  var totalF=entries.reduce(function(a,e){return a+(e.filledFields||0);},0);
  c.innerHTML=
    '<div class="stat-card"><div class="stat-val">'+total+'</div><div class="stat-lbl">Total Forms</div></div>'
    +'<div class="stat-card"><div class="stat-val grn">'+rate+'%</div><div class="stat-lbl">Success Rate</div></div>'
    +'<div class="stat-card"><div class="stat-val acc">'+thisMonth+'</div><div class="stat-lbl">This Month</div></div>'
    +'<div class="stat-card"><div class="stat-val">'+S.profiles.length+'</div><div class="stat-lbl">Profiles</div></div>'
    +'<div class="stat-card wide"><div class="stat-lbl">Fields Filled All Time</div><div class="stat-val acc">'+totalF+'</div></div>';
}

/* ═══════════════════════════════════════════════
   SETTINGS
═══════════════════════════════════════════════ */
async function initSettings(){
  S.settings = await FPStorage.getSettings();
  applyTheme(S.settings.theme||'light');
  var r=await chrome.storage.local.get(['fp_gemini_key']);
  S.geminiKey = r['fp_gemini_key']||'';
  var ki=$('geminiKeyInput'); if(ki) ki.value=S.geminiKey?'•'.repeat(24):'';
  var ks=$('geminiKeyStatus');
  if(ks){ ks.textContent=S.geminiKey?'✓ API key saved':'No key — profile matching only'; ks.style.color=S.geminiKey?'var(--green)':'var(--text-3)'; }
  var fds=$('fillDelaySlider'), fdv=$('fillDelayVal');
  if(fds){ fds.value=S.settings.fillDelay||80; if(fdv) fdv.textContent=(S.settings.fillDelay||80)+'ms'; }
  var ht=$('highlightToggle'); if(ht) ht.checked=S.settings.highlightFields!==false;
  var sm=$('saveManualToggle'); if(sm) sm.checked=S.settings.saveManualEntries!==false;
}

/* ═══════════════════════════════════════════════
   CLEAR ALL DATA
═══════════════════════════════════════════════ */
async function clearAllData(){
  if(!confirm('DELETE ALL DATA?\n\nAll profiles, fields, and history will be permanently deleted.')) return;
  if(!confirm('Final confirmation: Are you sure?')) return;
  // Wipe chrome storage completely
  await chrome.storage.local.clear();
  // Restore critical defaults so extension doesn't break
  await chrome.storage.local.set({
    'fp_env': 'production',
    'fp_settings':{ theme:'light', fillDelay:80, highlightFields:true, saveManualEntries:true, fuzzyThreshold:45 }
  });
  // Reset state
  S.profiles=[]; S.activePid=null; S.kvOpen=false;
  S.user=null; S.geminiKey='';
  S.detectedFields=[]; S.selectedFids=new Set();
  toast('All data deleted. Please log in again.','info',4000);
  // Go back to auth screen immediately
  showScreen('auth');
}

/* ═══════════════════════════════════════════════
   SAVE PROMPT
═══════════════════════════════════════════════ */
function showSavePrompt(){
  var n=S.pendingSave.length; if(!n) return;
  var t=$('savePromptText'); if(t) t.textContent='Save '+n+' value'+(n>1?'s':'')+' to profile?';
  show($('savePrompt'));
}

/* ═══════════════════════════════════════════════
   INIT APP
═══════════════════════════════════════════════ */
async function initApp(isGuest){
  S.isGuest = !!isGuest;
  showScreen('app');
  S.settings = await FPStorage.getSettings();
  applyTheme(S.settings.theme||'light');
  S.categories = await FPStorage.getCategories();
  var r=await chrome.storage.local.get(['fp_gemini_key']);
  S.geminiKey = r['fp_gemini_key']||'';
  // One-time migration: wipe profiles that were auto-imported from backend
  // (they have no 'fields' array — old format). User starts fresh with clean local profiles.
  await cleanOldBackendProfiles();
  await loadProfiles();
  renderProfileSelect();
  await detectForm();
}

async function cleanOldBackendProfiles(){
  var profiles = await FPStorage.getProfiles();
  if(!profiles.length) return;
  // Check if any profile is old backend format (has _id or no fields array)
  var hasOld = profiles.some(function(p){
    return !Array.isArray(p.fields) || p._id;
  });
  if(hasOld){
    // Remove ALL old-format profiles — user will create fresh ones
    var clean = profiles.filter(function(p){ return Array.isArray(p.fields) && !p._id; });
    await FPStorage.saveProfiles(clean);
    console.log('[FormPilot] Cleaned', profiles.length - clean.length, 'old backend profiles');
  }
}

/* ═══════════════════════════════════════════════
   EVENT LISTENERS
═══════════════════════════════════════════════ */
function initEvents(){

  /* AUTH TABS */
  $$('.auth-tab').forEach(function(tab){
    tab.addEventListener('click',function(){
      $$('.auth-tab').forEach(function(t){t.classList.remove('active');});
      tab.classList.add('active');
      $$('.auth-form').forEach(function(f){f.classList.remove('active');});
      var form=$(tab.dataset.tab+'Form'); if(form) form.classList.add('active');
    });
  });

  $$('.toggle-pw').forEach(function(btn){
    btn.addEventListener('click',function(){
      var inp=$(btn.dataset.target); if(inp) inp.type=inp.type==='password'?'text':'password';
    });
  });

  /* LOGIN */
  var lf=$('loginForm');
  if(lf) lf.addEventListener('submit',async function(e){
    e.preventDefault();
    var btn=$('loginBtn'), err=$('loginError');
    hide(err); setBtn(btn,true);
    try{
      var res=await apiProxy('POST','/api/auth/login',{email:$('loginEmail').value.trim(),password:$('loginPassword').value});
      var d=res.data||res; if(!d.accessToken) throw new Error('No token');
      await saveAuthData(d); S.user=d.user; await initApp(false);
    }catch(ex){ show(err); if(err) err.textContent=ex.message||'Login failed'; }
    finally{ setBtn(btn,false); }
  });

  /* REGISTER */
  var rf=$('registerForm');
  if(rf) rf.addEventListener('submit',async function(e){
    e.preventDefault();
    var btn=$('registerBtn'), err=$('registerError');
    hide(err);
    var pw=$('regPassword').value;
    if(pw.length<8||!/[A-Z]/.test(pw)||!/\d/.test(pw)){
      show(err); if(err) err.textContent='Password: 8+ chars, 1 uppercase, 1 number'; return;
    }
    setBtn(btn,true);
    try{
      var res=await apiProxy('POST','/api/auth/register',{name:$('regName').value.trim(),email:$('regEmail').value.trim(),password:pw});
      var d=res.data||res; if(!d.accessToken) throw new Error('Registration failed');
      await saveAuthData(d); S.user=d.user; await initApp(false);
    }catch(ex){ show(err); if(err) err.textContent=ex.message||'Register failed'; }
    finally{ setBtn(btn,false); }
  });

  /* GUEST */
  var gb=$('guestBtn'); if(gb) gb.addEventListener('click',function(){ initApp(true); });

  /* TAB BUTTONS */
  $$('.tab-btn').forEach(function(btn){
    btn.addEventListener('click',function(){ switchTab(btn.dataset.tab); });
  });

  /* THEME BUTTON (cycle) */
  var tb=$('themeBtn');
  if(tb) tb.addEventListener('click',function(){
    var order=['light','dark','system'], cur=S.settings.theme||'light';
    var next=order[(order.indexOf(cur)+1)%order.length];
    applyTheme(next); FPStorage.saveSettings({theme:next}); toast('Theme: '+next,'info',1200);
  });

  /* THEME OPTS in settings */
  document.addEventListener('click',function(e){
    var to=e.target.closest('[data-theme-opt]');
    if(to){ applyTheme(to.dataset.themeOpt); FPStorage.saveSettings({theme:to.dataset.themeOpt}); }
  });

  /* LOGOUT */
  var lb=$('logoutBtn'); if(lb) lb.addEventListener('click',function(){ if(confirm('Log out?')) doLogout(); });

  /* ANALYZE */
  var ab=$('analyzeBtn');
  if(ab) ab.addEventListener('click',async function(){
    ab.disabled=true; ab.textContent='Analyzing…';
    S.detectedFields=[]; hide($('fieldsInfo')); hide($('completionReport')); hide($('manualPanel'));
    var fb=$('fillBtn'); if(fb) fb.setAttribute('disabled','');
    try{ await detectForm(); }
    finally{
      ab.disabled=false;
      ab.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Analyze Form';
    }
  });

  /* FILL */
  var fb=$('fillBtn'); if(fb) fb.addEventListener('click',handleFill);

  /* METHOD BUTTONS */
  $$('.method-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      $$('.method-btn').forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active'); S.fillMethod=btn.dataset.method;
      var labels={ai:'Fill with AI',profile:'Fill from Profile',job:'Fill Job App',scholarship:'Fill Scholarship'};
      var t=$('fillBtnText'); if(t) t.textContent=labels[S.fillMethod]||'Fill Form';
    });
  });

  /* PROFILE SELECT (fill tab) */
  var ps=$('profileSelect');
  if(ps) ps.addEventListener('change',function(){ S.activePid=ps.value; });

  /* ── PROFILES TAB EVENTS (delegated on whole tab pane) ── */
  var profileTab=$('tab-profiles');
  if(profileTab){
    profileTab.addEventListener('click',async function(e){
      // Action buttons (rename, delete, default) — stop propagation
      var actionBtn=e.target.closest('.p-btn');
      if(actionBtn){
        e.stopPropagation();
        await onProfileAction(actionBtn.dataset.action, actionBtn.dataset.pid);
        return;
      }
      // Click on profile card body → toggle open
      var card=e.target.closest('.profile-card');
      if(card){ await onProfileAction('open', card.dataset.pid); return; }

      // Category chips
      var chip=e.target.closest('.cat-chip');
      if(chip){
        S.kvFilter=chip.dataset.cat;
        $$('.cat-chip').forEach(function(c){c.classList.toggle('active',c.dataset.cat===S.kvFilter);});
        if(S.activePid) renderKVList(S.activePid);
        return;
      }

      // Add category button
      var catAdd=e.target.closest('#addCatBtn');
      if(catAdd){
        var name=prompt('New category name:');
        if(name&&name.trim()&&!S.categories.includes(name.trim())){
          S.categories.push(name.trim());
          await FPStorage.saveCategories(S.categories);
          renderCatChips();
          toast('Category added','success');
        }
        return;
      }

      // KV: Delete field
      var del=e.target.closest('.kv-del');
      if(del){
        await FPStorage.deleteField(S.activePid, del.dataset.fid);
        S.selectedFids.delete(del.dataset.fid);
        S.profiles=await FPStorage.getProfiles();
        renderKVList(S.activePid);
        // update count in card
        var p=findProfile(S.activePid);
        var meta=document.querySelector('.profile-card[data-pid="'+esc(S.activePid)+'"] .p-meta');
        if(meta&&p) meta.innerHTML=(p.fields?p.fields.length:0)+' fields'+(p.isDefault?' <span class="badge-default">DEFAULT</span>':'');
        return;
      }

      // KV: Checkbox
      var cb=e.target.closest('.kv-cb');
      if(cb){
        if(cb.checked) S.selectedFids.add(cb.dataset.fid);
        else S.selectedFids.delete(cb.dataset.fid);
        var row=cb.closest('.kv-row');
        if(row) row.classList.toggle('sel',cb.checked);
        return;
      }
    });

    // KV: Inline edit on blur
    profileTab.addEventListener('focusout',async function(e){
      var cell=e.target.closest('.kv-key,.kv-val'); if(!cell||!S.activePid) return;
      var fid=cell.dataset.fid, isKey=cell.classList.contains('kv-key'), val=cell.value.trim();
      if(isKey&&!val){ cell.value='Key'; return; }
      await FPStorage.updateField(S.activePid, fid, isKey?{key:val}:{value:val});
      S.profiles=await FPStorage.getProfiles();
    });
  }

  /* NEW PROFILE */
  var npb=$('newProfileBtn'); if(npb) npb.addEventListener('click',function(){ openProfileModal(null); });

  /* MODAL: Save button */
  var spb=$('saveProfileBtn'); if(spb) spb.addEventListener('click', saveProfile);
  /* MODAL: Cancel / close */
  var cnb=$('cancelModal'); if(cnb) cnb.addEventListener('click',function(){hide($('profileModal'));});
  var cmb=$('closeModal'); if(cmb) cmb.addEventListener('click',function(){hide($('profileModal'));});
  var ov=$('modalOverlay'); if(ov) ov.addEventListener('click',function(){hide($('profileModal'));});
  /* MODAL: Enter key */
  var mpn=$('mpName');
  if(mpn) mpn.addEventListener('keydown',function(e){ if(e.key==='Enter') saveProfile(); });

  /* EXPORT / IMPORT */
  var exb=$('exportProfileBtn'); if(exb) exb.addEventListener('click',exportProfile);
  var imb=$('importProfileBtn'); if(imb) imb.addEventListener('click',importProfile);

  /* ADD FIELD */
  var afb=$('addFieldBtn'); if(afb) afb.addEventListener('click',addField);
  var nfv=$('newFieldVal'); if(nfv) nfv.addEventListener('keydown',function(e){if(e.key==='Enter') addField();});
  var nfk=$('newFieldKey'); if(nfk) nfk.addEventListener('keydown',function(e){if(e.key==='Tab'||e.key==='Enter'){e.preventDefault(); var v=$('newFieldVal');if(v) v.focus();}});

  /* BULK DELETE */
  var bdb=$('bulkDeleteBtn');
  if(bdb) bdb.addEventListener('click',async function(){
    if(!S.selectedFids.size){ toast('Select fields first','error'); return; }
    if(!confirm('Delete '+S.selectedFids.size+' field(s)?')) return;
    await FPStorage.bulkDeleteFields(S.activePid, Array.from(S.selectedFids));
    S.selectedFids.clear();
    S.profiles=await FPStorage.getProfiles();
    renderKVList(S.activePid); toast('Deleted','info');
  });

  /* HISTORY SEARCH */
  var hs=$('historySearch'), ht2;
  if(hs) hs.addEventListener('input',function(){ clearTimeout(ht2); ht2=setTimeout(function(){loadHistory(hs.value);},350); });

  /* CLEAR HISTORY */
  var ch=$('clearHistoryBtn');
  if(ch) ch.addEventListener('click',async function(){
    if(!confirm('Clear all history?')) return;
    await FPStorage.clearHistory();
    if(!S.isGuest){ try{await apiProxy('DELETE','/api/forms/history');}catch(e){} }
    toast('Cleared','info'); loadHistory();
  });

  /* SETTINGS: Gemini key */
  var sgb=$('saveGeminiKey');
  if(sgb) sgb.addEventListener('click',async function(){
    var inp=$('geminiKeyInput'), key=(inp&&inp.value.trim())||'';
    if(key&&key.replace(/•/g,'').length===0){ toast('Enter a real API key','error'); return; }
    S.geminiKey=key;
    await chrome.storage.local.set({'fp_gemini_key':key});
    var ks=$('geminiKeyStatus');
    if(ks){ks.textContent=key?'✓ Saved!':'Key removed';ks.style.color=key?'var(--green)':'var(--text-3)';}
    toast(key?'API key saved':'Key removed','success');
  });

  /* SETTINGS: Fill delay */
  var fds=$('fillDelaySlider'), fdv=$('fillDelayVal');
  if(fds) fds.addEventListener('input',function(){
    S.settings.fillDelay=parseInt(fds.value); if(fdv) fdv.textContent=fds.value+'ms';
    FPStorage.saveSettings({fillDelay:parseInt(fds.value)});
  });

  /* SETTINGS: Toggles */
  var htg=$('highlightToggle');
  if(htg) htg.addEventListener('change',function(){ S.settings.highlightFields=htg.checked; FPStorage.saveSettings({highlightFields:htg.checked}); });
  var smt=$('saveManualToggle');
  if(smt) smt.addEventListener('change',function(){ S.settings.saveManualEntries=smt.checked; FPStorage.saveSettings({saveManualEntries:smt.checked}); });

  /* CLEAR ALL DATA */
  var cad=$('clearAllDataBtn'); if(cad) cad.addEventListener('click', clearAllData);

  /* MANUAL FILL: Go to field + fill one */
  document.addEventListener('click',async function(e){
    var go=e.target.closest('.mf-go');
    if(go){
      var idx=parseInt(go.dataset.mfGoto), tab=await getTab();
      if(tab) chrome.runtime.sendMessage({type:'SCROLL_TO_FIELD',payload:{tabId:tab.id,fieldIndex:idx}});
      return;
    }
    var fo=e.target.closest('.mf-fill-one');
    if(fo){
      var idx2=parseInt(fo.dataset.mfIdx);
      var mfRow=document.querySelector('.missing-field[data-index="'+idx2+'"]');
      var inp=mfRow&&mfRow.querySelector('.mf-input');
      var val=inp?inp.value.trim():'';
      if(!val){ toast('Enter a value first','error'); return; }
      var tab2=await getTab(); if(!tab2) return;
      try{
        var res=await chrome.tabs.sendMessage(tab2.id,{type:'FILL_SINGLE',payload:{fieldIndex:idx2,value:val,delay:50}});
        if(res&&res.state==='filled'){
          S.userFilled++; if(mfRow) mfRow.remove();
          if(S.settings.saveManualEntries&&S.detectedFields[idx2]){
            S.pendingSave.push({key:S.detectedFields[idx2].label,value:val}); showSavePrompt();
          }
          toast('Filled!','success');
        } else { toast('Could not fill this field','error'); }
      }catch(err){ toast(err.message||'Error','error'); }
    }
  });

  /* FILL ALL MISSING */
  var fmb=$('fillMissingBtn');
  if(fmb) fmb.addEventListener('click',async function(){
    var rows=$$('.missing-field'), answers={};
    rows.forEach(function(row){ var idx=parseInt(row.dataset.index),inp=row.querySelector('.mf-input'); if(inp&&inp.value.trim()) answers[idx]=inp.value.trim(); });
    if(!Object.keys(answers).length){ toast('Enter values above','error'); return; }
    var tab=await getTab(); if(!tab) return;
    try{
      var res=await chrome.tabs.sendMessage(tab.id,{type:'FILL_FORM',payload:{answers:answers,delay:60,highlightFields:true}});
      S.userFilled+=res.filled||0; hide($('manualPanel')); toast('Filled '+(res.filled||0)+' fields!','success');
      if(S.settings.saveManualEntries){
        Object.entries(answers).forEach(function(e){
          var lbl=S.detectedFields[parseInt(e[0])]&&S.detectedFields[parseInt(e[0])].label;
          if(lbl) S.pendingSave.push({key:lbl,value:e[1]});
        }); showSavePrompt();
      }
    }catch(err){ toast(err.message||'Failed','error'); }
  });

  /* SAVE PROMPT */
  var sy=$('saveYesBtn');
  if(sy) sy.addEventListener('click',async function(){
    var pid=S.activePid||($('profileSelect')&&$('profileSelect').value);
    if(!pid){ toast('Select a profile first','error'); return; }
    for(var i=0;i<S.pendingSave.length;i++) await FPStorage.addField(pid,S.pendingSave[i].key,S.pendingSave[i].value,[]);
    S.pendingSave=[]; hide($('savePrompt')); toast('Saved to profile!','success');
    S.profiles=await FPStorage.getProfiles();
  });
  var sn=$('saveNoBtn');
  if(sn) sn.addEventListener('click',function(){ S.pendingSave=[]; hide($('savePrompt')); });
}

/* ═══════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded',async function(){
  document.documentElement.setAttribute('data-theme','light');
  initEvents();
  var settings=await FPStorage.getSettings();
  applyTheme(settings.theme||'light');
  S.settings=settings;
  var loggedIn=await checkAuth();
  if(loggedIn) await initApp(false);
  else showScreen('auth');
});
