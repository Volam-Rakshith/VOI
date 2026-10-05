(function(g){
const V=g.VOI||require('./engine.js'),AL='ACDEFGHJKMNPQRTUVWXY34679';
const rid=n=>{let s='';const a=new Uint8Array(n);(g.crypto||require('crypto').webcrypto).getRandomValues(a);for(const b of a)s+=AL[b%AL.length];return s};
const who=(r,t)=>{const p=r.players.find(x=>x.token===t);if(!p)throw new Error('Not in this room');return p};
const host=(r,t)=>{if(who(r,t).token!==r.host)throw new Error('Host only')};
function create(name){name=String(name||'').trim();if(!name)throw new Error('Name required');const t=rid(24);return{token:t,room:{code:rid(6),host:t,players:[{name,token:t}],phase:'lobby',used:[],round:null,votes:{},restrict:null,revoted:false,msg:'',win:null,last:null,t:Date.now(),created:Date.now()}}}
function join(r,name){name=String(name||'').trim();if(!name||name.length>20)throw new Error('Name must be 1–20 chars');if(r.phase!=='lobby')throw new Error('Game already started');if(r.players.length>=20)throw new Error('Room full');if(r.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))throw new Error('Name taken');const t=rid(24);r.players.push({name,token:t});return t}
function start(r,t,imposters){host(r,t);if(r.phase!=='lobby'&&r.phase!=='result')throw new Error('Round in progress');const names=r.players.map(p=>p.name);r.round=V.newRound(names,{imposters},r.used);r.used.push(r.round.word);Object.assign(r,{phase:'discussion',votes:{},restrict:null,revoted:false,msg:'',win:null,last:null})}
function advance(r,t){host(r,t);if(r.phase!=='discussion')throw new Error('Not in discussion');r.phase='voting'}
function end(r,w){r.win=w;r.phase='result'}
const after=r=>r.round.cycle>=V.MAX_CYCLES?end(r,'draw'):void(r.phase='discussion');
function resolve(r){const s=r.round,x=V.resolveVotes(s.active,r.votes,r.restrict);s.cycle++;r.restrict=null;r.votes={};
 if(x.tied.length>1&&!r.revoted){r.revoted=true;r.restrict=x.tied;r.msg='Tie: '+x.tied.map(n=>n+' '+x.counts[n]).join(', ')+'. One revote.';r.phase='discussion';return}
 r.revoted=false;if(!x.out){r.msg='No elimination.';return after(r)}
 r.last=x.out;r.msg=x.out+' was a '+s.roles[x.out].toUpperCase()+'.';const n=V.eliminate(s,x.out);
 if(n==='guess')r.phase='guess';else if(n==='continue')after(r);else end(r,n)}
function vote(r,t,target){const p=who(r,t),s=r.round;if(r.phase!=='voting')throw new Error('Voting is closed');if(!s.active.includes(p.name))throw new Error('Eliminated players cannot vote');if(p.name in r.votes)throw new Error('Already voted');
 if(target!=null&&(target===p.name||!(r.restrict||s.active).includes(target)))throw new Error('Invalid target');r.votes[p.name]=target??null;if(s.active.every(a=>a in r.votes))resolve(r)}
function guess(r,t,text){const p=who(r,t);if(r.phase!=='guess'||p.name!==r.last)throw new Error('Not your guess');const x=V.guess(r.round,text);x==='continue'?after(r):end(r,x)}
function pub(r){const s=r.round,o={code:r.code,phase:r.phase,host:r.players.find(p=>p.token===r.host).name,players:r.players.map(p=>p.name),msg:r.msg,win:r.win};
 if(s){o.active=s.active;o.cycle=s.cycle;o.restrict=r.restrict;o.voted=Object.keys(r.votes);if(r.phase==='result')o.reveal={word:s.word,hint:s.hint,roles:s.roles}}return o}
function me(r,t){const p=who(r,t),s=r.round,o={name:p.name,isHost:t===r.host};if(s&&r.phase!=='lobby'){o.role=s.roles[p.name];if(o.role==='innocent')o.word=s.word;else o.hint=s.hint;o.active=s.active.includes(p.name);o.canGuess=r.phase==='guess'&&r.last===p.name}return o}
g.VOIROOM={create,join,start,advance,vote,guess,pub,me,AL};if(typeof module!=='undefined')module.exports=g.VOIROOM;
})(typeof globalThis!=='undefined'?globalThis:this);
