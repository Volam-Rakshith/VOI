(function(g){
const rng=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const WORDS={
Food:{pizza:'cheese',sushi:'rice',burger:'bun',mango:'summer',biryani:'spice',noodles:'chopsticks',chocolate:'sweet',popcorn:'movie'},
Animals:{elephant:'trunk',penguin:'ice',tiger:'stripes',dolphin:'ocean',camel:'desert',owl:'night',monkey:'banana',eagle:'sky'},
Transport:{bicycle:'pedal',train:'platform',airplane:'cloud',rickshaw:'city',submarine:'deep',scooter:'helmet',ship:'harbour',metro:'underground'},
Technology:{laptop:'keyboard',robot:'metal',camera:'photo',drone:'buzz',router:'wifi',headphones:'music',satellite:'orbit',charger:'battery'},
Sports:{cricket:'bat',football:'goal',badminton:'shuttle',chess:'strategy',swimming:'pool',hockey:'stick',kabaddi:'raid',tennis:'court'},
Places:{beach:'sand',library:'quiet',airport:'queue',temple:'bell',hospital:'white',market:'bargain',stadium:'crowd',museum:'history'},
Festivals:{diwali:'lights',holi:'colours',christmas:'gifts',eid:'feast',pongal:'harvest',birthday:'cake',wedding:'garland',halloween:'costume'},
Household:{pillow:'sleep',mirror:'reflection',broom:'dust',curtain:'window',umbrella:'rain',candle:'wax',blanket:'winter',clock:'tick'},
'Famous Characters':{doraemon:'gadget',sherlock:'detective',batman:'cape','chhota bheem':'laddu',pikachu:'electric',mickey:'cartoon'},
'Our Crew':{rakshith:'developer',sunil:'friend',rvbanr:'gang','vr developments':'startup',volam:'brand',sits:'college',flutter:'mobile',firebase:'database',groq:'speed',portfolio:'showcase',github:'repository'}};
const ok=(w,h)=>{w=w.toLowerCase();h=h.toLowerCase();return !!h&&h!==w&&!w.includes(h)&&!h.includes(w)&&w.slice(0,3)!==h.slice(0,3)&&!w.split(/\W+/).some(t=>h.split(/\W+/).includes(t))};
const pool=(cats)=>{const o=[];for(const c of cats||Object.keys(WORDS))for(const w in WORDS[c])if(ok(w,WORDS[c][w]))o.push({word:w,hint:WORDS[c][w],cat:c});return o};
function validate(n,players){if(!Number.isInteger(n)||n<1)throw new Error('Need at least 1 imposter');if(n>=players)throw new Error('Imposters must be fewer than players');if(players<3||players>20)throw new Error('3–20 players required');return n}
function newRound(players,o,used){const seed=o.seed??(Math.random()*2**31)|0,r=rng(seed);validate(o.imposters,players.length);
 let p=pool(o.cats).filter(x=>!(used||[]).includes(x.word));let reset=false;if(!p.length){if(!pool(o.cats).length)throw new Error('Empty word pool');p=pool(o.cats);reset=true}
 const w=p[Math.floor(r()*p.length)],idx=players.map((_,i)=>i).sort(()=>r()-.5).slice(0,o.imposters);
 const roles={};players.forEach((n,i)=>roles[n]=idx.includes(i)?'imposter':'innocent');
 return{players:[...players],roles,word:w.word,hint:o.hints===false?null:w.hint,cat:w.cat,active:[...players],cycle:0,guessing:o.guessing!==false,reset}}
function resolveVotes(active,votes,restrict){const c={};active.forEach(a=>{const t=votes[a];if(t&&active.includes(t)&&(!restrict||restrict.includes(t)))c[t]=(c[t]||0)+1});
 const m=Math.max(0,...Object.values(c));if(!m)return{out:null,tied:[],counts:c};const l=Object.keys(c).filter(k=>c[k]===m);return l.length>1?{out:null,tied:l,counts:c}:{out:l[0],tied:[],counts:c}}
const cnt=s=>({imp:s.active.filter(p=>s.roles[p]==='imposter').length,inn:s.active.filter(p=>s.roles[p]==='innocent').length});
function eliminate(s,name){s.active=s.active.filter(p=>p!==name);const{imp,inn}=cnt(s);
 if(imp>=inn&&imp>0)return'imposters';
 if(s.roles[name]==='imposter'&&s.guessing)return'guess';
 return imp===0?'innocents':'continue'}
function guess(s,text){if(String(text).trim().toLowerCase()===s.word)return'imposters';const{imp}=cnt(s);return imp===0?'innocents':'continue'}
g.VOI={WORDS,ok,pool,validate,newRound,resolveVotes,eliminate,guess,cnt,MAX_CYCLES:5};
if(typeof module!=='undefined')module.exports=g.VOI;
})(typeof globalThis!=='undefined'?globalThis:this);
