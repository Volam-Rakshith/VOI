const OL={on:false,cfg:null,room:null,token:null,pub:null,me:null,err:'',shown:false,tm:null},ld=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(e){return null}},sv=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
OL.cfg=ld('voi-cfg');{const s=ld('voi-sess');if(s&&s.room&&s.token){OL.room=s.room;OL.token=s.token}}
function chk(u,k){u=String(u||'').trim().replace(/\/+$/,'');k=String(k||'').trim();if(!/^https:\/\/[^\s/]+/.test(u))throw new Error('URL must start with https://');if(k.length<20)throw new Error('Key looks too short');
 try{if(JSON.parse(atob(k.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='service_role')throw new Error('SERVICE_ROLE key rejected — never paste that. Use the anon public key.')}catch(e){if(/SERVICE_ROLE/.test(e.message))throw e}return{u,k}}
async function api(body){const r=await fetch(OL.cfg.u+'/functions/v1/game',{method:'POST',headers:{'Content-Type':'application/json',apikey:OL.cfg.k,Authorization:'Bearer '+OL.cfg.k},body:JSON.stringify(body)}),j=await r.json();if(!r.ok||j.error)throw new Error(j.error||'HTTP '+r.status);return j}
function apply(j){OL.room=j.code;OL.token=j.token;OL.pub=j.pub;OL.me=j.me;OL.err='';sv('voi-sess',{room:j.code,token:j.token})}
async function act(a,x){try{apply(await api({action:a,code:OL.room,token:OL.token,...x}))}catch(e){OL.err=e.message}oR()}
async function poll(){if(!OL.on||!OL.room||!OL.cfg)return;try{apply(await api({action:'state',code:OL.room,token:OL.token}))}catch(e){OL.err=/not in|not found|expired/i.test(e.message)?(leave(),e.message):'Reconnecting… ('+e.message+')'}oR()}
const v=id=>document.getElementById(id).value;
window.online=()=>{OL.on=true;clearInterval(OL.tm);OL.tm=setInterval(poll,1500);poll();oR()};
window.oBack=()=>{OL.on=false;clearInterval(OL.tm);R()};
window.saveCfg=()=>{try{OL.cfg=chk(v('cu'),v('ck'));sv('voi-cfg',OL.cfg);OL.err=''}catch(e){OL.err=e.message}oR()};
window.disc=()=>{OL.cfg=null;sv('voi-cfg',null);leave();oR()};
function leave(){OL.room=OL.token=OL.pub=OL.me=null;sv('voi-sess',null)}
window.oLeave=()=>{leave();oR()};
window.oCreate=async()=>{try{apply(await api({action:'create',name:v('on')}))}catch(e){OL.err=e.message}oR()};
window.oJoin=async()=>{try{apply(await api({action:'join',code:v('oc').trim().toUpperCase(),name:v('on')}))}catch(e){OL.err=e.message}oR()};
window.oAct=(a,x)=>act(a,x||{});window.oStart=()=>act('start',{imposters:+v('oi')});window.oGuess=()=>act('guess',{text:v('og')});window.oShow=()=>{OL.shown=!OL.shown;oR()};
function oR(){if(!OL.on)return;const p=OL.pub,m=OL.me,e=OL.err?h(OL.err,'r'):'',f=h(btn('← Back','oBack()','ghost')+(OL.cfg?btn('Disconnect backend','disc()','ghost danger'):''),'foot');let x='';
 if(!OL.cfg)x=h('<h2>Connect to Supabase</h2><p class=r>⚠ Paste ONLY the anon PUBLIC key. NEVER paste a service_role key.</p>')+'<input id=cu placeholder="https://xxxx.supabase.co"><input id=ck placeholder="anon public key">'+btn('Save','saveCfg()');
 else if(!OL.room){const q=new URLSearchParams(location.search).get('room')||'';x=h('<h2>Play online</h2>')+'<input id=on placeholder="Your name" maxlength=20>'+btn('Create room','oCreate()')+`<input id=oc placeholder="Room code" value="${q}" maxlength=6 style="text-transform:uppercase">`+btn('Join room','oJoin()','ghost')}
 else if(!p)x=h('Connecting…');
 else{const ph=p.phase,list=h(p.players.map(n=>n+(n===p.host?' ★':'')+(p.active&&!p.active.includes(n)?' ✖':'')).join(' · '));
  if(ph==='lobby')x=h(`<h2>Room <span class=r>${p.code}</span></h2><p>Invite: ${location.origin+location.pathname}?room=${p.code}</p>`)+list+(m.isHost?`<label>Imposters <input id=oi type=number min=1 value=1></label>`+btn('Start game','oStart()'):h('Waiting for host…'));
  else if(ph==='result')x=h(`<h1 class="${p.win==='imposters'?'r':''}">${p.win==='draw'?'DRAW':p.win.toUpperCase()+' WIN'}</h1><p>Word: <b>${p.reveal.word}</b> · Hint: <b>${p.reveal.hint||'none'}</b></p><p>${p.players.map(n=>n+': '+p.reveal.roles[n]).join('<br>')}</p>`)+(m.isHost?btn('Play again','oStart()')+'<label>Imposters <input id=oi type=number min=1 value=1></label>':'');
  else{const card=OL.shown?h(m.role==='innocent'?`Word:<b class=big>${m.word}</b>`:`<span class=r>IMPOSTER</span><p>Hint: <b>${m.hint||'none'}</b></p>`,'card')+btn('Hide','oShow()'):btn('Show my role (nobody looking?)','oShow()');
   const out=m.active?'':h('You are out — spectating.');
   if(ph==='discussion')x=h('<h2>Discussion</h2>'+(p.msg?`<p class=r>${p.msg}</p>`:''))+list+out+card+(m.isHost?btn('Start voting','oAct("advance")'):'');
   else if(ph==='voting'){const done=p.voted.includes(m.name);x=h('<h2>Vote</h2>')+out+(m.active&&!done?(p.restrict||p.active).filter(n=>n!==m.name).map(n=>btn(n,`oAct("vote",{target:"${n}"})`)).join('')+btn('Abstain','oAct("vote",{target:null})','ghost'):h(`Waiting… ${p.voted.length}/${p.active.length} voted`))}
   else if(ph==='guess')x=h(`<h2>${p.msg}</h2>`)+(m.canGuess?'<p>Last chance — guess the word:</p><input id=og autocomplete=off>'+btn('Guess','oGuess()'):h('Waiting for the caught imposter’s guess…'))}
 }
 $.innerHTML=h(e)+x+(OL.room?btn('Leave room','oLeave()','ghost'):'')+f}
window.oR=oR;
