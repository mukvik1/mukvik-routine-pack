'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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
