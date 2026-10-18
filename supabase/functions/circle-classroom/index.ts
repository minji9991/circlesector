import { createClient } from 'npm:@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const enc=new TextEncoder();
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const secret=Deno.env.get('CLASSROOM_TOKEN_SECRET')!;
const teacherPassword=Deno.env.get('TEACHER_PASSWORD')!;
const b64=(x:Uint8Array)=>btoa(String.fromCharCode(...x)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
async function sign(payload:any){const body=b64(enc.encode(JSON.stringify(payload)));const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return body+'.'+b64(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(body))));}
async function verify(token:string){try{const [body,sig]=token.split('.');const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);const bytes=Uint8Array.from(atob(sig.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(sig.length/4)*4,'=')),x=>x.charCodeAt(0));if(!await crypto.subtle.verify('HMAC',key,bytes,enc.encode(body)))return null;const p=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(body.length/4)*4,'=')),x=>x.charCodeAt(0))));return p.exp>Date.now()?p:null;}catch{return null;}}
const fail=(msg:string,status=400)=>new Response(JSON.stringify({error:msg}),{status,headers:{...cors,'Content-Type':'application/json'}});
const ok=(data:any)=>new Response(JSON.stringify(data),{headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response(null,{headers:cors});try{
const b=await req.json();const action=String(b.action||'');
if(action==='student_login'){
 const cls=Number(b.class_no),no=Number(b.student_no),name=String(b.name||'').trim().slice(0,30);
 if(!Number.isInteger(cls)||cls<1||cls>20||!Number.isInteger(no)||no<1||no>50||name.length<2)return fail('반, 번호, 이름을 확인하세요.');
 const {data:existing,error:e}=await db.from('circle_students').select('*').eq('class_no',cls).eq('student_no',no).maybeSingle();if(e)throw e;
 if(existing&&existing.name!==name)return fail('해당 학번에 등록된 이름과 다릅니다. 선생님께 문의하세요.',403);
 let student=existing;if(!student){const {data,error}=await db.from('circle_students').insert({class_no:cls,student_no:no,name}).select().single();if(error){return fail('학번이 이미 등록되어 있습니다. 다시 로그인해 주세요.');}student=data;}
 await db.from('circle_students').update({last_seen:new Date().toISOString()}).eq('id',student.id);
 await db.from('circle_session_events').insert({student_id:student.id,event_type:'login'});
 const {data:p}=await db.from('circle_progress').select('*').eq('student_id',student.id).maybeSingle();
 if(!p)await db.from('circle_progress').insert({student_id:student.id,stage:1,answers:{}});
 const {data:c}=await db.from('circle_class_control').select('unlocked_stage').eq('class_no',cls).single();
 return ok({token:await sign({role:'student',id:student.id,class_no:cls,exp:Date.now()+1000*60*60*24*30}),student,progress:p||{stage:1,answers:{}},unlocked_stage:c?.unlocked_stage||1});
}
if(action==='teacher_login'){
 if(!teacherPassword||String(b.password)!==teacherPassword)return fail('교사 비밀번호가 올바르지 않습니다.',403);
 return ok({token:await sign({role:'teacher',exp:Date.now()+1000*60*60*12})});
}
const auth=await verify(String(b.token||''));if(!auth)return fail('로그인이 만료되었습니다. 다시 로그인하세요.',401);
if(auth.role==='student'){
 if(action==='state'||action==='heartbeat'){
 await db.from('circle_students').update({last_seen:new Date().toISOString()}).eq('id',auth.id);
 const {data:c}=await db.from('circle_class_control').select('unlocked_stage').eq('class_no',auth.class_no).single();
 const {data:p}=await db.from('circle_progress').select('stage,answers').eq('student_id',auth.id).single();return ok({unlocked_stage:c?.unlocked_stage||1,progress:p});
 }
 if(action==='save'){
 const {data:c}=await db.from('circle_class_control').select('unlocked_stage').eq('class_no',auth.class_no).single();
 const stage=Math.min(8,Math.max(1,Number(b.stage)||1));if(stage>(c?.unlocked_stage||1))return fail('선생님이 아직 이 활동을 열지 않았습니다.',403);
 const {data:prior}=await db.from('circle_progress').select('stage,answers').eq('student_id',auth.id).single();
 const answers={...(prior?.answers||{})};const key=String(b.key||'').slice(0,80);
 if(!/^stage[1-8]_[a-z0-9_]+$/.test(key))return fail('저장할 항목이 올바르지 않습니다.');
 answers[key]=b.value;const next=Math.max(prior?.stage||1,stage);
 const {error}=await db.from('circle_progress').upsert({student_id:auth.id,stage:next,answers,updated_at:new Date().toISOString()});if(error)throw error;
 return ok({progress:{stage:next,answers},unlocked_stage:c?.unlocked_stage||1});
 }
 return fail('허용되지 않은 요청입니다.',403);
}
if(auth.role==='teacher'){
 if(action==='dashboard'){
 const cls=Number(b.class_no)||0;
 let q=db.from('circle_students').select('id,class_no,student_no,name,last_seen,created_at').order('class_no').order('student_no');if(cls)q=q.eq('class_no',cls);
 const {data:students,error:e}=await q;if(e)throw e;
 const ids=(students||[]).map(x=>x.id);let progress:any[]=[];
 if(ids.length){const {data,error}=await db.from('circle_progress').select('student_id,stage,answers,updated_at').in('student_id',ids);if(error)throw error;progress=data||[];}
 const {data:controls}=await db.from('circle_class_control').select('*').order('class_no');
 return ok({students,progress,controls});
 }
 if(action==='unlock'){
 const cls=Number(b.class_no),stage=Number(b.stage);if(!Number.isInteger(cls)||cls<1||cls>20||!Number.isInteger(stage)||stage<1||stage>8)return fail('잘못된 반 또는 단계입니다.');
 const {error}=await db.from('circle_class_control').update({unlocked_stage:stage,updated_at:new Date().toISOString()}).eq('class_no',cls);if(error)throw error;return ok({success:true});
 }
 if(action==='events'){
 const cls=Number(b.class_no);if(!cls)return fail('반을 선택하세요.');
 const {data:s}=await db.from('circle_students').select('id,student_no,name').eq('class_no',cls);
 const ids=(s||[]).map(x=>x.id);if(!ids.length)return ok({events:[]});
 const {data:events,error}=await db.from('circle_session_events').select('student_id,event_type,occurred_at').in('student_id',ids).order('occurred_at',{ascending:false}).limit(2000);if(error)throw error;
 return ok({events:(events||[]).map(e=>({...e,student:s?.find(x=>x.id===e.student_id)}))});
 }
 return fail('허용되지 않은 요청입니다.',403);
}
return fail('권한이 없습니다.',403);
}catch(e){console.error(e);return fail('서버 처리 중 오류가 발생했습니다.',500);}});
