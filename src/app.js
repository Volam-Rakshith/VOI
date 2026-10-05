const $=document.getElementById('app'),K='voi-save';let S=JSON.parse(localStorage.getItem(K)||'null'),U={};
const save=()=>{try{localStorage.setItem(K,JSON.stringify(S))}catch(e){}},h=(t,c='')=>`<div class="${c}">${t}</div>`,btn=(l,f,c='')=>`<button class="${c}" onclick="${f}">${l}</button>`;
const go=p=>{S.ph=p;save();R()};
window.go=go;
window.start=()=>{try{const names=document.getElementById('nm').value.split(/[\n,]/).map(x=>x.trim()).filter(Boolean);if(new Set(names).size!==names.length)throw new Error('Names must be unique');
 const o={imposters:+document.getElementById('ni').value,guessing:document.getElementById('gs').checked,hints:document.getElementById('hn').checked};
 const r=VOI.newRound(names,o,[]);S={...r,o,ph:'reveal',i:0,votes:{},vi:0,shown:false,msg:''};save();R()}catch(e){alert(e.message)}};
window.next=()=>{S.shown=false;S.i++;S.i>=S.players.length?go('talk'):(save(),R())};
window.show=()=>{S.shown=true;R()};
window.vote=t=>{S.votes[S.active[S.vi]]=t;S.vi++;S.vi>=S.active.length?finish():(save(),R())};
function finish(){const r=VOI.resolveVotes(S.active,S.votes,S.restrict);S.cycle++;S.restrict=null;S.votes={};S.vi=0;
 if(r.tied.length>1&&!S.revoted){S.revoted=true;S.restrict=r.tied;S.msg='Tie: '+r.tied.join(', ')+' ('+JSON.stringify(r.counts)+'). One revote.';return go('talk')}
 S.revoted=false;if(!r.out){S.msg='No elimination.';return S.cycle>=VOI.MAX_CYCLES?end('draw'):go('talk')}
 S.last=r.out;S.msg=r.out+' was a '+S.roles[r.out].toUpperCase()+'.';const n=VOI.eliminate(S,r.out);n==='continue'?(S.cycle>=VOI.MAX_CYCLES?end('draw'):go('out')):n==='guess'?go('guess'):end(n)}
function end(w){S.win=w;go('result')}
window.guessIt=()=>{const r=VOI.guess(S,document.getElementById('gi').value);r==='continue'?go('out'):end(r)};
window.skipG=()=>{const r=VOI.guess(S,'');r==='continue'?go('out'):end(r)};
window.again=()=>{const r=VOI.newRound(S.players,S.o,[]);S={...r,o:S.o,ph:'reveal',i:0,votes:{},vi:0,shown:false,msg:''};save();R()};
window.quit=()=>{S=null;localStorage.removeItem(K);R()};
window.mot=()=>{document.body.classList.toggle('calm');U.calm=!U.calm};
function R(){let x='';
 if(!S)x=h('<h1>VOTE OUT <span class=r>IMPOSTER</span></h1><p>One-device pass-and-play · fully offline</p>')+`<textarea id=nm rows=6 placeholder="One name per line (3–20)">Asha\nRavi\nMeena\nKiran</textarea><label>Imposters <input id=ni type=number min=1 value=1></label><label><input id=gs type=checkbox checked> Imposter last-chance guess</label><label><input id=hn type=checkbox checked> Imposters get a hint</label>`+btn('Start',"start()")+btn('Play online (multiple devices)','online()','ghost');
 else if(S.resume){x=h('<h2>Game in progress</h2><p>Screen hidden for privacy.</p>')+btn('Resume',"S.resume=0;R()")+btn('Abandon',"quit()",'danger')}
 else if(S.ph==='reveal'){const p=S.players[S.i];x=h(`<h2>${p}</h2><p>Make sure nobody else is looking.</p>`)+(S.shown?h(S.roles[p]==='innocent'?`Your word:<b class=big>${S.word}</b>`:`<span class=r>IMPOSTER</span><p>Hint: <b>${S.hint||'none'}</b></p>`,'card')+btn('Hide & pass on','next()'):btn('Tap to reveal','show()'))}
 else if(S.ph==='talk'){x=h('<h2>Discussion</h2><p>Describe the word without saying it.</p>'+(S.msg?`<p class=r>${S.msg}</p>`:'')+h('Active: '+S.active.join(', ')))+btn('Start voting','go("vote")')}
 else if(S.ph==='vote'){const p=S.active[S.vi],c=(S.restrict||S.active).filter(q=>q!==p);x=h(`<h2>${p}, vote privately</h2><p>Make sure nobody is looking.</p>`)+c.map(q=>btn(q,`vote('${q}')`)).join('')+btn('Abstain','vote(null)','ghost')}
 else if(S.ph==='out')x=h('<h2>'+S.msg+'</h2>')+btn('Next discussion','go("talk")');
 else if(S.ph==='guess')x=h(`<h2>${S.last} was an imposter</h2><p>Last chance: guess the word (only ${S.last} should look).</p>`)+'<input id=gi autocomplete=off>'+btn('Guess','guessIt()')+btn('Decline','skipG()','ghost');
 else if(S.ph==='result'){const w=S.win;x=h(`<h1 class="${w==='imposters'?'r':''}">${w==='draw'?'DRAW':w.toUpperCase()+' WIN'}</h1><p>Word: <b>${S.word}</b> · Hint: <b>${S.hint||'none'}</b></p><p>${S.players.map(p=>p+': '+S.roles[p]).join('<br>')}</p>`)+btn('Play again (same roster)','again()')+btn('New game','quit()','ghost')}
 $.innerHTML=x+h(btn('Reduced motion: '+(U.calm?'on':'off'),'mot()','ghost')+(S?btn('Abandon','quit()','ghost danger'):''),'foot')+h('Privacy note: this hides cards from shoulder-surfers, not from someone inspecting the device.<br>VR DEVELOPMENTS','note')}
if(S&&S.ph)S.resume=1;
if(matchMedia('(prefers-reduced-motion:reduce)').matches){U.calm=1;document.body.classList.add('calm')}
R();
