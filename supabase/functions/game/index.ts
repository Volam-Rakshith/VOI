import R from './room.mjs';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'};
const out=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 try{const b=await req.json();let room:any,token=b.token;
  if(b.action==='create'){const c=R.create(b.name);room=c.room;token=c.token}
  else{const{data}=await sb.from('rooms').select('data').eq('code',String(b.code||'').toUpperCase()).maybeSingle();
   if(!data)return out({error:'Room not found'},404);room=data.data;
   if(Date.now()-room.t>4*3600e3||Date.now()-room.created>24*3600e3){await sb.from('rooms').delete().eq('code',room.code);return out({error:'Room expired'},410)}
   if(b.action==='join')token=R.join(room,b.name);
   else if(b.action==='start')R.start(room,token,+b.imposters);
   else if(b.action==='advance')R.advance(room,token);
   else if(b.action==='vote')R.vote(room,token,b.target??null);
   else if(b.action==='guess')R.guess(room,token,b.text);
   else if(b.action!=='state')return out({error:'Unknown action'},400)}
  const me=R.me(room,token);
  if(b.action!=='state'){room.t=Date.now();await sb.from('rooms').upsert({code:room.code,data:room,updated_at:new Date().toISOString()})}
  return out({token,code:room.code,pub:R.pub(room),me})
 }catch(e){return out({error:String((e as Error).message||e)},400)}});
