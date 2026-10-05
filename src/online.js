const OL={on:false,cfg:null,room:null,token:null,pub:null,me:null,err:'',shown:false,tm:null};
OL.cfg=ld('voi-cfg');{const C=window.VOI_CONFIG||{};if(C.url&&C.key){try{OL.cfg=chk(C.url,C.key);OL.fixed=true}catch(e){OL.err=e.message}}const s=ld('voi-sess');if(s&&s.room&&s.token){OL.room=s.room;OL.token=s.token}}
function chk(u,k){u=String(u||'').trim().replace(/\/+$/,'');k=String(k||'').trim();if(!/^https:\/\/[^\s/]+/.test(u))throw new Error('URL must start with https://');if(k.length<20)throw new Error('Key looks too short');
 try{if(JSON.parse(atob(k.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='service_role')throw new Error('SERVICE_ROLE key rejected — never paste that. Use the anon public key.')}catch(e){if(/SERVICE_ROLE/.test(e.message))throw e}return{u,k}}
async function api(body){const r=await fetch(OL.cfg.u+'/functions/v1/game',{method:'POST',headers:{'Content-Type':'application/json',apikey:OL.cfg.k,Authorization:'Bearer '+OL.cfg.k},body:JSON.stringify(body)}),j=await r.json();if(!r.ok||j.error)throw new Error(j.error||'HTTP '+r.status);return j}
function apply(j){const k=JSON.stringify([j.pub,j.me]);OL.chg=k!==OL.k;OL.k=k;OL.room=j.code;OL.token=j.token;OL.pub=j.pub;OL.me=j.me;OL.err='';sv('voi-sess',{room:j.code,token:j.token})}
async function act(a,x){try{apply(await api({action:a,code:OL.room,token:OL.token,...x}))}catch(e){OL.err=e.message}oR()}
async function poll(){if(!OL.on||!OL.room||!OL.cfg)return;try{apply(await api({action:'state',code:OL.room,token:OL.token}))}catch(e){OL.err=/not in|not found|expired/i.test(e.message)?(leave(),e.message):'Reconnecting… ('+e.message+')'}if(OL.chg||OL.err!==OL.pe){OL.pe=OL.err;OL.chg=0;if(!/INPUT/.test(document.activeElement.tagName))oR()}}
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
function oR(){if(!OL.on)return;const p=OL.pub,m=OL.me,e=OL.err?h(OL.err,'banner r'):'',f=btn('← Back','oBack()','ghost')+(OL.cfg&&!OL.fixed?btn('Disconnect backend','disc()','ghost danger'):'');let x='',red=false;
 if(!OL.cfg)x=h('<h2>Connect backend</h2><p class=r>⚠ anon PUBLIC key only. NEVER a service_role key.</p><input id=cu placeholder="https://xxxx.supabase.co"><input id=ck placeholder="anon public key">'+btn('Save','saveCfg()')+'<p>Tip: put them in config.js once so nobody has to paste.</p>','panel');
 else if(!OL.room){const q=new URLSearchParams(location.search).get('room')||'';x=h('<h2>🌐 Play online</h2><input id=on placeholder="Your name" maxlength=20>'+btn('Create room','oCreate()')+`<input id=oc placeholder="ROOM CODE" value="${esc(q)}" maxlength=6 style="text-transform:uppercase;text-align:center;letter-spacing:.3em">`+btn('Join room','oJoin()','ghost'),'panel')}
 else if(!p)x=h('<h2>Connecting…</h2>','panel');
 else{const ph=p.phase,list=chips(p.players.map(n=>n+(n===p.host?' ★':'')),p.active&&p.active.map(n=>n+(n===p.host?' ★':''))),host=m.isHost,imp='<label class=sw>Imposters <input id=oi type=number min=1 value=1 style="width:90px"></label>';
  if(ph==='lobby')x=h(`<p>Room code</p><div class=code>${esc(p.code)}</div><p>Invite: ${esc(location.origin+location.pathname)}?room=${esc(p.code)}</p>${list}`+(host?imp+btn('▶ START GAME','oStart()'):'<p>Waiting for host…</p>'),'panel');
  else if(ph==='result'){const w=p.win;red=w==='imposters';x=h(`<div class="stamp ${red?'':'ok'}">${w==='draw'?'DRAW':w.toUpperCase()+' WIN'}</div><p>Word: <b class=g>${esc(p.reveal.word)}</b> · Hint: <b class=r>${esc(p.reveal.hint||'none')}</b></p>`+h(p.players.map(n=>`<span class=chip>${av(n)}${esc(n)} · ${p.reveal.roles[n]==='imposter'?'🔴':'🟢'}</span>`).join(''),'chips')+(host?imp+btn('↻ PLAY AGAIN','oStart()'):''),'panel');if(OL.lw!==p.win+p.code+p.cycle){OL.lw=p.win+p.code+p.cycle;setTimeout(()=>win_(!red),100)}}
  else{red=m.role==='imposter'&&OL.shown;const rc=OL.shown?card(m.role==='imposter',m.role==='innocent'?`<p>Secret word</p><b class="big g">${esc(m.word)}</b>`:`<span class=stamp>IMPOSTER</span><p>Hint: <b>${esc(m.hint||'none')}</b></p>`)+btn('Hide','oShow()','ghost'):btn('👁 SHOW MY ROLE (nobody looking?)','oShow()'),dead=m.active?'':'<p class=r>You are out — spectating.</p>';
   if(ph==='discussion')x=h('<h2>🗣 Discussion</h2>'+(p.msg?`<div class="banner r">${esc(p.msg)}</div>`:'')+list+dead+rc+(host?btn('🗳 START VOTING','oAct("advance")'):''),'panel');
   else if(ph==='voting'){const done=p.voted.includes(m.name);x=h('<h2>🗳 Vote</h2>'+dead+(m.active&&!done?tiles((p.restrict||p.active).filter(n=>n!==m.name),'oPick')+btn('Abstain','oAct("vote",{target:null})','ghost'):`<p>Waiting… ${p.voted.length}/${p.active.length} voted</p>`),'panel')}
   else if(ph==='guess'){red=true;x=h(`<h2>${esc(p.msg)}</h2>`+(m.canGuess?'<p>Last chance — guess the word:</p><input id=og autocomplete=off>'+btn('GUESS','oGuess()'):'<p>Waiting for the caught imposter…</p>'),'panel')}}
 }
 view(e+x+(OL.room?btn('Leave room','oLeave()','ghost'):'')+f,red);if(p&&OL.lp!==p.phase+p.cycle){OL.lp=p.phase+p.cycle;sfx(480,.2);buzz()}}
window.oPick=(i,el)=>{el.classList.add('picked');sfx(520);buzz();setTimeout(()=>act('vote',{target:CAND[i]}),340)};
window.oR=oR;
window.OL=OL;
