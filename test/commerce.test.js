(function commerceTests(require,module){
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const crypto=require('node:crypto');
const {Pool}=require('pg');
const {createCommerce,gmailRawMessage}=require('../commerce');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
test('Gmail MIME encodes Ukrainian and refuses header injection',()=>{
 const encoded=gmailRawMessage({from:'Routine Pack <mukvik1@gmail.com>',to:'buyer@example.test',subject:'Ваше замовлення',text:'Покупка підтверджена'});
 const raw=Buffer.from(encoded,'base64url').toString('utf8');
 assert.match(raw,/^From: Routine Pack <mukvik1@gmail.com>\r\nTo: buyer@example.test\r\n/);
 assert.match(raw,/Subject: =\?UTF-8\?B\?/);
 assert.equal(Buffer.from(raw.split('\r\n\r\n')[1].replace(/\r\n/g,''),'base64').toString('utf8'),'Покупка підтверджена');
 assert.throws(()=>gmailRawMessage({from:'a@gmail.com',to:'buyer@example.test\r\nBcc: b@example.test',subject:'Hi',text:'X'}));
});

const testDatabase=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;
if(!testDatabase){test.skip('PostgreSQL integration tests require TEST_DATABASE_URL',()=>{});}
else test('email login, cart, manual approval and one-use private download',async()=>{
 const pool=new Pool({connectionString:testDatabase});
 const emails=[];
 let commerce,server;
 try{
  await pool.query(fs.readFileSync(require.resolve('../db/001_commerce.sql'),'utf8'));
  const options={
   ...process.env,
   COMMERCE_ENABLED:'true',DATABASE_URL:testDatabase,WEB_ORIGIN:'https://routinepack.download',
   ADMIN_EMAIL:'owner@example.test',SMTP_HOST:'localhost',SMTP_USER:'orders@example.test',SMTP_PASSWORD:'test-only',SMTP_FROM:'orders@example.test',
   GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:'service@example.test',private_key:'fake-key'}),
   COMMERCE_FILES_JSON:JSON.stringify({routine3:[{name:'Routine 03.zip',fileId:'privateFile12345'}],routine5:[{name:'Routine 05.zip',fileId:'privateFile56789'}]})
  };
  commerce=createCommerce(options,{sendMail:async message=>emails.push(message),driveToken:async()=> 'test-drive-token',fetch:async()=>new Response(Buffer.from('private-original'),{headers:{'content-length':'16'}})});
  server=http.createServer(async(req,res)=>{await commerce.handle(req,res,new URL(req.url,'http://localhost'));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  async function api(path,method='GET',token,body){
   const r=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
   const content=r.headers.get('content-type')||'';
   return {status:r.status,data:content.includes('application/json')?await r.json():await r.text()};
  }
  const suffix=crypto.randomUUID();
  async function addSession(email){
   const customer=crypto.randomUUID(),secret=crypto.randomBytes(32).toString('base64url');
   await pool.query('INSERT INTO customers(id,email) VALUES($1,$2)',[customer,email]);
   await pool.query("INSERT INTO sessions(token_hash,customer_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[hash(secret),customer]);
   return {customer,secret};
  }
  const buyer=await addSession('buyer-'+suffix+'@example.test');
  const other=await addSession('other-'+suffix+'@example.test');
  const admin=await addSession('owner@example.test');
  assert.equal((await api('/api/v2/catalog')).data.products.length,7);
  assert.equal((await api('/api/v2/me')).status,401);
  assert.equal((await api('/api/v2/admin/orders','GET',buyer.secret)).status,403);
  assert.equal((await api('/api/v2/cart','PUT',buyer.secret,{productCodes:['routine3','nonexistent']})).status,400);
  assert.equal((await api('/api/v2/cart','PUT',buyer.secret,{productCodes:['routine3','routine5','routine3'],priceCents:1})).status,200);
  const cartActivity=await pool.query("SELECT payload FROM customer_activity WHERE customer_id=$1 AND kind='cart_updated'",[buyer.customer]);
  assert.equal(cartActivity.rowCount,1);
  assert.deepEqual(cartActivity.rows[0].payload.added.map(x=>x.code),['routine3','routine5']);
  await Promise.all([api('/api/v2/cart','PUT',buyer.secret,{productCodes:['routine5','routine3']}),api('/api/v2/cart','PUT',buyer.secret,{productCodes:['routine3','routine5']})]);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM customer_activity WHERE customer_id=$1",[buyer.customer])).rows[0].n,1);
  assert.equal((await api('/api/v2/cart','PUT',buyer.secret,{productCodes:['routine3']})).status,200);
  const removedItem=await pool.query("SELECT payload FROM customer_activity WHERE customer_id=$1 ORDER BY id DESC LIMIT 1",[buyer.customer]);
  assert.deepEqual(removedItem.rows[0].payload.removed.map(x=>x.code),['routine5']);
  assert.equal((await api('/api/v2/cart','PUT',buyer.secret,{productCodes:['routine3','routine5']})).status,200);
  const idempotencyKey=crypto.randomUUID();
  const created=await api('/api/v2/orders','POST',buyer.secret,{idempotencyKey,totalCents:1});
  assert.equal(created.status,201);
  const order=created.data.order;
  assert.equal(order.total_cents,1100);
  assert.equal(order.status,'awaiting_manual_review');
  const repeated=await api('/api/v2/orders','POST',buyer.secret,{idempotencyKey});
  assert.equal(repeated.status,200);
  assert.equal(repeated.data.order.id,order.id);
  const ticketPath='/api/v2/orders/'+order.id+'/files/routine3/0/ticket';
  assert.equal((await api(ticketPath,'POST',buyer.secret)).status,403);
  assert.equal((await api(ticketPath,'POST',other.secret)).status,403);
  assert.equal((await api('/api/v2/admin/orders/'+order.id+'/approve','POST',buyer.secret)).status,403);
  const approvalPath='/api/v2/admin/orders/'+order.id+'/approve';
  const approvals=await Promise.all([api(approvalPath,'POST',admin.secret),api(approvalPath,'POST',admin.secret)]);
  assert.deepEqual(approvals.map(x=>x.status),[200,200]);
  assert.equal(approvals.filter(x=>x.data.alreadyApproved).length,1);
  const grants=await pool.query('SELECT count(*)::int AS n FROM entitlements WHERE order_id=$1',[order.id]);
  assert.equal(grants.rows[0].n,2);
  const events=await pool.query("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND event_type='manual_approved'",[order.id]);
  assert.equal(events.rows[0].n,1);
  const outbox=await pool.query("SELECT count(*)::int AS n FROM notification_outbox WHERE order_id=$1 AND kind='approved'",[order.id]);
  assert.equal(outbox.rows[0].n,1);
  const account=await api('/api/v2/me','GET',buyer.secret);
  assert.equal(account.data.orders[0].items.every(x=>x.accessible),true);
  assert.equal((await api(ticketPath,'POST',other.secret)).status,403);
  const issued=await api(ticketPath,'POST',buyer.secret);
  assert.equal(issued.status,200);
  const [first,second]=await Promise.all([api(issued.data.url),api(issued.data.url)]);
  assert.deepEqual([first.status,second.status].sort(),[200,410]);
  assert.equal((first.status===200?first:second).data,'private-original');
  const next=await api(ticketPath,'POST',buyer.secret);
  assert.equal(next.status,200);
  await pool.query("UPDATE orders SET status='refunded' WHERE id=$1",[order.id]);
  assert.equal((await api(next.data.url)).status,410);
  assert.equal((await api(ticketPath,'POST',buyer.secret)).status,403);
  // Real PostgreSQL integration: a verified Telegram owner callback grants exactly one entitlement.
  const botCalls=[];
  const telegramConfig={...options,TELEGRAM_ENABLED:'true',TELEGRAM_BOT_TOKEN:'123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef',TELEGRAM_WEBHOOK_SECRET:'integration-secret-123456',TELEGRAM_ADMIN_CHAT_ID:'123456789',TELEGRAM_WEBHOOK_URL:'https://example.test/api/v2/telegram/webhook'};
  const botCommerce=createCommerce(telegramConfig,{
   sendMail:async message=>emails.push(message),
   driveToken:async()=> 'test-drive-token',
   telegramFetch:async(url,request)=>{botCalls.push({method:url.split('/').at(-1),payload:JSON.parse(request.body)});return new Response(JSON.stringify({ok:true,result:true}),{status:200});}
  });
  const botServer=http.createServer(async(req,res)=>{await botCommerce.handle(req,res,new URL(req.url,'http://localhost'));});
  try{
   await new Promise(resolve=>botServer.listen(0,'127.0.0.1',resolve));
   assert.equal((await api('/api/v2/cart','PUT',buyer.secret,{productCodes:['routine5']})).status,200);
   const pending=await api('/api/v2/orders','POST',buyer.secret,{idempotencyKey:crypto.randomUUID()});
   assert.equal(pending.status,201);
   const botOrder=pending.data.order.id;
   const botBase='http://127.0.0.1:'+botServer.address().port;
   const callback=async(updateId,userId,action)=>fetch(botBase+'/api/v2/telegram/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':telegramConfig.TELEGRAM_WEBHOOK_SECRET},body:JSON.stringify({update_id:updateId,callback_query:{id:'query-'+updateId,from:{id:userId},message:{chat:{id:userId}},data:action+':'+botOrder}})});
   assert.equal((await callback(100,999999999,'approve')).status,200);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM entitlements WHERE order_id=$1',[botOrder])).rows[0].n,0);
   assert.equal((await callback(101,123456789,'confirm')).status,200);
   assert.equal((await callback(102,123456789,'approve')).status,200);
   assert.equal((await callback(102,123456789,'approve')).status,200);
   assert.equal((await pool.query('SELECT count(*)::int AS n FROM entitlements WHERE order_id=$1',[botOrder])).rows[0].n,1);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM order_events WHERE order_id=$1 AND event_type='manual_approved'",[botOrder])).rows[0].n,1);
   assert.equal(botCalls.filter(call=>call.method==='sendMessage').length,2);
  }finally{
   await new Promise(resolve=>botServer.close(resolve));
   await botCommerce.close();
  }
  const loginEmail='new-'+suffix+'@example.test';
  const requested=await api('/api/v2/auth/start','POST',null,{email:loginEmail});
  assert.equal(requested.status,202);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM customer_activity a JOIN customers c ON c.id=a.customer_id WHERE c.email=$1 AND a.kind='registered'",[loginEmail])).rows[0].n,0);
  const match=/#ticket=([a-zA-Z0-9_-]+)/.exec(emails.at(-1).text);
  assert.ok(match);
  const signed=await api('/api/v2/auth/redeem','POST',null,{ticket:match[1]});
  assert.equal(signed.status,200);
  assert.equal((await api('/api/v2/auth/redeem','POST',null,{ticket:match[1]})).status,410);
  assert.equal((await api('/api/v2/me','GET',signed.data.accessToken)).status,200);
  await api('/api/v2/auth/logout','POST',signed.data.accessToken);
  assert.equal((await api('/api/v2/me','GET',signed.data.accessToken)).status,401);
  await api('/api/v2/auth/start','POST',null,{email:loginEmail});
  const nextLogin=/#ticket=([a-zA-Z0-9_-]+)/.exec(emails.at(-1).text)[1];
  assert.equal((await api('/api/v2/auth/redeem','POST',null,{ticket:nextLogin})).status,200);
  const registered=await pool.query("SELECT a.id,a.attempts FROM customer_activity a JOIN customers c ON c.id=a.customer_id WHERE c.email=$1 AND a.kind='registered'",[loginEmail]);
  assert.equal(registered.rowCount,1);
  const activityMessages=[];
  let rejectRegistration=true;
  const activityBot=require('../telegram').createTelegramBot(telegramConfig,{pool,approveOrder:async()=>{},fetchImpl:async(url,request)=>{
   const payload=JSON.parse(request.body);
   if(rejectRegistration&&payload.text?.includes('Новый зарегистрированный покупатель'))return new Response('{"ok":false}',{status:503});
   activityMessages.push(payload);
   return new Response('{"ok":true,"result":true}',{status:200});
  }});
  await activityBot.flushNotifications();
  const retry=await pool.query('SELECT sent_at,attempts FROM customer_activity WHERE id=$1',[registered.rows[0].id]);
  assert.equal(retry.rows[0].sent_at,null);
  assert.equal(retry.rows[0].attempts,1);
  rejectRegistration=false;
  await activityBot.flushNotifications();
  const delivered=activityMessages.filter(x=>x.text?.includes('Новый зарегистрированный покупатель'));
  assert.equal(delivered.length,1);
  assert.ok(delivered[0].text.includes(loginEmail));
  assert.ok(activityMessages.some(x=>x.text?.includes('Добавлено: YEAH X LA VIDA ES UN CARNAVAL')));
  const beforeRetry=activityMessages.length;
  await activityBot.flushNotifications();
  assert.equal(activityMessages.length,beforeRetry);
  assert.throws(()=>createCommerce({...options,SMTP_PASSWORD:''}),/Commerce config missing: SMTP_PASSWORD/);
  // The owner panel stays available before Gmail and private Drive delivery are provisioned.
  const monitorConfig={
   COMMERCE_ENABLED:'false',TELEGRAM_ENABLED:'true',DATABASE_URL:testDatabase,
   TELEGRAM_BOT_TOKEN:'123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef',
   TELEGRAM_BOT_USERNAME:'Routinepack_bot',
   TELEGRAM_ADMIN_CHAT_ID:'123456789',
   TELEGRAM_WEBHOOK_URL:'https://example.test/api/v2/telegram/webhook'
  };
  const monitorCalls=[];
  const monitor=createCommerce(monitorConfig,{telegramFetch:async(url,request)=>{
   monitorCalls.push({method:url.split('/').at(-1),payload:JSON.parse(request.body)});
   return new Response(JSON.stringify({ok:true,result:url.endsWith('/getMe')?{username:'Routinepack_bot'}:true}),{status:200});
  }});
  const monitorServer=http.createServer(async(req,res)=>{
   const handled=await monitor.handle(req,res,new URL(req.url,'http://localhost'));
   if(!handled){res.writeHead(404);res.end();}
  });
  try{
   await new Promise(resolve=>monitorServer.listen(0,'127.0.0.1',resolve));
   const monitorBase='http://127.0.0.1:'+monitorServer.address().port;
   assert.equal((await fetch(monitorBase+'/api/v2/catalog')).status,404);
   const derivedSecret=crypto.createHmac('sha256',monitorConfig.TELEGRAM_BOT_TOKEN).update('routinepack-telegram-webhook-v1').digest('hex');
   const update={update_id:2000000+Math.floor(Math.random()*1000000),message:{from:{id:123456789},chat:{id:123456789},text:'/stats'}};
   const notify=secret=>fetch(monitorBase+'/api/v2/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':secret,'Content-Type':'application/json'},body:JSON.stringify(update)});
   assert.equal((await notify('invalid')).status,401);
   assert.equal((await notify(derivedSecret)).status,200);
   assert.ok(monitorCalls.some(x=>x.method==='sendMessage'&&x.payload.text.includes('Заказов:')));
  }finally{
   await new Promise(resolve=>monitorServer.close(resolve));
   await monitor.close();
  }
  const gmailCalls=[];
  const gmailConfig={...options,MAIL_PROVIDER:'gmail_api',GMAIL_OAUTH_CLIENT_ID:'test-client',GMAIL_OAUTH_CLIENT_SECRET:'test-secret',GMAIL_OAUTH_REFRESH_TOKEN:'test-refresh'};
  delete gmailConfig.SMTP_PASSWORD;
  const gmailCommerce=createCommerce(gmailConfig,{
   gmailAccessToken:async()=>({token:'mock-access-token'}),
   fetch:async(url,request)=>{gmailCalls.push({url,request});return new Response('{"id":"mock-message"}',{status:200});}
  });
  const gmailServer=http.createServer(async(req,res)=>gmailCommerce.handle(req,res,new URL(req.url,'http://localhost')));
  try{
   await new Promise(resolve=>gmailServer.listen(0,'127.0.0.1',resolve));
   const sent=await fetch('http://127.0.0.1:'+gmailServer.address().port+'/api/v2/auth/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'gmail-'+suffix+'@example.test'})});
   assert.equal(sent.status,202);
   assert.equal(gmailCalls.length,1);
   assert.equal(gmailCalls[0].url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
   assert.equal(gmailCalls[0].request.headers.Authorization,'Bearer mock-access-token');
   const mime=Buffer.from(JSON.parse(gmailCalls[0].request.body).raw,'base64url').toString('utf8');
   assert.match(mime,new RegExp('To: gmail-'+suffix+'@example\\.test'));
  }finally{
   await new Promise(resolve=>gmailServer.close(resolve));
   await gmailCommerce.close();
  }
  const resendCalls=[];
  let resendFailure=false;
  const resendConfig={...options,MAIL_PROVIDER:'resend',RESEND_API_KEY:'test-resend-key',SMTP_FROM:'Routine Pack <orders@example.test>'};
  delete resendConfig.SMTP_PASSWORD;
  assert.throws(()=>createCommerce({...resendConfig,RESEND_API_KEY:''}),/Commerce config missing: RESEND_API_KEY/);
  const resendCommerce=createCommerce(resendConfig,{fetch:async(url,request)=>{
   resendCalls.push({url,headers:request.headers,body:JSON.parse(request.body)});
   return new Response(resendFailure?'{"message":"provider detail must not leak"}':'{"id":"test-message"}',{status:resendFailure?503:200});
  }});
  const resendServer=http.createServer(async(req,res)=>resendCommerce.handle(req,res,new URL(req.url,'http://localhost')));
  try{
   await new Promise(resolve=>resendServer.listen(0,'127.0.0.1',resolve));
   const endpoint='http://127.0.0.1:'+resendServer.address().port;
   const login=()=>fetch(endpoint+'/api/v2/auth/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'resend-'+suffix+'@example.test'})});
   assert.equal((await login()).status,202);
   const sent=resendCalls[0];
   assert.equal(sent.url,'https://api.resend.com/emails');
   assert.equal(sent.headers.Authorization,'Bearer test-resend-key');
   assert.deepEqual(sent.body.to,['resend-'+suffix+'@example.test']);
   assert.equal(sent.body.from,resendConfig.SMTP_FROM);
   assert.match(sent.headers['Idempotency-Key'],/^signin\/[a-f0-9]{64}$/);
   const ticket=/#ticket=([a-zA-Z0-9_-]+)/.exec(sent.body.text)[1];
   const redeemed=await fetch(endpoint+'/api/v2/auth/redeem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket})});
   assert.equal(redeemed.status,200);
   resendFailure=true;
   const failed=await login();
   assert.equal(failed.status,503);
   assert.equal((await failed.json()).error,'Service temporarily unavailable.');
   await resendCommerce.flushNotifications();
   const pending=await pool.query('SELECT id,order_id,sent_at,attempts FROM notification_outbox ORDER BY id');
   assert.ok(pending.rows.length>0);
   assert.ok(pending.rows.every(row=>row.sent_at===null&&row.attempts===1));
   resendFailure=false;
   await resendCommerce.flushNotifications();
   assert.ok((await pool.query('SELECT sent_at FROM notification_outbox')).rows.every(row=>row.sent_at));
   for(const row of pending.rows){
    const attempts=resendCalls.filter(call=>call.headers['Idempotency-Key']==='order/'+row.order_id+'/approved');
    assert.equal(attempts.length,2);
    assert.deepEqual(attempts[0].body,attempts[1].body);
    assert.ok(attempts[1].body.text.includes('/account/'));
   }
   const count=resendCalls.length;
   await resendCommerce.flushNotifications();
   assert.equal(resendCalls.length,count);
  }finally{
   await new Promise(resolve=>resendServer.close(resolve));
   await resendCommerce.close();
  }
  const otpEmail='otp-'+suffix+'@example.test';
  const started=await api('/api/v2/auth/code/start','POST',null,{email:otpEmail,nickname:'DJ Test'});
  assert.equal(started.status,202);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM customer_activity a JOIN customers c ON c.id=a.customer_id WHERE c.email=$1 AND a.kind='registered'",[otpEmail])).rows[0].n,0);
  const otpCode=/confirmation code: (\d{8})/.exec(emails.at(-1).text)[1];
  const otpChallenge={challengeId:started.data.challengeId,code:otpCode};
  const wrongCode=otpCode==='00000000'?'11111111':'00000000';
  assert.equal((await api('/api/v2/auth/code/verify','POST',null,{...otpChallenge,code:wrongCode})).status,400);
  const concurrent=await Promise.all([api('/api/v2/auth/code/verify','POST',null,otpChallenge),api('/api/v2/auth/code/verify','POST',null,otpChallenge)]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,410]);
  const otpSession=concurrent.find(r=>r.status===200).data.accessToken;
  const otpProfile=await api('/api/v2/me','GET',otpSession);
  assert.equal(otpProfile.data.email,otpEmail);assert.equal(otpProfile.data.nickname,'DJ Test');
  const locked=await api('/api/v2/auth/code/start','POST',null,{email:otpEmail});
  const lockedCode=/confirmation code: (\d{8})/.exec(emails.at(-1).text)[1];
  for(let i=0;i<5;i++)assert.equal((await api('/api/v2/auth/code/verify','POST',null,{challengeId:locked.data.challengeId,code:lockedCode==='00000000'?'11111111':'00000000'})).status,400);
  assert.equal((await api('/api/v2/auth/code/verify','POST',null,{challengeId:locked.data.challengeId,code:lockedCode})).status,410);
  assert.deepEqual((await api('/api/v2/auth/providers')).data,{google:false,facebook:false,apple:false});
  assert.equal((await api('/api/v2/auth/oauth/google?origin=https://evil.example')).status,503);

 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(commerce)await commerce.close();
  await pool.end();
 }
});
})(require,module);
