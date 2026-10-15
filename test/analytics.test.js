'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {createAnalytics,sectionFor}=require('../analytics');

test('traffic records valid site visits without saving IP or user agent',async()=>{
 const queries=[];
 const pool={query:async(sql,args)=>{queries.push({sql,args});return {rows:[]};},end:async()=>{}};
 const analytics=createAnalytics({DATABASE_URL:'test',TELEGRAM_BOT_TOKEN:'123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef'},{pool});
 assert.equal(await analytics.ready,true);
 async function request(path,origin='https://routinepack.download',ua='Mozilla/5.0 Test browser'){
  const req=Readable.from([path]);req.headers={origin,'user-agent':ua,'x-forwarded-for':'203.0.113.7'};
  let status;const res={writeHead:code=>{status=code;},end:()=>{}};
  await analytics.handle(req,res);return status;
 }
 assert.equal(await request('/free/get-right-x-just-a-lil-bit/'),204);
 const insert=queries.find(x=>x.sql.startsWith('INSERT INTO site_traffic'));
 assert.ok(insert);assert.equal(insert.args[2],'free');assert.match(insert.args[1],/^[a-f0-9]{64}$/);
 assert.equal(JSON.stringify(queries).includes('203.0.113.7'),false);
 const count=queries.filter(x=>x.sql.startsWith('INSERT INTO site_traffic')).length;
 assert.equal(await request('/free/','https://evil.example'),403);
 assert.equal(await request('/free/','https://routinepack.download','Googlebot'),204);
 assert.equal(await request('/unknown/'),204);
 assert.equal(queries.filter(x=>x.sql.startsWith('INSERT INTO site_traffic')).length,count);
 assert.equal(sectionFor('/packs/routine-01/'),'packs');
 await analytics.close();
});
