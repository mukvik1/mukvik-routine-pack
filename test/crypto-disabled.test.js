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
 }finally{
  child.kill();
  await new Promise(resolve=>child.once('exit',resolve));
 }
});
})(require,module);
