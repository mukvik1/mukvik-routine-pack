'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {downloadDrivePreview}=require('../scripts/download-drive-preview');
const settings={PREVIEW_VIDEO_6_DRIVE_FILE_ID:'preview-file-test',GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:'test@example.test',private_key:'test-key'})};
test('Preview import saves the video and its own thumbnail',async()=>{
 const saved=[];
 await downloadDrivePreview(settings,{getToken:async()=> 'test-token',save:async(name,data)=>saved.push([name,data.toString()]),fetchImpl:async(url,{headers})=>{
  assert.equal(headers.Authorization,'Bearer test-token');
  if(url.includes('?fields='))return new Response(JSON.stringify({mimeType:'video/mp4',thumbnailLink:'https://lh3.googleusercontent.com/test-thumbnail'}));
  return new Response(url.includes('alt=media')?'video':'poster',{headers:{'content-type':url.includes('alt=media')?'video/mp4':'image/jpeg'}});
 }});
 assert.deepEqual(saved,[['video-6.mp4','video'],['poster-6.jpg','poster']]);
});
test('Preview import rejects untrusted thumbnail URLs before forwarding credentials',async()=>{
 let calls=0;
 await assert.rejects(downloadDrivePreview(settings,{getToken:async()=> 'test-token',save:async()=>assert.fail('must not save'),fetchImpl:async()=>{
  calls++;return new Response(JSON.stringify({mimeType:'video/mp4',thumbnailLink:'https://example.test/thumbnail'}));
 }}),/Untrusted/);
 assert.equal(calls,1);
});
test('Each free routine receives its own video and thumbnail without mixing assets',async()=>{
 const slugs=['get-right-x-just-a-lil-bit','work-it-x-candy-shop','rihanna-routine'];
 const saved=new Map();
 await downloadDrivePreview({...settings,FREE_PREVIEW_FILES_JSON:JSON.stringify(Object.fromEntries(slugs.map(slug=>[slug,'test-file-'+slug])))},{getToken:async()=> 'test-token',save:async(name,bytes)=>saved.set(name,bytes.toString()),fetchImpl:async url=>{
  const u=new URL(url),id=u.pathname.split('/').at(-1);
  if(u.searchParams.has('fields'))return new Response(JSON.stringify({mimeType:'video/mp4',thumbnailLink:'https://lh3.googleusercontent.com/'+id}));
  return new Response(id,{headers:{'content-type':u.searchParams.has('alt')?'video/mp4':'image/jpeg'}});
 }});
 assert.equal(saved.size,8);
 for(const slug of slugs){assert.equal(saved.get('free-'+slug+'.mp4'),'test-file-'+slug);assert.equal(saved.get('free-'+slug+'.jpg'),'test-file-'+slug);}
});
