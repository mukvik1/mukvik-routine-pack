(function legacyTest(require,module){
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const net=require('node:net');
const {spawn}=require('node:child_process');
const path=require('node:path');
test('legacy invoice creation disabled; historical status routes remain',async()=>{
 const probe=net.createServer();
 await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
 const port=probe.address().port;
 await new Promise(resolve=>probe.close(resolve));
 const child=spawn(process.execPath,[path.join(__dirname,'..','server.js')],{env:{...process.env,PORT:String(port),NOWPAYMENTS_API_KEY:'test-only',NOWPAYMENTS_IPN_SECRET:'test-only',PRODUCT_DELIVERY_URL:'https://example.invalid/private'},stdio:'ignore'});
 try{
  let ready=false;
  for(let i=0;i<80;i++){
   if(child.exitCode!==null)throw Error('server stopped during test');
   try{const res=await fetch('http://127.0.0.1:'+port+'/api/payment-status');if(res.status===400){ready=true;break;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.ok(ready,'server did not start');
  const invoice=await fetch('http://127.0.0.1:'+port+'/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:'pack'})});
  assert.equal(invoice.status,410);
  const body=await invoice.json();
  assert.ok(!('invoiceUrl' in body));
  const badStatus=await fetch('http://127.0.0.1:'+port+'/api/payment-status?order=invalid');
  assert.equal(badStatus.status,400);
  const callback=await fetch('http://127.0.0.1:'+port+'/api/nowpayments-ipn',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(callback.status,401);
  const staticPage=await fetch('http://127.0.0.1:'+port+'/');
  assert.equal(staticPage.status,200);
  const cssUrl='http://127.0.0.1:'+port+'/storefront-refresh.css';
  const compressed=await fetch(cssUrl,{headers:{'Accept-Encoding':'gzip'}});
  assert.equal(compressed.headers.get('content-encoding'),'gzip');
  assert.match(compressed.headers.get('vary'),/Accept-Encoding/i);
  assert.match(await compressed.text(),/\.rp-ticker/);
  const cached=await fetch(cssUrl,{headers:{'If-None-Match':compressed.headers.get('etag')}});
  assert.equal(cached.status,304);
  const partial=await fetch(cssUrl,{headers:{Range:'bytes=0-15','Accept-Encoding':'gzip'}});
  assert.equal(partial.status,206);
  assert.equal(partial.headers.get('content-encoding'),null);
  assert.equal((await partial.arrayBuffer()).byteLength,16);
  const head=await fetch(cssUrl,{method:'HEAD',headers:{'Accept-Encoding':'gzip;q=0'}});
  assert.equal(head.status,200);
  assert.equal(head.headers.get('content-encoding'),null);
  assert.ok(Number(head.headers.get('content-length'))>16);
  assert.equal((await head.arrayBuffer()).byteLength,0);
  for (const preview of ['/assets/free-videos/one-more-time.mp4','/assets/individual-previews/tell-me-why-trust-me.mp4','/assets/videos/stream-1/init.mp4','/assets/lesson-previews/pack-1-blurred.mp4']) {
   const guest=await fetch('http://127.0.0.1:'+port+preview,{headers:{Range:'bytes=0-15'}});
   assert.equal(guest.status,401);
  }
 }finally{
  child.kill();
  await new Promise(resolve=>child.once('exit',resolve));
 }
});
})(require,module);
