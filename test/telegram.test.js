'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createTelegramBot}=require('../telegram');

test('Telegram owner-only webhook, duplicate update, confirmation and approval',async()=>{
 const calls=[],granted=[];
 const order='d482b8f8-8d36-49d9-ac09-4077a802d77b';
 const owner=123456789;
 const pool={query:async(sql,args)=>{
  if(sql.includes('telegram_updates')){if(pool.seen.has(args[0]))return {rowCount:0};pool.seen.add(args[0]);return {rowCount:1};}
  if(sql.includes('count(*)::int'))return {rows:[{orders:1,pending:1,approved:0,downloads:0}]};
  throw Error('Unexpected query: '+sql);
 },seen:new Set()};
 const config={TELEGRAM_ENABLED:'true',TELEGRAM_BOT_TOKEN:'123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef',TELEGRAM_WEBHOOK_SECRET:'very-secret-token-12345',TELEGRAM_ADMIN_CHAT_ID:String(owner),TELEGRAM_BOT_USERNAME:'Routinepack_bot',TELEGRAM_WEBHOOK_URL:'https://example.test/api/v2/telegram/webhook'};
 const bot=createTelegramBot(config,{pool,approveOrder:async id=>{granted.push(id);return {status:'approved'};},fetchImpl:async(url,options)=>{
  calls.push({method:url.split('/').at(-1),body:JSON.parse(options.body)});
  return new Response(JSON.stringify({ok:true,result:url.endsWith('/getMe')?{username:'Routinepack_bot'}:true}),{status:200,headers:{'Content-Type':'application/json'}});
 }});
 const server=http.createServer((req,res)=>bot.handle(req,res));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const target='http://127.0.0.1:'+server.address().port;
  const send=(update,secret=config.TELEGRAM_WEBHOOK_SECRET)=>fetch(target,{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':secret,'Content-Type':'application/json'},body:JSON.stringify(update)});
  const command=(id,from,chat)=>({update_id:id,message:{from:{id:from},chat:{id:chat},text:'/stats'}});
  assert.equal((await send(command(1,owner,owner),'wrong-secret-token-1234')).status,401);
  assert.equal((await send(command(2,owner+1,owner+1))).status,200);
  assert.equal(calls.length,0);
  assert.equal((await send(command(3,owner,owner))).status,200);
  assert.equal((await send(command(3,owner,owner))).status,200);
  assert.equal(calls.filter(x=>x.method==='sendMessage').length,1);
  const callback=(id,data)=>({update_id:id,callback_query:{id:'callback-'+id,from:{id:owner},message:{chat:{id:owner}},data}});
  assert.equal((await send(callback(4,'confirm:'+order))).status,200);
  assert.equal(granted.length,0);
  assert.equal((await send(callback(5,'approve:'+order))).status,200);
  assert.equal((await send(callback(5,'approve:'+order))).status,200);
  assert.deepEqual(granted,[order]);
  assert.equal(calls.filter(x=>x.method==='answerCallbackQuery').length,2);
  await bot.installWebhook();
  assert.equal(calls.find(x=>x.method==='getMe').method,'getMe');
  const webhook=calls.find(x=>x.method==='setWebhook').body;
  assert.equal(webhook.secret_token,config.TELEGRAM_WEBHOOK_SECRET);
  assert.equal(webhook.drop_pending_updates,false);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('A token for a different Telegram bot cannot register the owner webhook',async()=>{
 const methods=[];
 const bot=createTelegramBot({
  TELEGRAM_ENABLED:'true',TELEGRAM_BOT_TOKEN:'123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef',
  TELEGRAM_WEBHOOK_SECRET:'very-secret-token-12345',TELEGRAM_ADMIN_CHAT_ID:'123456789',
  TELEGRAM_BOT_USERNAME:'Routinepack_bot',TELEGRAM_WEBHOOK_URL:'https://example.test/api/v2/telegram/webhook'
 },{pool:{},approveOrder:async()=>{throw Error('No approval');},fetchImpl:async url=>{
  methods.push(url.split('/').at(-1));
  return new Response(JSON.stringify({ok:true,result:{username:'another_bot'}}),{status:200});
 }});
 await assert.rejects(bot.installWebhook(),/does not match/);
 assert.deepEqual(methods,['getMe']);
});
