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
  const loginEmail='new-'+suffix+'@example.test';
  const requested=await api('/api/v2/auth/start','POST',null,{email:loginEmail});
  assert.equal(requested.status,202);
  const match=/#ticket=([a-zA-Z0-9_-]+)/.exec(emails.at(-1).text);
  assert.ok(match);
  const signed=await api('/api/v2/auth/redeem','POST',null,{ticket:match[1]});
  assert.equal(signed.status,200);
  assert.equal((await api('/api/v2/auth/redeem','POST',null,{ticket:match[1]})).status,410);
  assert.equal((await api('/api/v2/me','GET',signed.data.accessToken)).status,200);
  await api('/api/v2/auth/logout','POST',signed.data.accessToken);
  assert.equal((await api('/api/v2/me','GET',signed.data.accessToken)).status,401);
  assert.throws(()=>createCommerce({...options,SMTP_PASSWORD:''}),/Commerce config missing: SMTP_PASSWORD/);
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
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(commerce)await commerce.close();
  await pool.end();
 }
});
})(require,module);
