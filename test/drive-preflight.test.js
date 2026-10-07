'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {checkDriveFiles}=require('../scripts/check-drive-files');
const {CATALOG}=require('../commerce');
const settings={GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:'reader@example.test',private_key:'private-test-key'}),COMMERCE_FILES_JSON:JSON.stringify(Object.fromEntries(Object.keys(CATALOG).map(code=>[code,[{name:'Purchase.zip',fileId:'private-file-'+code}]])))};

test('Drive preflight reads each mapped product and stops streams without logging IDs or credentials',async()=>{
 const logs=[],requests=[],cancelled=[];
 const ok=await checkDriveFiles(settings,{getToken:async()=> 'private-test-token',log:x=>logs.push(x),fetchImpl:async(url,options)=>{
  requests.push({url,options});
  assert.equal(options.headers.Authorization,'Bearer private-test-token');
  if(!url.includes('alt=media'))return new Response(JSON.stringify({size:'100',mimeType:'application/zip',capabilities:{canDownload:true}}));
  assert.equal(options.headers.Range,'bytes=0-0');
  return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1]));},cancel(){cancelled.push(url);}}));
 }});
 assert.equal(ok,true);
 assert.equal(requests.length,Object.keys(CATALOG).length*2);
 assert.equal(cancelled.length,Object.keys(CATALOG).length);
 assert.ok(!logs.join('\n').includes('private-'));
});

test('Drive preflight rejects missing mappings, denied metadata and unreadable content',async()=>{
 assert.equal(await checkDriveFiles({...settings,COMMERCE_FILES_JSON:'{}'},{log:()=>{},getToken:async()=>{throw Error('must not authenticate');}}),false);
 for(const mode of ['denied','empty','blocked']){
  const logs=[];
  const ok=await checkDriveFiles(settings,{getToken:async()=> 'test-token',log:x=>logs.push(x),fetchImpl:async url=>{
   if(mode==='denied')return new Response('',{status:403});
   if(url.includes('alt=media'))return new Response('');
   return new Response(JSON.stringify({size:'100',mimeType:'application/zip',capabilities:{canDownload:mode!=='blocked'}}));
  }});
  assert.equal(ok,false);
  assert.equal(logs.filter(x=>x.startsWith('FAIL:')).length,Object.keys(CATALOG).length);
 }
});
