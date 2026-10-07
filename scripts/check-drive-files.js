'use strict';
const {GoogleAuth}=require('google-auth-library');
const {CATALOG}=require('../commerce');

async function inspectDriveFolder(folderId,targets,token,{fetchImpl=fetch,log=console.log,listNames=false}={}){
 const headers={Authorization:'Bearer '+token};
 try{
  const response=await fetchImpl('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(folderId)+'?fields=mimeType,trashed&supportsAllDrives=true',{headers,signal:AbortSignal.timeout(15000)});
  if(!response.ok){log('FOLDER: metadata HTTP '+response.status);return;}
  const folder=await response.json();
  if(folder.trashed||folder.mimeType!=='application/vnd.google-apps.folder'){log('FOLDER: target is not an active folder.');return;}
  const queue=[{id:folderId,path:''}],seen=new Set(),entries=[];
  while(queue.length){
   const {id:parent,path}=queue.shift();if(seen.has(parent))continue;seen.add(parent);
   if(seen.size>100){log('FOLDER: scan limit reached.');return;}
   let page;
   do{
    const query=new URLSearchParams({q:"'"+parent+"' in parents and trashed = false",fields:'nextPageToken,files(id,name,mimeType)',pageSize:'1000',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});
    if(page)query.set('pageToken',page);
    const result=await fetchImpl('https://www.googleapis.com/drive/v3/files?'+query,{headers,signal:AbortSignal.timeout(15000)});
    if(!result.ok){log('FOLDER: listing HTTP '+result.status);return;}
    const data=await result.json();
    for(const file of data.files||[]){
     const filePath=path+String(file.name||'');
     if(file.mimeType==='application/vnd.google-apps.folder')queue.push({id:file.id,path:filePath+'/'});else entries.push({...file,path:filePath});
    }
    page=data.nextPageToken;
   }while(page);
  }
  const ids=new Set(entries.map(file=>file.id));
  const names=new Map();for(const file of entries)names.set(file.name,(names.get(file.name)||0)+1);
  log('FOLDER: readable; '+entries.length+' files across '+seen.size+' folders.');
  log('FOLDER: '+targets.filter(file=>ids.has(file.id)).length+'/'+targets.length+' mapped entries found by ID; '+targets.filter(file=>names.get(file.name)===1).length+'/'+targets.length+' have a unique exact name match.');
  if(listNames){
   for(const file of entries)log('FOLDER FILE: '+JSON.stringify(file.path.slice(0,500)));
   for(const file of targets)log('MAPPING NAME: '+file.code+' '+JSON.stringify(file.name.slice(0,160)));
  }
  return entries;
 }catch{log('FOLDER: network, timeout or invalid response.');}
}

async function checkDriveFiles(settings,{fetchImpl=fetch,getToken,log=console.log,folderId,expectedReader,listNames=false}={}){
 let credentials,files;
 try{
  credentials=JSON.parse(settings.GOOGLE_SERVICE_ACCOUNT_JSON||'');
  files=JSON.parse(settings.COMMERCE_FILES_JSON||'');
  if(!credentials?.client_email||!credentials?.private_key)throw Error();
 }catch{log('FAIL: Drive configuration is missing or invalid.');return false;}
 if(expectedReader)log('READER: '+(credentials.client_email===expectedReader?'matches the expected service account.':'does not match the expected service account.'));
 const targets=[];
 for(const code of Object.keys(CATALOG)){
  const entries=files?.[code];
  if(!Array.isArray(entries)||!entries.length){log('FAIL: no file mapping for '+code);return false;}
  for(const [index,file] of entries.entries()){
   if(!file||!/^[-\w]{10,128}$/.test(file.fileId)||typeof file.name!=='string'||!file.name.length){log('FAIL: invalid file mapping for '+code);return false;}
   targets.push({code,index,id:file.fileId,name:file.name});
  }
 }
 let token;
 try{
  const auth=new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/drive.readonly']});
  token=await (getToken||auth.getAccessToken.bind(auth))();
  if(!token)throw Error();
 }catch{log('FAIL: Drive authentication failed.');return false;}
 if(folderId){
  if(!/^[-\w]{10,128}$/.test(folderId)){log('FAIL: invalid diagnostic folder ID.');return false;}
  await inspectDriveFolder(folderId,targets,token,{fetchImpl,log,listNames});
 }
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
if(require.main===module){
 const {parseArgs}=require('node:util');
 const {values}=parseArgs({options:{folder:{type:'string'},reader:{type:'string'},'list-names':{type:'boolean'}}});
 checkDriveFiles(process.env,{folderId:values.folder,expectedReader:values.reader,listNames:values['list-names']}).then(ok=>{process.exitCode=ok?0:1;}).catch(()=>{console.error('Drive check failed.');process.exitCode=1;});
}
module.exports={checkDriveFiles,inspectDriveFolder};
