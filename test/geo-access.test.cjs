const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGeoAccess,clientIp}=require('../geo-access');
function run({ip='77.88.8.8',path='/',method='GET',headers={},railwayProxy=true,lookup}={}){
 const req={method,headers:{'x-real-ip':ip,...headers},socket:{remoteAddress:'8.8.8.8'}};
 const res={headers:{},setHeader(k,v){this.headers[k]=v},writeHead(status,h){this.status=status;Object.assign(this.headers,h)},end(body){this.body=body}};
 const handled=createGeoAccess({railwayProxy,...(lookup?{lookup}:{})})(req,res,new URL(path,'https://routinepack.download'));
 return {handled,res};
}
test('RU is denied across pages, sessions, auth, purchases and direct files',()=>{
 for(const path of ['/','/free/','/api/v2/auth/password/register/start','/api/v2/auth/password/register/confirm','/api/v2/auth/oauth/google/callback','/api/v2/me','/api/v2/free/macarena-gasolina/download','/api/v2/download/ticket','/downloads/test.zip','/api/v2/orders']){
  const {handled,res}=run({path,method:'POST'});assert.equal(handled,true,path);assert.equal(res.status,403);assert.match(res.headers['Cache-Control'],/no-store/);
 }
});
test('UA and other countries are allowed without relying on language/email',()=>{
 for(const country of ['UA','DE','US','TH',null])assert.equal(run({lookup:()=>({country})}).handled,false);
 assert.equal(run({ip:'8.8.8.8',headers:{'cf-ipcountry':'RU'}}).handled,false);
});
test('a forged country header cannot bypass RU and IPv6/mapped addresses are covered',()=>{
 assert.equal(run({headers:{'cf-ipcountry':'UA','x-forwarded-for':'8.8.8.8'}}).handled,true);
 assert.equal(run({ip:'::ffff:77.88.8.8'}).handled,true);
 assert.equal(run({ip:'2a02:6b8::2:242'}).handled,true);
});
test('trusted proxy configuration, malformed IPs, and direct origins',()=>{
 assert.equal(clientIp({headers:{'x-real-ip':'77.88.8.8'},socket:{remoteAddress:'8.8.8.8'}},false),'8.8.8.8');
 assert.equal(run({railwayProxy:false}).handled,false);
 assert.equal(clientIp({headers:{'x-real-ip':'77.88.8.8,8.8.8.8'}},true),null);
});
test('only exact POST provider webhooks are exempt; OAuth and GET callbacks are not',()=>{
 for(const path of ['/api/v2/telegram/webhook','/api/v2/monobank/webhook','/api/nowpayments-ipn']){
  assert.equal(run({path,method:'POST'}).handled,false);assert.equal(run({path}).handled,true);
 }
 assert.equal(run({path:'/api/v2/telegram/webhook/extra',method:'POST'}).handled,true);
});
