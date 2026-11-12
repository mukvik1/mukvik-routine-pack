'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PassThrough } = require('node:stream');
const { createStandard, catalogFiles, interpretStatus, paidThrough } = require('../standard-subscription');

const user = { id: 'customer', email_verified_at: new Date() };
const settings = { STANDARD_SUBSCRIPTIONS_ENABLED:'true', MONOBANK_SUBSCRIPTION_TOKEN:'fake-only', PUBLIC_ORIGIN:'https://api.example.test', WEB_ORIGIN:'https://site.example.test' };
const pack = [{ fileId:'test_track_001', name:'Edit.mp3' },{ fileId:'test_video_001', name:'Lesson.mp4' },{ fileId:'test_bonus_001',name:'Bonus.mp3' }];
const packManifest = [{slug:'routine-01',files:pack.slice(0,2).map(f=>({name:f.name,key:crypto.createHash('sha256').update(f.fileId).digest('hex')}))}];
const files = { pack, ...Object.fromEntries([3,5,7,8,9,10,11,12].map(n=>['routine'+n,[{fileId:'other_routine_'+n,name:'Other.mp3'}]])) };
const reply = (res,status,data) => Object.assign(res,{status,data});
const bank = row => ({subscriptionId:row.provider_id,status:'active',amount:row.amount_kop,ccy:980,interval:'1m',startDate:new Date().toISOString(),summary:{totalPaid:0,totalFailed:0}});

function setup(adminEmail, manifest=packManifest){
 const state = { row:null, tickets:new Map(), events:[], requests:[], bankData:null };
 const db = { release(){}, async query(sql,p=[]){
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('SELECT id FROM customers'))return {rows:[]};
  if(sql.startsWith('SELECT * FROM standard_subscriptions'))return {rows:state.row?[state.row]:[]};
  if(sql.startsWith('SELECT id,customer_id'))return {rows:state.row?.callback_hash===p[0]?[state.row]:[]};
  if(sql.startsWith('INSERT INTO standard_subscriptions')){
   const [id,customer_id,provider_id,callback_hash,checkout_url,amount_kop,created_at,checkout_expires_at,tier]=p;
   state.row={id,customer_id,provider_id,callback_hash,checkout_url,amount_kop,created_at,checkout_expires_at,tier};
   return {rows:[]};
  }
  if(sql.startsWith('UPDATE standard_subscriptions SET paid_until')){
   Object.assign(state.row,{paid_until:p[1],provider_status:p[2],checked_at:new Date()});
   return {rows:[state.row]};
  }
  if(sql.startsWith('UPDATE standard_subscriptions SET cancelled_at')){
   state.row.cancelled_at=new Date();return {rows:[]};
  }
  if(sql.startsWith('INSERT INTO standard_download_tickets')){
   if(!p[4]&&!(state.row?.customer_id===p[1] && state.row?.paid_until > new Date() && p[3].includes(state.row.tier)))return {rowCount:0};
   state.tickets.set(p[0],{slug:p[2],admin:p[4]});return {rowCount:1};
  }
  if(sql.startsWith('DELETE FROM standard_download_tickets AS t')){
   const saved=state.tickets.get(p[0]),slug=saved?.slug;
   if(!saved?.admin&&state.row?.tier==='standard'&&p[1].includes(slug))return {rowCount:0};
   if(!slug||!(saved.admin&&(p[2]===adminEmail||p[3]?.includes(slug)))&&!(state.row?.paid_until>new Date()))return {rowCount:0};
   state.tickets.delete(p[0]);return {rowCount:1,rows:[{routine_slug:slug}]};
  }
  throw Error('Unexpected SQL '+sql);
 }};
 const subscription = createStandard(settings,{
  pool:{query:db.query,connect:async()=>db},files,packManifest:manifest,adminEmail,reply,getDriveToken:async()=> 'fake-drive',
  driveFetch:async url=>{state.events.push(url);return new Response(url.includes('video')?'video-test':'audio-test');},
  fetchImpl:async (url,req)=>{
   assert.equal(req.headers['X-Token'],'fake-only');
   const path=new URL(url).pathname.split('/').at(-1), payload=req.body&&JSON.parse(req.body);
   state.requests.push({path,payload});
   if(path==='create')return Response.json({subscriptionId:'s2_test',pageUrl:'https://pay.mbnk.biz/s2_test'});
   if(path==='status')return Response.json(state.bankData||bank(state.row));
   if(path==='edit')return new Response(null,{status:200});
   throw Error('Unexpected provider call');
  }
 });
 return {state,subscription};
}

test('a documented bank status must match subscription, amount and currency; no access before first payment',()=>{
 const row={provider_id:'s2_test',amount_kop:69000,created_at:new Date()};
 assert.equal(interpretStatus(row,bank(row)).paidUntil,null);
 assert.equal(interpretStatus(row,{...bank(row),amount:1}),null);
 assert.equal(interpretStatus(row,{...bank(row),subscriptionId:'s2_other'}),null);
 assert.equal(interpretStatus(row,{...bank(row),ccy:840}),null);
 assert.equal(paidThrough('2026-01-31T12:00:00Z',1).toISOString(),'2026-02-28T12:00:00.000Z');
 assert.throws(()=>catalogFiles({...files,pack:[]},packManifest),/Invalid subscription file mapping/);
 const copies=pack.map((f,i)=>({...f,fileId:'copied_file_'+i,name:'Original Pack/'+f.name}));
 assert.equal(catalogFiles({...files,pack:copies},packManifest).get('routine-01')[0].fileId,copies[0].fileId);
 assert.throws(()=>catalogFiles({...files,pack:[...copies,{...copies[0],fileId:'different_copy_01'}]},packManifest),/Invalid subscription file mapping/);
});

test('checkout requires consent, is reused, grants access only after bank payment, and cancellation preserves paid time',async()=>{
 const {subscription:s,state}=setup();
 const denied={};await s.checkout(denied,user,false);assert.equal(denied.status,400);assert.equal(state.requests.length,0);
 const start={};await s.checkout(start,user,true);assert.equal(start.status,201);
 const {payload}=state.requests[0];
 assert.equal(payload.amount,69000);assert.equal(payload.interval,'1m');
 assert.match(payload.redirectUrl,/subscription=return/);
 const retry={};await s.checkout(retry,user,true);assert.deepEqual(retry.data,start.data);
 assert.equal(state.requests.filter(x=>x.path==='create').length,1);
 const callback=payload.webHookUrls.chargeUrl.split('/').at(-1);
 await s.callback({},callback);
 const pending={};await s.ticket(pending,user,'routine-01');assert.equal(pending.status,403);
 state.bankData={...bank(state.row),summary:{totalPaid:1,totalFailed:0}};
 await s.callback({},callback);
 const paid={};await s.status(paid,user);assert.equal(paid.data.active,true);
 const cancel={};await s.cancel(cancel,user);
 assert.equal(cancel.data.cancelled,true);assert.equal(cancel.data.active,true);
 assert.deepEqual(state.requests.at(-1).payload,{subscriptionId:'s2_test',action:'cancel'});
 const late={};await s.ticket(late,{id:'other'},'routine-01');assert.equal(late.status,403);
 const ticket={};await s.ticket(ticket,user,'routine-01');assert.equal(ticket.status,200);
 const response=new PassThrough(), parts=[];
 response.on('data',part=>parts.push(part));response.writeHead=(status,headers)=>Object.assign(response,{status,headers});
 const token=ticket.data.url.split('/').at(-1);
 await s.download(response,token);
 const zip=Buffer.concat(parts);
 assert.equal(response.status,200);assert.equal(response.headers['Content-Type'],'application/zip');
 assert.match(response.headers['Content-Disposition'],/Who%27s%20That%20Girl%20x%20Drop%20It%20Like%20It%27s%20Hot\.zip/);
 assert.equal(zip.readUInt32LE(0),0x04034b50);
 assert.ok(zip.includes(Buffer.from('Edit.mp3'))&&zip.includes(Buffer.from('Lesson.mp4')));
 assert.ok(!zip.includes(Buffer.from('Bonus.mp3')));
 assert.equal(state.events.length,2);
 const replay={};await s.download(replay,token);assert.equal(replay.status,410);
});

test('Pro has its own billing amount and four exclusives; Standard cannot issue a Pro download',async()=>{
 const pro=setup();
 await pro.subscription.checkout({},user,true,'pro');
 assert.equal(pro.state.requests[0].payload.amount,115000);
 const callback=pro.state.requests[0].payload.webHookUrls.chargeUrl.split('/').at(-1);
 pro.state.bankData={...bank(pro.state.row),summary:{totalPaid:1,totalFailed:0}};
 await pro.subscription.callback({},callback);
 const ticket={};await pro.subscription.ticket(ticket,user,'call-me-maybe-poker-face');assert.equal(ticket.status,200);
 const standard=setup();
 await standard.subscription.checkout({},user,true,'standard');
 standard.state.bankData={...bank(standard.state.row),summary:{totalPaid:1,totalFailed:0}};
 await standard.subscription.callback({},standard.state.requests[0].payload.webHookUrls.chargeUrl.split('/').at(-1));
 const denied={};await standard.subscription.ticket(denied,user,'call-me-maybe-poker-face');assert.equal(denied.status,403);
 standard.state.row.tier='legacy';
 const retained={};await standard.subscription.ticket(retained,user,'call-me-maybe-poker-face');assert.equal(retained.status,200);
});

test('verified admin can audit an archive without a subscription; a matching unverified email cannot',async()=>{
 const email='admin@example.test';
 const {subscription:s,state}=setup(email);
 const denied={};await s.ticket(denied,{id:'admin',email},'routine-01');assert.equal(denied.status,403);
 const nonAdmin={};await s.ticket(nonAdmin,{id:'other',email:'other@example.test',email_verified_at:new Date()},'routine-01');assert.equal(nonAdmin.status,403);
 const approved={};await s.ticket(approved,{id:'admin',email,email_verified_at:new Date()},'routine-01');assert.equal(approved.status,200);
 const response=new PassThrough();response.resume();response.writeHead=status=>{response.status=status;};
 await s.download(response,approved.data.url.split('/').at(-1));
 assert.equal(response.status,200);assert.equal(state.events.length,2);
});

test('verified Free members can download and request original video for the reclassified routines',async()=>{
 const {subscription:s}=setup(null,[{...packManifest[0],slug:'routine-04'}]);
 assert.deepEqual(s.catalog.freeSlugs,['routine-04']);
 const denied={};await s.ticket(denied,{id:user.id},'routine-04',true);assert.equal(denied.status,403);
 const video={};await s.ticket(video,user,'routine-04',true);assert.equal(video.status,200);
 assert.match(video.data.url,/\/standard\/video\//);
 const archive={};await s.ticket(archive,user,'routine-04');assert.equal(archive.status,200);
 const response=new PassThrough();response.resume();response.writeHead=status=>{response.status=status;};
 await s.download(response,archive.data.url.split('/').at(-1));
 assert.equal(response.status,200);
});
