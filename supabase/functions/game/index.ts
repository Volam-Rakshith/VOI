import R from './room.mjs';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'};
const out=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:cors});
async function run(b:any){
 if(b.action==='create'){for(let i=0;i<5;i++){const c=R.create(b.name);const{error}=await sb.from('rooms').insert({code:c.room.code,data:c.room,ver:0});if(!error)return{token:c.token,code:c.room.code,pub:R.pub(c.room),me:R.me(c.room,c.token)}}throw new Error('Could not create room')}
 const code=String(b.code||'').toUpperCase();
 for(let i=0;i<8;i++){ // optimistic concurrency: simultaneous votes retry instead of overwriting each other
  const{data}=await sb.from('rooms').select('data,ver').eq('code',code).maybeSingle();if(!data)throw new Error('Room not found');
  const room=data.data;let token=b.token;
  if(Date.now()-room.t>4*3600e3||Date.now()-room.created>24*3600e3){await sb.from('rooms').delete().eq('code',code);throw new Error('Room expired')}
  if(b.action==='join')token=R.join(room,b.name);else if(b.action==='start')R.start(room,token,+b.imposters);else if(b.action==='advance')R.advance(room,token);
  else if(b.action==='vote')R.vote(room,token,b.target??null);else if(b.action==='guess')R.guess(room,token,b.text);else if(b.action!=='state')throw new Error('Unknown action');
  const res={token,code,pub:R.pub(room),me:R.me(room,token)};if(b.action==='state')return res;
  room.t=Date.now();const{data:u}=await sb.from('rooms').update({data:room,ver:data.ver+1,updated_at:new Date().toISOString()}).eq('code',code).eq('ver',data.ver).select('code');
  if(u&&u.length)return res;await new Promise(r=>setTimeout(r,30+Math.random()*90))}
 throw new Error('Server busy, tap again')}
Deno.serve(async(req:Request)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 try{return out(await run(await req.json()))}catch(e){return out({error:String((e as Error).message||e)},400)}});
