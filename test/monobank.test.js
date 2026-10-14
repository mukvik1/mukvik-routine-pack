'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {Readable} = require('node:stream');
const {createMonobank,uahKopiykas,isTrustedCheckoutUrl,verifySignature} = require('../monobank');

test('USD price is converted to exact integer kopeks, without client prices', () => {
  assert.equal(uahKopiykas(4900, 41.25),202125);
  assert.equal(uahKopiykas(500, 41.20),20600);
  assert.throws(() => uahKopiykas(0, 41));
  assert.throws(() => uahKopiykas(100, Infinity));
  assert.throws(() => uahKopiykas(100, NaN));
  assert.throws(() => uahKopiykas(100, -2));
});

test('Only HTTPS Monobank payment hosts can be returned to buyers', () => {
  assert.equal(isTrustedCheckoutUrl('https://pay.mbnk.biz/p2_example'),true);
  assert.equal(isTrustedCheckoutUrl('https://pay.monobank.ua/example'),true);
  assert.equal(isTrustedCheckoutUrl('http://pay.mbnk.biz/p2_example'),false);
  assert.equal(isTrustedCheckoutUrl('https://pay.mbnk.biz.evil.test/'),false);
  assert.equal(isTrustedCheckoutUrl('https://evil.test/'),false);
  assert.equal(isTrustedCheckoutUrl('https://user:pass@pay.mbnk.biz/'),false);
  assert.equal(isTrustedCheckoutUrl('not a url'),false);
});

test('Webhook ECDSA signatures are checked against the original raw body', () => {
  const keys=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const body=Buffer.from('{"status":"success","amount":10000}', 'utf8');
  const pubkey=Buffer.from(keys.publicKey.export({type:'spki',format:'pem'})).toString('base64');
  const signature=crypto.sign('sha256',body,keys.privateKey).toString('base64');
  assert.equal(verifySignature(body,signature,pubkey),true);
  assert.equal(verifySignature(Buffer.from('{"status":"success","amount":1}'),signature,pubkey),false);
  assert.equal(verifySignature(body,'incorrect',pubkey),false);
});

test('Monobank integration defaults to OFF; enabled mode requires credentials', () => {
  assert.equal(createMonobank({MONOBANK_ENABLED:'false'}),null);
  assert.throws(()=>createMonobank({MONOBANK_ENABLED:'true'},{}),/config missing/);
});

test('checkout requires explicit immediate digital delivery consent', async () => {
  const mono=createMonobank({MONOBANK_ENABLED:'true',MONOBANK_TOKEN:'test-only',PUBLIC_ORIGIN:'https://api.example.test'},
    {pool:{connect:async()=>{throw new Error('database must not be used without consent');}}});
  const res={writeHead(code){this.code=code;},end(body){this.body=JSON.parse(body);}};
  await mono.checkout(res,'d482b8f8-8d36-49d9-ac09-4077a802d77b',{id:'buyer'},false);
  assert.equal(res.code,400);
  assert.match(res.body.error,/immediate digital delivery/);
});

test('signed success grants access and queues buyer and owner notices only for the exact UAH invoice', async () => {
  const keys=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const pubkey=Buffer.from(keys.publicKey.export({type:'spki',format:'pem'})).toString('base64');
  const order='d482b8f8-8d36-49d9-ac09-4077a802d77b';
  const state={status:'created',modified_at:null,order_status:'awaiting_manual_review'};
  const writes=[];
  const db={query:async(sql,args=[])=>{
    if(sql.startsWith('SELECT i.id'))return {rowCount:1,rows:[{id:1,order_id:order,amount_kop:202125,customer_id:'buyer-id',...state}]};
    if(sql.startsWith('UPDATE monobank_invoices')){state.status=args[1];state.modified_at=args[2];}
    if(sql.startsWith('UPDATE orders'))state.order_status=sql.includes("'approved'")?'approved':'refunded';
    if(sql.startsWith('INSERT'))writes.push(sql);
    return {rowCount:1,rows:[]};
  },release(){}};
  const mono=createMonobank({MONOBANK_ENABLED:'true',MONOBANK_TOKEN:'test-only',PUBLIC_ORIGIN:'https://api.example.test',WEB_ORIGIN:'https://routinepack.download'},
    {pool:{connect:async()=>db},fetch:async()=>new Response(JSON.stringify({key:pubkey}),{status:200})});
  async function deliver(payload,valid=true){
    const raw=Buffer.from(JSON.stringify(payload));
    const signed=crypto.sign('sha256',raw,keys.privateKey).toString('base64');
    const req=Readable.from([raw]);req.headers={'x-sign':valid?signed:'invalid'};
    const res={writeHead(code){this.code=code;},end(){}};
    await mono.webhook(req,res);return res.code;
  }
  const payload={invoiceId:'p2_invoice',status:'success',reference:order,amount:202125,ccy:980,modifiedDate:'2026-10-13T18:00:00Z'};
  assert.equal(await deliver(payload,false),401);
  assert.equal(await deliver({...payload,amount:1}),409);
  assert.equal(await deliver({...payload,ccy:840}),409);
  assert.equal(writes.length,0);
  assert.equal(await deliver(payload),200);
  assert.equal(state.order_status,'approved');
  assert.ok(writes.some(sql=>sql.includes('INSERT INTO entitlements')));
  assert.ok(writes.some(sql=>sql.includes("notification_outbox(order_id,kind)")));
  assert.ok(writes.some(sql=>sql.includes("telegram_notifications(order_id,kind)")&&sql.includes("monobank_paid")));
  const count=writes.length;
  assert.equal(await deliver(payload),200);
  assert.equal(writes.length,count);
  assert.equal(await deliver({...payload,status:'reversed',modifiedDate:'2026-10-13T19:00:00Z'}),200);
  assert.equal(state.order_status,'refunded');
  assert.ok(writes.some(sql=>sql.includes("telegram_notifications(order_id,kind)")&&sql.includes("monobank_reversed")));
});
