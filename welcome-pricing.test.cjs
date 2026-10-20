'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const pricing=require('./welcome-pricing');
const source=fs.readFileSync(__dirname+'/commerce.js','utf8');
const CATALOG=vm.runInNewContext('('+source.match(/const CATALOG=Object.freeze\(([\s\S]*?)\);/)[1]+')');
const newOrderSource=source.slice(source.indexOf('async function newOrder('),source.indexOf('async function me('));
function fixture({createdAt='2026-10-20T08:00:00Z',codes=['pack'],existing=[]}={}){
 const state={createdAt,cart:[...codes],orders:existing.map(o=>({...o})),items:existing.map(o=>({orderId:o.id,code:'pack',price:o.total_cents})),mutex:Promise.resolve()};
 const pool={connect:async()=>{
  let release;
  return {release(){},async query(sql,values=[]){
   if(sql==='BEGIN')return {rows:[],rowCount:0};
   if(sql==='COMMIT'||sql==='ROLLBACK'){release?.();release=null;return {rows:[],rowCount:0};}
   if(sql.startsWith('SELECT id FROM customers')){const prior=state.mutex;state.mutex=new Promise(r=>release=r);await prior;return {rows:[{id:values[0]}],rowCount:1};}
   if(sql.includes('FROM orders WHERE customer_id=$1 AND idempotency_key=$2')){const rows=state.orders.filter(o=>o.key===values[1]);return {rows,rowCount:rows.length};}
   if(sql.startsWith('SELECT product_code FROM cart_items'))return {rows:state.cart.map(code=>({product_code:code})),rowCount:state.cart.length};
   if(sql.includes('AS welcome_eligible'))return {rows:[{welcome_eligible:new Date(state.createdAt)>=new Date(values[1])&&!state.orders.some(o=>o.status!=='cancelled'&&state.items.some(i=>i.orderId===o.id&&i.code==='pack'))}],rowCount:1};
   if(sql.startsWith('INSERT INTO orders(')){const row={id:values[0],key:values[2],total_cents:values[3],status:'awaiting_manual_review'};state.orders.push(row);return {rows:[row],rowCount:1};}
   if(sql.startsWith('INSERT INTO order_items')){state.items.push({orderId:values[0],code:values[1],price:values[3]});return {rows:[],rowCount:1};}
   if(sql.startsWith('INSERT INTO order_events'))return {rows:[],rowCount:1};
   if(sql.startsWith('DELETE FROM cart_items')){state.cart=[];return {rows:[],rowCount:1};}
   throw Error('Unexpected SQL: '+sql);
  }};
 }};
 const handler=vm.runInNewContext('('+newOrderSource+')',{crypto,pool,CATALOG,uuidPattern:/^[0-9a-f-]{36}$/,body:async req=>req.payload,response:(res,status,data)=>Object.assign(res,{status,data}),welcomeEligible:pricing.welcomeEligible,priceProducts:pricing.priceProducts,telegram:null,monobank:true});
 return {state,async order(key=crypto.randomUUID()){const res={};await handler({payload:{idempotencyKey:key}},res,{id:'customer'});return res;}};
}
test('new account gets $39.20 in both order total and pack item; other items stay full price',async()=>{
 const f=fixture({codes:['pack','bundle4']});const result=await f.order();assert.equal(result.status,201);assert.equal(result.data.order.total_cents,4320);assert.equal(f.state.items.find(i=>i.code==='pack').price,3920);assert.equal(f.state.items.find(i=>i.code==='bundle4').price,400);
});
test('existing accounts keep the regular $49 pack price',async()=>{const f=fixture({createdAt:'2026-10-19T00:00:00Z'});assert.equal((await f.order()).data.order.total_cents,4900);});
test('retrying an idempotency key returns the original discounted order',async()=>{const f=fixture();const key=crypto.randomUUID();await f.order(key);assert.equal((await f.order(key)).data.order.total_cents,3920);assert.equal(f.state.orders.length,1);});
test('an account cannot create a second welcome-priced pack order',async()=>{const f=fixture();await f.order();f.state.cart=['pack'];assert.equal((await f.order()).data.order.total_cents,4900);});
test('concurrent order requests cannot spend the welcome offer twice',async()=>{const f=fixture();const results=await Promise.all([f.order(),f.order()]);assert.deepEqual(results.map(r=>r.status).sort(),[201,400]);assert.equal(f.state.orders.length,1);});
test('cancelled orders release the offer; refunded purchases do not reset it',async()=>{
 for(const [status,total] of [['cancelled',3920],['refunded',4900],['approved',4900]]){const f=fixture({existing:[{id:'prior',status,total_cents:3920}]});assert.equal((await f.order()).data.order.total_cents,total,status);}
});
test('a routine-only order never receives the full-pack welcome discount',async()=>{const f=fixture({codes:['routine3','routine5','routine7','routine8','routine9']});assert.equal((await f.order()).data.order.total_cents,1400);});
