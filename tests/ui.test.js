// Drives the real index.html in jsdom through a full one-device game. Skips if jsdom is not installed.
let JSDOM;try{({JSDOM}=require('jsdom'))}catch(e){console.log('skip ui test (npm i --no-save jsdom)');process.exit(0)}
const a=require('assert'),fs=require('fs');let n=0;const A=(c,m)=>{a(c,m);n++};
const d=new JSDOM(fs.readFileSync(__dirname+'/../index.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/'});const w=d.window,D=w.document;
w.alert=m=>{throw new Error('alert: '+m)};
const txt=()=>D.body.textContent,click=s=>{const b=[...D.querySelectorAll('button')].find(x=>x.textContent.includes(s));A(b,'button missing: '+s);b.click()},tick=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
A(txt().includes('VR DEVELOPMENTS'),'branding');
D.getElementById('nm').value='A\nB\nC\nD';D.getElementById('ni').value='1';click('PLAY ON THIS PHONE');
for(let i=0;i<4;i++){A(txt().includes('Player '+(i+1)+'/4'));click('TAP TO REVEAL');A(D.querySelector('.card'),'card shown');click('Hide & pass')}
A(txt().includes('Discussion'));click('START VOTING');
const roles=w.eval('S').roles,imp=Object.keys(roles).find(k=>roles[k]==='imposter');
for(let i=0;i<4;i++){const voter=w.eval('S').active[w.eval('S').vi],tiles=[...D.querySelectorAll('.tile')];A(tiles.length===3,'3 candidates');const t=tiles.find(x=>x.textContent.trim().slice(1)===(voter===imp?(imp==='A'?'B':'A'):imp));t.click();await tick(400)}
A(w.eval('S').ph==='out'&&w.eval('S').last===imp,'imposter eliminated by vote, phase='+w.eval('S').ph);A(txt().includes('IMPOSTER'));
click('Continue');A(w.eval('S').ph==='guess');D.getElementById('gi').value='nope';click('GUESS');A(w.eval('S').ph==='result'&&w.eval('S').win==='innocents','innocents win');
click('PLAY AGAIN');A(w.eval('S').ph==='reveal'&&w.eval('S').i===0,'play again');
console.log('ui: '+n+' assertions passed');process.exit(0)})().catch(e=>{console.error('UI TEST FAILED:',e.message);process.exit(1)});
