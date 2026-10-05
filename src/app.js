const $=document.getElementById('app'),K='voi-save';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),ld=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(e){return null}},sv=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
let S=ld(K),U={calm:!!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches),mute:false,cats:[]};
const h=(t,c='')=>`<div class="${c}">${t}</div>`,btn=(l,f,c='')=>`<button class="${c}" onclick="${f.replace(/"/g,'&quot;')}">${l}</button>`,hue=n=>[...String(n)].reduce((a,c)=>a+c.charCodeAt(0),0)*47%360,
av=n=>`<span class=av style="--h:${hue(n)}">${esc(String(n)[0]||'?').toUpperCase()}</span>`,chips=(ns,act)=>h(ns.map(n=>`<span class="chip ${act&&!act.includes(n)?'dead':''}">${av(n)}${esc(n)}</span>`).join(''),'chips'),
tiles=(c,fn)=>{window.CAND=c;return h(c.map((n,i)=>`<button class=tile style="--h:${hue(n)}" onclick="${fn}(${i},this)">${av(n)}<b>${esc(n)}</b></button>`).join(''),'tiles')};
const card=(imp,body)=>h(h(body,'in'),'card'+(imp?' imp':''));
let AC;const sfx=(f,d=.15,t='sine',v=.07)=>{if(U.mute)return;try{AC=AC||new(window.AudioContext||window.webkitAudioContext)();const o=AC.createOscillator(),g=AC.createGain();o.type=t;o.frequency.value=f;g.gain.value=v;g.gain.exponentialRampToValueAtTime(.0001,AC.currentTime+d);o.connect(g);g.connect(AC.destination);o.start();o.stop(AC.currentTime+d)}catch(e){}},
buzz=()=>{try{navigator.vibrate&&navigator.vibrate(60)}catch(e){}},win_=ok=>{[0,1,2].forEach(i=>setTimeout(()=>sfx(ok?[523,659,784][i]:[300,220,150][i],.25,ok?'triangle':'sawtooth'),i*160));burst(ok?null:'#ff2d4a')};
const cv=document.getElementById('bg'),cx=cv.getContext&&cv.getContext('2d');let P=[],B=[];const sz=()=>{cv.width=innerWidth;cv.height=innerHeight};sz();addEventListener('resize',sz);
for(let i=0;i<55;i++)P.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,r:Math.random()*2+1,v:Math.random()*.6+.2});
window.burst=c=>{if(U.calm)return;for(let i=0;i<100;i++)B.push({x:innerWidth/2,y:innerHeight/3,vx:(Math.random()-.5)*14,vy:Math.random()*-12,l:90,c:c||`hsl(${Math.random()*360},90%,60%)`})};
(function loop(){if(cx){cx.clearRect(0,0,cv.width,cv.height);const red=document.body.classList.contains('red');if(!U.calm)P.forEach(p=>{p.y-=p.v;if(p.y<0)p.y=cv.height;cx.fillStyle=red?'#ff2d4a66':'#4ade8066';cx.beginPath();cx.arc(p.x,p.y,p.r,0,7);cx.fill()});B=B.filter(b=>b.l-->0);B.forEach(b=>{b.x+=b.vx;b.y+=b.vy;b.vy+=.4;cx.fillStyle=b.c;cx.fillRect(b.x,b.y,6,9)})}requestAnimationFrame(loop)})();
const VIS='<svg viewBox="0 0 32 20" width=34 height=22 fill=none stroke=currentColor stroke-width=2><rect x=1 y=2 width=30 height=16 rx=7 /><path d="M9 17c3-5 11-5 14 0"/></svg>';
function view(x,red){document.body.classList.toggle('red',!!red);document.body.classList.toggle('calm',U.calm);
 $.innerHTML=`<div class=brand>${VIS}<span>VR DEVELOPMENTS</span></div>`+x+h(btn('🔊 Sound: '+(U.mute?'off':'on'),'tg("mute")','ghost')+btn('✨ Motion: '+(U.calm?'reduced':'full'),'tg("calm")','ghost'),'row')+h('<b>VR DEVELOPMENTS</b><br>Volam Rakshith Developments','foot')+h('Privacy: hides cards from shoulder-surfers, not from someone inspecting the device.','note')}
window.tg=k=>{U[k]=!U[k];window.OL&&OL.on?oR():R()};window.tc=c=>{const i=U.cats.indexOf(c);i<0?U.cats.push(c):U.cats.splice(i,1);R()};
const go=p=>{S.ph=p;sv(K,S);R()};window.go=go;
window.start=()=>{try{const names=document.getElementById('nm').value.split(/[\n,]/).map(x=>x.trim()).filter(Boolean);if(new Set(names.map(n=>n.toLowerCase())).size!==names.length)throw new Error('Names must be unique');
 const o={imposters:+document.getElementById('ni').value,guessing:document.getElementById('gs').checked,hints:document.getElementById('hn').checked,cats:U.cats.length?[...U.cats]:undefined};
 S={...VOI.newRound(names,o,[]),o,ph:'reveal',i:0,votes:{},vi:0,shown:false,msg:'',revoted:false,restrict:null};sfx(440);sv(K,S);R()}catch(e){alert(e.message)}};
window.show=()=>{S.shown=true;sfx(S.roles[S.players[S.i]]==='imposter'?120:660,.3,'square');buzz();R()};
window.next=()=>{S.shown=false;S.i++;S.i>=S.players.length?go('talk'):(sv(K,S),R())};
window.pick=(i,el)=>{el.classList.add('picked');sfx(520);buzz();setTimeout(()=>vote(CAND[i]),340)};
window.vote=t=>{S.votes[S.active[S.vi]]=t;S.vi++;S.vi>=S.active.length?finish():(sv(K,S),R())};
function finish(){const r=VOI.resolveVotes(S.active,S.votes,S.restrict);S.cycle++;S.restrict=null;S.votes={};S.vi=0;
 if(r.tied.length>1&&!S.revoted){S.revoted=true;S.restrict=r.tied;S.msg='Tie: '+r.tied.map(n=>n+' ×'+r.counts[n]).join(', ')+'. One revote!';return go('talk')}
 S.revoted=false;if(!r.out){S.msg='Nobody eliminated.';return S.cycle>=VOI.MAX_CYCLES?end('draw'):go('talk')}
 S.last=r.out;S.msg=r.out;const n=VOI.eliminate(S,r.out);S.after=n==='guess'?'guess':0;S.stamp=S.roles[r.out];sfx(S.stamp==='imposter'?700:150,.4,'sawtooth');
 n==='continue'?(S.cycle>=VOI.MAX_CYCLES?end('draw'):go('out')):n==='guess'?go('out'):end(n)}
const end=w=>{S.win=w;go('result')};
window.guessIt=()=>{const r=VOI.guess(S,document.getElementById('gi').value);r==='continue'?(S.msg='Wrong guess!',S.stamp=null,go('talk')):end(r)};
window.skipG=()=>{const r=VOI.guess(S,'');r==='continue'?(S.msg='Imposter declined to guess.',go('talk')):end(r)};
window.again=()=>{S={...VOI.newRound(S.players,S.o,[]),o:S.o,ph:'reveal',i:0,votes:{},vi:0,shown:false,msg:'',revoted:false,restrict:null};sv(K,S);R()};
window.quit=()=>{S=null;sv(K,null);R()};window.cont=()=>{S.resume=0;R()};
function R(){if(window.OL&&OL.on)return oR();let x='',red=false;
 if(!S){const cats=Object.keys(VOI.WORDS);x=h('<div class=logo>VOTE OUT</div><div class="logo imp">IMPOSTER</div><p>Describe the word. Spot the fake. Vote them out.</p>')+h(`<textarea id=nm rows=5 placeholder="One name per line (3–20)">Rakshith\nSunil\nAsha\nRavi</textarea><label class=sw>Imposters <input id=ni type=number min=1 value=1 style="width:90px"></label><label class=sw><input id=gs type=checkbox checked> Imposter last-chance guess</label><label class=sw><input id=hn type=checkbox checked> Imposters get a hint</label><p>Categories ${U.cats.length?'':'(all)'}</p>${h(cats.map(c=>`<span class="chip ${U.cats.includes(c)?'sel':''}" onclick="tc('${c}')">${c}</span>`).join(''),'chips')}`+btn('▶ PLAY ON THIS PHONE','start()')+btn('🌐 PLAY ONLINE (multi-device)','online()','ghost'),'panel')}
 else if(S.resume)x=h('<h2>Game in progress</h2><p>Screen hidden for privacy.</p>'+btn('Resume','cont()')+btn('Abandon','quit()','danger'),'panel');
 else if(S.ph==='reveal'){const p=S.players[S.i],im=S.roles[p]==='imposter';red=S.shown&&im;x=h(`<p>Player ${S.i+1}/${S.players.length}</p><h2>${av(p)} ${esc(p)}</h2><p class=r>Make sure nobody else is looking!</p>`+(S.shown?card(im,im?`<span class="stamp">IMPOSTER</span><p>Your hint: <b class=big style="font-size:1.6rem">${esc(S.hint||'none')}</b></p>`:`<p>Secret word</p><b class="big g">${esc(S.word)}</b>`)+btn('Hide & pass the phone ➜','next()'):btn('👁 TAP TO REVEAL MY ROLE','show()')),'panel')}
 else if(S.ph==='talk')x=h('<h2>🗣 Discussion</h2><p>Describe the word without saying it.</p>'+(S.msg?`<div class="banner r">${esc(S.msg)}</div>`:'')+chips(S.active)+(S.restrict?`<p>Revote — only: ${S.restrict.map(esc).join(', ')}</p>`:'')+btn('🗳 START VOTING','go("vote")'),'panel');
 else if(S.ph==='vote'){const p=S.active[S.vi],c=(S.restrict||S.active).filter(q=>q!==p);x=h(`<p>${S.vi+1}/${S.active.length}</p><h2>${av(p)} ${esc(p)}</h2><p class=r>Vote privately — nobody look!</p>`+tiles(c,'pick')+btn('Abstain','vote(null)','ghost'),'panel')}
 else if(S.ph==='out'){const imp=S.stamp==='imposter';red=imp;x=h(`<p>Eliminated</p><h2>${av(S.last)} ${esc(S.last)}</h2><div class="stamp ${imp?'':'ok'}">${imp?'IMPOSTER':'INNOCENT'}</div>`+(S.after==='guess'?'<p>One last chance...</p>'+btn('Continue ➜','S.after=0;go("guess")'):btn('Next discussion ➜','go("talk")')),'panel')}
 else if(S.ph==='guess'){red=true;x=h(`<h2>${esc(S.last)}: last chance!</h2><p>Only ${esc(S.last)} should look. Guess the secret word:</p><input id=gi autocomplete=off placeholder="the word...">`+btn('GUESS','guessIt()')+btn('Decline','skipG()','ghost'),'panel')}
 else if(S.ph==='result'){const w=S.win;red=w==='imposters';x=h(`<div class="stamp ${red?'':'ok'}">${w==='draw'?'DRAW':w.toUpperCase()+' WIN'}</div><p>Word: <b class=g>${esc(S.word)}</b> · Hint: <b class=r>${esc(S.hint||'none')}</b></p>`+h(S.players.map(p=>`<span class=chip>${av(p)}${esc(p)} · ${S.roles[p]==='imposter'?'🔴':'🟢'}</span>`).join(''),'chips')+btn('↻ PLAY AGAIN (same roster)','again()')+btn('New game','quit()','ghost'),'panel');setTimeout(()=>win_(!red),100)}
 view(x,red);if(S&&S.ph==='reveal'&&S.shown&&S.roles[S.players[S.i]]==='imposter'&&!U.calm)document.body.classList.add('red')}
if(S&&S.ph)S.resume=1;R();
