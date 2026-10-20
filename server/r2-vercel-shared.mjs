import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const TYPES = Object.freeze({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'});
const MAX_BYTES = 4 * 1024 * 1024; // keep below Vercel's request payload limit
let r2;
const trim = value => String(value || '').trim();
function settings() {
  const keys = ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET_NAME'];
  const missing = keys.filter(k => !trim(process.env[k]));
  if (missing.length) throw Object.assign(new Error('R2 server configuration incomplete: '+missing.join(', ')), { status:503, code:'R2_CONFIG' });
  if (!r2) r2 = new S3Client({region:'auto', endpoint:`https://${trim(process.env.R2_ACCOUNT_ID)}.r2.cloudflarestorage.com`, forcePathStyle:true, credentials:{accessKeyId:trim(process.env.R2_ACCESS_KEY_ID), secretAccessKey:trim(process.env.R2_SECRET_ACCESS_KEY)}});
  return r2;
}
export function reply(res,status,data){res.setHeader('Cache-Control','no-store');return res.status(status).json(data);}
export async function authenticate(req){
  const match=/^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization||''));
  if(!match)return {status:401,code:'MISSING_TOKEN',error:'RentDesk login token was not sent. Reload the app and try again.'};
  const base=trim(process.env.SUPABASE_URL).replace(/\/$/,'');
  const key=trim(process.env.SUPABASE_ANON_KEY);
  if(!base || !key)return {status:503,code:'SUPABASE_CONFIG',error:'Photo API missing SUPABASE_URL or SUPABASE_ANON_KEY.'};
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base) && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))return {status:503,code:'SUPABASE_URL',error:'Photo API Supabase URL is invalid.'};
  let result;
  try {
    result=await fetch(`${base}/auth/v1/user`,{method:'GET',headers:{apikey:key,Authorization:`Bearer ${match[1]}`},signal:AbortSignal.timeout(10000)});
  } catch(e){return {status:503,code:'AUTH_UNREACHABLE',error:'Photo API cannot reach Supabase Auth. Check API server URL and connectivity.'};}
  if(!result.ok){
    // No token or key is ever returned to the browser or logs.
    const code=result.status===401 || result.status===403?'INVALID_TOKEN':'AUTH_SERVICE_ERROR';
    return {status:result.status===401 || result.status===403?401:503,code,error:code==='INVALID_TOKEN'?'Photo API rejected the RentDesk login token. Check that the frontend and photo API use the same Supabase project.':'Supabase Auth returned HTTP '+result.status+'.'};
  }
  const user=await result.json().catch(()=>null);
  if(!user?.id || !/^[0-9a-f-]{36}$/i.test(user.id))return {status:401,code:'INVALID_USER',error:'Supabase Auth returned no valid user.'};
  return {user};
}
export async function readBody(req,limit){
  if(Buffer.isBuffer(req.body)){if(req.body.length>limit)throw Object.assign(new Error('Image too large'),{status:413});return req.body;}
  if(typeof req.body==='string'){const bytes=Buffer.from(req.body);if(bytes.length>limit)throw Object.assign(new Error('Image too large'),{status:413});return bytes;}
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(new Error('Image too large'),{status:413});chunks.push(chunk);}
  return Buffer.concat(chunks);
}
function fail(res,e,action){
  console.error('R2 '+action+' failed:',e.code||e.name||'ERROR',e.message);
  return reply(res,e.status||502,{code:e.code||'R2_ERROR',error:e.status===413?'The upload exceeded the server request limit. Refresh and retry; the app should optimize camera images automatically.':`${action} failed on the server. Check server logs and R2 permissions.`});
}
export async function handleUpload(req,res){
  if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'});
  try{
    const auth=await authenticate(req);if(!auth.user)return reply(res,auth.status,{error:auth.error,code:auth.code});
    const type=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
    if(!TYPES[type])return reply(res,415,{error:'Only JPG, PNG and WebP images are supported.'});
    const length=Number(req.headers['content-length']||0);
    if(length>MAX_BYTES)return reply(res,413,{error:'The upload exceeded the server request limit. Refresh and retry.'});
    const bytes=await readBody(req,MAX_BYTES);
    if(!bytes.length)return reply(res,400,{error:'Empty image.'});
    // Check file signatures so callers cannot upload arbitrary content with an image MIME type.
    const jpg=type==='image/jpeg'&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
    const png=type==='image/png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const webp=type==='image/webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    if(!(jpg||png||webp))return reply(res,415,{error:'Image content does not match the selected file format.'});
    const store=settings();const objectKey=`customers/${auth.user.id}/${randomUUID()}.${TYPES[type]}`;
    await store.send(new PutObjectCommand({Bucket:trim(process.env.R2_BUCKET_NAME),Key:objectKey,Body:bytes,ContentType:type}));
    return reply(res,200,{objectKey});
  }catch(e){return fail(res,e,'Photo upload');}
}
export async function handlePhoto(req,res){
  if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'});
  try{
    const auth=await authenticate(req);if(!auth.user)return reply(res,auth.status,{error:auth.error,code:auth.code});
    const bytes=await readBody(req,4096);
    let payload;try{payload=JSON.parse(bytes.toString('utf8'));}catch{return reply(res,400,{error:'Invalid photo request.'});}
    const key=payload?.objectKey;
    if(typeof key!=='string'||!/^customers\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(key)||!key.startsWith(`customers/${auth.user.id}/`))return reply(res,403,{error:'Photo access denied.'});
    const store=settings();const object=await store.send(new GetObjectCommand({Bucket:trim(process.env.R2_BUCKET_NAME),Key:key}));
    const chunks=[];let size=0;
    for await(const chunk of object.Body){size+=chunk.length;if(size>MAX_BYTES)throw Object.assign(new Error('Stored photo too large'),{status:413});chunks.push(Buffer.from(chunk));}
    res.setHeader('Content-Type',object.ContentType||'application/octet-stream');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(200).send(Buffer.concat(chunks));
  }catch(e){if(e.name==='NoSuchKey')return reply(res,404,{error:'Photo not found.'});return fail(res,e,'Photo viewing');}
}
export async function handleAuthCheck(req,res){
  if(req.method!=='GET')return reply(res,405,{error:'Method not allowed'});
  const auth=await authenticate(req);
  if(!auth.user)return reply(res,auth.status,{ok:false,code:auth.code,error:auth.error});
  return reply(res,200,{ok:true,message:'Photo API recognizes the current RentDesk session.'});
}
