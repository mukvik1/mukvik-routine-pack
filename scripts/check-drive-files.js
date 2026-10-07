'use strict';
const {GoogleAuth}=require('google-auth-library');
const {CATALOG}=require('../commerce');

async function checkDriveFiles(settings,{fetchImpl=fetch,getToken,log=console.log}={}){
 let credentials,files;
 try{
  credentials=JSON.parse(settings.GOOGLE_SERVICE_ACCOUNT_JSON||'');
  files=JSON.parse(settings.COMMERCE_FILES_JSON||'');
  if(!credentials?.client_email||!credentials?.private_key)throw Error();
 }catch{log('FAIL: Drive configuration is missing or invalid.');return false;}
 const targets=[];
 for(const code of Object.keys(CATALOG)){
  const entries=files?.[code];
  if(!Array.isArray(entries)||!entries.length){log('FAIL: no file mapping for '+code);return false;}
  for(const [index,file] of entries.entries()){
   if(!file||!/^[-\w]{10,128}$/.test(file.fileId)||typeof file.name!=='string'||!file.name.length){log('FAIL: invalid file mapping for '+code);return false;}
   targets.push({code,index,id:file.fileId});
  }
 }
 let token;
 try{
  const auth=new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/drive.readonly']});
  token=await (getToken||auth.getAccessToken.bind(auth))();
  if(!token)throw Error();
 }catch{log('FAIL: Drive authentication failed.');return false;}
 let ok=true;
 for(const target of targets){
  const label=target.code+' file '+(target.index+1);
  let stage='metadata',reason='network or timeout';
  try{
   const endpoint='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(target.id);
   const metadata=await fetchImpl(endpoint+'?fields=trashed,size,mimeType,capabilities(canDownload)&supportsAllDrives=true',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
   if(!metadata.ok){reason='HTTP '+metadata.status;throw Error();}
   const info=await metadata.json();
   reason=info.trashed?'file trashed':!info.capabilities?.canDownload?'download forbidden':String(info.mimeType).startsWith('application/vnd.google-apps.')?'native Google document':'missing or empty file size';
   if(info.trashed||!info.capabilities?.canDownload||!/^\d+$/.test(String(info.size))||BigInt(info.size)<=0n||String(info.mimeType).startsWith('application/vnd.google-apps.'))throw Error();
   stage='media';reason='network or timeout';
   const media=await fetchImpl(endpoint+'?alt=media&supportsAllDrives=true',{headers:{Authorization:'Bearer '+token,Range:'bytes=0-0'},signal:AbortSignal.timeout(15000)});
   if(!media.ok||!media.body){reason=!media.ok?'HTTP '+media.status:'missing response body';await media.body?.cancel();throw Error();}
   const reader=media.body.getReader();
   let nonempty=false;
   try{const chunk=await reader.read();nonempty=!chunk.done&&chunk.value?.byteLength>0;}finally{await reader.cancel();}
   if(!nonempty){reason='empty response body';throw Error();}
   log('PASS: '+label+' is readable.');
  }catch{ok=false;log('FAIL: '+label+' cannot be read ('+stage+': '+reason+'); check mapping, reader permission and download restrictions.');}
 }
 log(ok?'Drive file read checks passed.':'Drive file read checks failed.');
 log('No files changed, purchase granted or email sent. Public-sharing permissions are not checked by this command.');
 return ok;
}
if(require.main===module)checkDriveFiles(process.env).then(ok=>{process.exitCode=ok?0:1;}).catch(()=>{console.error('Drive check failed.');process.exitCode=1;});
module.exports={checkDriveFiles};
