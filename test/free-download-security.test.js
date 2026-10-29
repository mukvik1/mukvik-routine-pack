'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {Pool}=require('pg');
const {createCommerce}=require('../commerce');

test('Free delivery requires a verified active session and journals each transfer',{
 skip:!process.env.FREE_TEST_DATABASE_URL
},async()=>{
 const schema='free_test_'+crypto.randomBytes(8).toString('hex');
 const adminPool=new Pool({connectionString:process.env.FREE_TEST_DATABASE_URL});
 await adminPool.query('CREATE SCHEMA '+schema);
 const connection=new URL(process.env.FREE_TEST_DATABASE_URL);
 connection.searchParams.set('options','-c search_path='+schema);
 const pool=new Pool({connectionString:connection.href});
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'free-security-'));
 let commerce,server;
 try{
  for(const migration of ['001_commerce.sql','004_free_downloads.sql','004_free_downloads.sql']){
   await pool.query(await fs.readFile(path.join(__dirname,'..','db',migration),'utf8'));
  }
  const slug='get-right-x-just-a-lil-bit',bytes=Buffer.from('PK-private-free-archive');
  await fs.writeFile(path.join(directory,slug+'.zip'),bytes);
  commerce=createCommerce({COMMERCE_ENABLED:'true',DATABASE_URL:connection.href,
   WEB_ORIGIN:'https://routinepack.download',ADMIN_EMAIL:'owner@example.test',
   MAIL_PROVIDER:'resend',RESEND_API_KEY:'test',SMTP_FROM:'test@example.test',
   GOOGLE_SERVICE_ACCOUNT_JSON:'{}',COMMERCE_FILES_JSON:'{}'
  },{freeDownloadsRoot:directory,sendMail:async()=>{}});
  server=http.createServer(async(req,res)=>{await commerce.handle(req,res,new URL(req.url,'http://localhost'));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  async function session(email,verified=true){
   const id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('base64url');
   await pool.query('INSERT INTO customers(id,email,email_verified_at) VALUES($1,$2,$3)',[id,email,verified?new Date():null]);
   await pool.query("INSERT INTO sessions(token_hash,customer_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[crypto.createHash('sha256').update(token).digest('hex'),id]);
   return token;
  }
  const buyer=await session('buyer@example.test'),unverified=await session('pending@example.test',false),owner=await session('owner@example.test');
  const request=(url,token,method='POST')=>fetch(base+url,{method,headers:token?{Authorization:'Bearer '+token}:{}});
  const endpoint='/api/v2/free/'+slug+'/download';
  for(const secret of [undefined,'x'.repeat(43)])assert.equal((await request(endpoint,secret)).status,401);
  assert.equal((await request(endpoint,unverified)).status,403);
  assert.equal((await request(endpoint,buyer,'GET')).status,404);
  assert.equal((await request('/api/v2/free/unknown/download',buyer)).status,404);
  assert.equal((await request('/api/v2/free/rihanna-routine/download',buyer)).status,503);
  assert.equal((await pool.query('SELECT * FROM free_downloads')).rowCount,0);
  for(let i=0;i<2;i++){
   const result=await request(endpoint,buyer);
   assert.equal(result.status,200);
   assert.equal(result.headers.get('cache-control'),'private, no-store');
   assert.equal(result.headers.get('content-type'),'application/zip');
   assert.deepEqual(Buffer.from(await result.arrayBuffer()),bytes);
  }
  // The response may finish just before the asynchronous completion journal update.
  let rows;
  for(let i=0;i<50;i++){
   rows=(await pool.query('SELECT * FROM free_downloads ORDER BY id')).rows;
   if(rows.length===2&&rows.every(r=>r.status==='completed'))break;
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(rows.length,2);
  for(const row of rows){assert.equal(row.email,'buyer@example.test');assert.equal(row.routine_name,'GET RIGHT × JUST A LIL BIT');assert.equal(row.status,'completed');assert.ok(row.started_at);assert.ok(row.finished_at);}
  assert.equal((await request('/api/v2/admin/free-downloads',buyer,'GET')).status,403);
  const report=await (await request('/api/v2/admin/free-downloads',owner,'GET')).json();
  assert.equal(report.totals[0].downloads,2);assert.equal(report.totals[0].completed_downloads,2);
  await pool.query('UPDATE sessions SET revoked_at=now() WHERE customer_id=(SELECT id FROM customers WHERE email=$1)',['buyer@example.test']);
  assert.equal((await request(endpoint,buyer)).status,401);
  assert.equal((await pool.query('SELECT * FROM free_downloads')).rowCount,2);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(commerce)await commerce.close();
  await pool.end();
  await adminPool.query('DROP SCHEMA '+schema+' CASCADE');
  await adminPool.end();
  await fs.rm(directory,{recursive:true,force:true});
 }
});
