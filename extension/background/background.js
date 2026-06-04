/**
 * FormPilot AI — Background v2.3
 */
const API_URLS = { production:'https://formpilot-backend.onrender.com', development:'http://localhost:5000' };

async function getBaseURL(){
  const r=await chrome.storage.local.get(['fp_env']);
  return API_URLS[r['fp_env']||'production'];
}
async function getToken(){
  const r=await chrome.storage.local.get(['fp_access_token','fp_token_expiry']);
  const t=r['fp_access_token'],exp=r['fp_token_expiry'];
  if(!t) return null; if(exp&&Date.now()>=exp) return null; return t;
}
async function apiCall(endpoint,method,body,retries=2){
  const base=await getBaseURL(),token=await getToken();
  const headers={'Content-Type':'application/json'};
  if(token) headers['Authorization']='Bearer '+token;
  for(let attempt=0;attempt<=retries;attempt++){
    try{
      const ctrl=new AbortController();
      const to=setTimeout(()=>ctrl.abort(),30000);
      const res=await fetch(`${base}${endpoint}`,{method:method||'GET',headers,signal:ctrl.signal,...(body?{body:JSON.stringify(body)}:{})});
      clearTimeout(to);
      const data=await res.json();
      if(!res.ok){const e=new Error(data.message||`HTTP ${res.status}`);e.status=res.status;throw e;}
      return data;
    }catch(err){
      if(err.name==='AbortError') throw new Error('Request timed out');
      if(err.status===401) throw err;
      if(attempt<retries){await new Promise(r=>setTimeout(r,800*(attempt+1)));continue;}
      throw err;
    }
  }
}

async function callGemini(apiKey,prompt,retries=2){
  const url=`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  for(let attempt=0;attempt<=retries;attempt++){
    try{
      const ctrl=new AbortController();
      const to=setTimeout(()=>ctrl.abort(),30000);
      const res=await fetch(url,{
        method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,
        body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.2,maxOutputTokens:2048}}),
      });
      clearTimeout(to);
      if(res.status===400) throw new Error('Invalid Gemini API key or bad request');
      if(res.status===403) throw new Error('Gemini API key invalid or access denied');
      if(res.status===429) throw new Error('Gemini quota exceeded. Please wait.');
      if(res.status===503){if(attempt<retries){await new Promise(r=>setTimeout(r,1200*(attempt+1)));continue;}throw new Error('Gemini unavailable.');}
      const data=await res.json();
      if(data.error) throw new Error(data.error.message||'Gemini error');
      return data.candidates?.[0]?.content?.parts?.[0]?.text||'';
    }catch(err){
      if(err.name==='AbortError') throw new Error('Gemini timed out');
      if(attempt<retries&&!err.message.includes('key')&&!err.message.includes('quota')&&!err.message.includes('Invalid')){
        await new Promise(r=>setTimeout(r,800*(attempt+1)));continue;
      }
      throw err;
    }
  }
}

chrome.runtime.onInstalled.addListener(async({reason})=>{
  if(reason==='install'){
    await chrome.storage.local.set({'fp_env':'production','fp_settings':{theme:'light',fillDelay:80,highlightFields:true,saveManualEntries:true,fuzzyThreshold:45}});
  }
});

chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  handleMsg(msg,sender).then(sendResponse).catch(err=>sendResponse({success:false,error:err.message}));
  return true;
});

async function handleMsg(msg,sender){
  const {type,payload}=msg;
  switch(type){

    case 'GET_AUTH_STATE':{
      const r=await chrome.storage.local.get(['fp_access_token','fp_token_expiry','fp_user']);
      const t=r['fp_access_token'],exp=r['fp_token_expiry'];
      return {isLoggedIn:!!(t&&!(exp&&Date.now()>=exp)),user:r['fp_user']};
    }
    case 'SAVE_TOKENS':{
      const {accessToken,refreshToken,user}=payload;
      const dec=JSON.parse(atob(accessToken.split('.')[1]));
      const d={'fp_access_token':accessToken,'fp_token_expiry':dec.exp*1000,'fp_user':user};
      if(refreshToken) d['fp_refresh_token']=refreshToken;
      await chrome.storage.local.set(d); return {success:true};
    }
    case 'LOGOUT':{
      await chrome.storage.local.remove(['fp_access_token','fp_refresh_token','fp_user','fp_token_expiry']);
      return {success:true};
    }
    case 'API_REQUEST':{
      try{return {success:true,data:await apiCall(payload.endpoint,payload.method,payload.body)};}
      catch(err){return {success:false,error:err.message,status:err.status};}
    }

    case 'GEMINI_GENERATE':{
      const {apiKey,fields,profileKV,formContext,formType}=payload;
      if(!apiKey) return {success:false,error:'No Gemini API key. Add it in Settings tab.'};
      try{
        const profileText=profileKV&&profileKV.length
          ?profileKV.map(kv=>`${kv.key}: ${kv.value}`).join('\n')
          :'(empty — using context only)';

        const fieldList=fields.map((f,i)=>{
          let line=`${i}. "${f.label}"`;
          if(f.type&&f.type!=='text') line+=` [${f.type}]`;
          if(f.options&&f.options.length>0){
            line+=`\n   OPTIONS: ${f.options.map(o=>o.label||o.value).join(' | ')}`;
          }
          if(f.required) line+=' *required';
          return line;
        }).join('\n');

        const prompt=`You are FormPilot AI, an expert form-filling assistant.

## YOUR JOB
Fill every form field using the user's profile data AND context clues. Parse context text intelligently.

## USER PROFILE
${profileText}

## USER CONTEXT / INSTRUCTIONS
${formContext||'(none)'}

## IMPORTANT CONTEXT PARSING RULES
- If context contains "name, email, phone" style data → extract each value
- "dhruv, dhruvpatel4471@gmail.com, 9876543210" → Name=dhruv, Email=dhruvpatel4471@gmail.com, Phone=9876543210
- For fields like "Organization" check context for company/college/school names
- Use common sense: if context says "student at SVIT" → Organization=SVIT, College=SVIT
- For dietary fields with no info → pick "None" or first option
- For checkboxes with days/items → check what context says, else leave unchecked (empty)

## FORM FIELDS
${fieldList}

## FILLING RULES
- For [select] and [radio_group]: you MUST respond with EXACTLY one of the listed OPTIONS (copy exactly)
- For [checkbox_group]: respond with comma-separated values from OPTIONS list, or empty if none apply
- For [checkbox]: respond "yes" or "no"
- For text/email/phone/textarea: use profile or parse from context
- Leave "" only if genuinely impossible

## RESPONSE FORMAT
Return ONLY valid JSON, no markdown, no explanation:
{"answers":{"0":"value","1":"value","2":"Day 1,Day 3",...}}`;

        const text=await callGemini(apiKey,prompt);
        const jsonMatch=text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim().match(/\{[\s\S]*\}/);
        if(!jsonMatch) throw new Error('AI returned invalid format. Try again.');
        return {success:true,data:JSON.parse(jsonMatch[0])};
      }catch(err){return {success:false,error:err.message};}
    }

    case 'FORM_DETECTED':{
      const tabId=sender.tab?.id;
      if(tabId){
        chrome.action.setBadgeText({text:'!',tabId}).catch(()=>{});
        chrome.action.setBadgeBackgroundColor({color:'#6366f1',tabId}).catch(()=>{});
      }
      return {success:true};
    }
    case 'FORM_FILLED':{
      const tabId=sender.tab?.id;
      if(tabId){
        chrome.action.setBadgeText({text:'✓',tabId}).catch(()=>{});
        chrome.action.setBadgeBackgroundColor({color:'#22c55e',tabId}).catch(()=>{});
        setTimeout(()=>chrome.action.setBadgeText({text:'',tabId}).catch(()=>{}),3000);
      }
      return {success:true};
    }
    case 'SCROLL_TO_FIELD':{
      try{await chrome.tabs.sendMessage(payload.tabId,{type:'SCROLL_TO_FIELD',payload:{fieldIndex:payload.fieldIndex}});return {success:true};}
      catch(err){return {success:false,error:err.message};}
    }
    default: return {success:false,error:`Unknown: ${type}`};
  }
}

chrome.tabs.onUpdated.addListener((tabId,changeInfo)=>{
  if(changeInfo.status==='loading') chrome.action.setBadgeText({text:'',tabId}).catch(()=>{});
});
chrome.alarms.create('keepAlive',{periodInMinutes:0.4});
chrome.alarms.onAlarm.addListener(()=>{});
