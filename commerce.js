(function commerceModule(require,module,exports){
'use strict';
const crypto=require('node:crypto');
const {validPassword,hashPassword,verifyPassword}=require('./passwords');
const {Readable}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const CATALOG=Object.freeze({
 pack:{name:'ROUTINE PACK VOLUME 1',cents:4900},
 bundle4:{name:'4 ROUTINES BUNDLE',cents:600},
 routine3:{name:'YEAH X LA VIDA ES UN CARNAVAL',cents:600},
 routine5:{name:'NOT LIKE US X CANDY SHOP',cents:500},
 routine7:{name:'MACARENA X CANDY SHOP',cents:500},
 routine8:{name:"LEVITATION TO CAN'T STOP X ROMPE",cents:500},
 routine9:{name:'I KHOW YOU WANT ME X CHANDELIER',cents:500}
});
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validEmail=email=>email.length>=5&&email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const token=()=>crypto.randomBytes(32).toString('base64url');
function response(res,status,body){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
 res.end(JSON.stringify(body));
}
async function body(req){
 let size=0;const parts=[];
 for await(const chunk of req){size+=chunk.length;if(size>8192){const error=new Error('payload too large');error.status=413;throw error;}parts.push(chunk);}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8')||'{}');}catch{const error=new Error('invalid JSON');error.status=400;throw error;}
}
function gmailRawMessage({from,to,subject,text}){
 if(!/^[^\r\n]{3,200}$/.test(from)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||/[\r\n]/.test(subject))throw new Error('Invalid mail header');
 const encodedSubject=Buffer.from(subject,'utf8').toString('base64');
 const encodedBody=Buffer.from(text,'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n')||'';
 const message=['From: '+from,'To: '+to,'Subject: =?UTF-8?B?'+encodedSubject+'?=','MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',encodedBody].join('\r\n');
 return Buffer.from(message,'utf8').toString('base64url');
}
function createCommerce(settings=process.env,overrides={}){
 if(settings.COMMERCE_ENABLED!=='true'){
  if(settings.TELEGRAM_ENABLED!=='true')return null;
  if(!settings.DATABASE_URL)throw new Error('Telegram config missing: DATABASE_URL');
  const {Pool}=require('pg');
  const pool=new Pool({connectionString:settings.DATABASE_URL,ssl:settings.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
  const telegram=require('./telegram').createTelegramBot(settings,{
   pool,approveOrder:async()=>({error:'Customer purchases are not enabled.'}),fetchImpl:overrides.telegramFetch||fetch
  });
  const timer=setInterval(()=>telegram.flushNotifications().catch(error=>console.error('Telegram notification unavailable:',error.code||error.name||'error')),15000);
  timer.unref?.();
  setImmediate(()=>telegram.installWebhook().then(()=>console.log('Telegram webhook registered for @'+String(settings.TELEGRAM_BOT_USERNAME||'owner-bot').replace(/[^A-Za-z0-9_]/g,''))).catch(error=>console.error('Telegram webhook unavailable:',error.code||error.name||'error')));
  return {
   handle:async(req,res,url)=>{
    if(req.method==='POST'&&url.pathname==='/api/v2/telegram/webhook'){
     try{await telegram.handle(req,res);}catch(error){console.error('Telegram webhook unavailable:',error.code||error.name||'error');if(!res.headersSent){res.writeHead(503);res.end();}}
     return true;
    }
    return false;
   },
   close:async()=>{clearInterval(timer);await pool.end();}
  };
 }

 const mode=settings.MAIL_PROVIDER||'smtp';
 if(!['smtp','gmail_api','resend'].includes(mode))throw new Error('Commerce config invalid: MAIL_PROVIDER');
 const required=['DATABASE_URL','WEB_ORIGIN','ADMIN_EMAIL','SMTP_FROM','GOOGLE_SERVICE_ACCOUNT_JSON','COMMERCE_FILES_JSON',...(mode==='resend'?['RESEND_API_KEY']:mode==='smtp'?['SMTP_HOST','SMTP_USER','SMTP_PASSWORD']:['GMAIL_OAUTH_CLIENT_ID','GMAIL_OAUTH_CLIENT_SECRET','GMAIL_OAUTH_REFRESH_TOKEN'])];
 for(const key of required)if(!settings[key])throw new Error('Commerce config missing: '+key);
 const webOrigin=new URL(settings.WEB_ORIGIN).origin;
 const adminEmail=settings.ADMIN_EMAIL.trim().toLowerCase();
 const files=JSON.parse(settings.COMMERCE_FILES_JSON);
 const credentials=JSON.parse(settings.GOOGLE_SERVICE_ACCOUNT_JSON);
 const {Pool}=require('pg');
 const {GoogleAuth,OAuth2Client}=require('google-auth-library');
 const pool=new Pool({connectionString:settings.DATABASE_URL,ssl:settings.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
 const smtp=mode==='smtp'?require('nodemailer').createTransport({host:settings.SMTP_HOST,port:Number(settings.SMTP_PORT||587),secure:Number(settings.SMTP_PORT||587)===465,auth:{user:settings.SMTP_USER,pass:settings.SMTP_PASSWORD}}):null;
 const gmail=mode==='gmail_api'?new OAuth2Client(settings.GMAIL_OAUTH_CLIENT_ID,settings.GMAIL_OAUTH_CLIENT_SECRET):null;
 if(gmail)gmail.setCredentials({refresh_token:settings.GMAIL_OAUTH_REFRESH_TOKEN});
 const auth=new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/drive.readonly']});
 function fileAt(code,index){
  const list=files[code];
  if(!Array.isArray(list)||!Number.isSafeInteger(index)||index<0||index>=list.length)return null;
  const file=list[index];
  if(!file||!/^[-\w]{10,128}$/.test(file.fileId)||typeof file.name!=='string'||file.name.length>160)return null;
  return file;
 }
 async function session(req){
  const match=/^Bearer ([a-zA-Z0-9_-]{40,100})$/.exec(String(req.headers.authorization||''));
  if(!match)return null;
  const r=await pool.query("SELECT c.id,c.email,c.nickname FROM sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()",[sha(match[1])]);
  return r.rows[0]||null;
 }
 async function send(to,subject,text,idempotencyKey){
  const message={from:settings.SMTP_FROM,to,subject,text};
  if(overrides.sendMail)return overrides.sendMail(message);
  if(mode==='smtp')return smtp.sendMail(message);
  if(mode==='resend'){
   const result=await (overrides.fetch||fetch)('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:'Bearer '+settings.RESEND_API_KEY,'Content-Type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},
    body:JSON.stringify({...message,to:[to]}),signal:AbortSignal.timeout(12000)
   });
   if(!result.ok)throw new Error('Resend delivery unavailable: HTTP '+result.status);
   const accepted=await result.json();
   if(typeof accepted.id!=='string'||!accepted.id)throw new Error('Resend delivery not accepted');
   return;
  }
  const accessToken=await (overrides.gmailAccessToken||gmail.getAccessToken.bind(gmail))();
  if(!accessToken?.token)throw new Error('Gmail authorization unavailable');
  const result=await (overrides.fetch||fetch)('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
   method:'POST',headers:{Authorization:'Bearer '+accessToken.token,'Content-Type':'application/json'},
   body:JSON.stringify({raw:gmailRawMessage(message)}),signal:AbortSignal.timeout(12000)
  });
  if(!result.ok)throw new Error('Gmail delivery unavailable: HTTP '+result.status);
 }
 const oauthOrigin='https://mukvik-routine-pack-production.up.railway.app';
 const allowedAuthOrigins=new Set(['https://routinepack.download','https://www.routinepack.download','https://mukvik-routine-pack.mukvik1.chatgpt.site']);
 const providerConfig={
  google:{client:settings.AUTH_GOOGLE_CLIENT_ID,secret:settings.AUTH_GOOGLE_CLIENT_SECRET,authorize:'https://accounts.google.com/o/oauth2/v2/auth',exchange:'https://oauth2.googleapis.com/token',scope:'openid email profile'},
  facebook:{client:settings.AUTH_FACEBOOK_CLIENT_ID,secret:settings.AUTH_FACEBOOK_CLIENT_SECRET,authorize:'https://www.facebook.com/v22.0/dialog/oauth',exchange:'https://graph.facebook.com/v22.0/oauth/access_token',scope:'email,public_profile'},
  apple:{client:settings.AUTH_APPLE_CLIENT_ID,secret:settings.AUTH_APPLE_CLIENT_SECRET,authorize:'https://appleid.apple.com/auth/authorize',exchange:'https://appleid.apple.com/auth/token',scope:'name email'}
 };
 function oauthReply(res,origin,result){
  const nonce=crypto.randomBytes(16).toString('base64');
  const data=JSON.stringify({type:'mukvik-auth',...result}).replace(/</g,'\\u003c');
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; base-uri 'none'; frame-ancestors 'none'"});
  res.end('<!doctype html><html><head><meta name="color-scheme" content="dark"></head><body><p>You can close this window.</p><script nonce="'+nonce+'">if(window.opener){window.opener.postMessage('+data+','+JSON.stringify(origin)+');window.close();}</script></body></html>');
 }
 async function oauth(req,res,url,provider,callback){
  const config=providerConfig[provider];
  if(!config?.client||!config.secret)return response(res,503,{error:'Social sign-in is not configured yet.'});
  const redirect=oauthOrigin+'/api/v2/auth/oauth/'+provider+'/callback';
  if(!callback){
   const origin=url.searchParams.get('origin');if(!allowedAuthOrigins.has(origin))return response(res,400,{error:'Invalid sign-in origin.'});
   const state=token(),nonce=token(),verifier=token();
   await pool.query("INSERT INTO oauth_states(state_hash,provider,origin,nonce,verifier,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '10 minutes')",[sha(state),provider,origin,nonce,verifier]);
   const params=new URLSearchParams({client_id:config.client,redirect_uri:redirect,response_type:'code',scope:config.scope,state,nonce});
   if(provider==='google'){params.set('code_challenge',crypto.createHash('sha256').update(verifier).digest('base64url'));params.set('code_challenge_method','S256');}
   if(provider==='apple')params.set('response_mode','form_post');
   res.writeHead(302,{Location:config.authorize+'?'+params,'Cache-Control':'no-store'});res.end();return;
  }
  let params=url.searchParams;
  if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk.toString();if(raw.length>8192)return response(res,413,{error:'Payload too large.'});}params=new URLSearchParams(raw);}
  const state=params.get('state');if(!state||!/^[-\w]{40,100}$/.test(state))return response(res,400,{error:'Invalid sign-in state.'});
  const claim=await pool.query("UPDATE oauth_states SET used_at=now() WHERE state_hash=$1 AND provider=$2 AND used_at IS NULL AND expires_at>now() RETURNING *",[sha(state),provider]);
  const row=claim.rows[0];if(!row)return response(res,410,{error:'Sign-in expired. Please try again.'});
  try{
   const code=params.get('code');if(!code||params.has('error'))throw Error('OAuth cancelled');
   const payload=new URLSearchParams({client_id:config.client,client_secret:config.secret,code,redirect_uri:redirect,grant_type:'authorization_code'});
   if(provider==='google')payload.set('code_verifier',row.verifier);
   const exchanged=await fetch(config.exchange,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:payload,signal:AbortSignal.timeout(15000)});
   if(!exchanged.ok)throw Error('OAuth exchange failed');const tokens=await exchanged.json();
   let email,nickname;
   if(provider==='facebook'){
    if(!tokens.access_token)throw Error('Missing access token');
    const identity=await fetch('https://graph.facebook.com/v22.0/me?fields=id,name,email',{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(15000)});
    if(!identity.ok)throw Error('OAuth profile failed');const profile=await identity.json();email=profile.email;nickname=profile.name;
   }else{
    if(!tokens.id_token)throw Error('Missing ID token');
    const verifier=new OAuth2Client();let profile;
    if(provider==='google'){const verified=await verifier.verifyIdToken({idToken:tokens.id_token,audience:config.client});profile=verified.getPayload();}
    else{
     const keys=await fetch('https://appleid.apple.com/auth/keys',{signal:AbortSignal.timeout(15000)});if(!keys.ok)throw Error('Apple keys unavailable');const jwks=await keys.json(),certs={};
     for(const key of jwks.keys||[])certs[key.kid]=crypto.createPublicKey({key,format:'jwk'}).export({type:'spki',format:'pem'});
     const verified=await verifier.verifySignedJwtWithCertsAsync(tokens.id_token,certs,config.client,['https://appleid.apple.com']);profile=verified.getPayload();
    }
    if(!profile||profile.nonce!==row.nonce||![true,'true'].includes(profile.email_verified))throw Error('Unverified identity');
    email=profile.email;nickname=profile.name;
   }
   email=String(email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw Error('Email required');
   const db=await pool.connect();let access;
   try{await db.query('BEGIN');const customer=await db.query('INSERT INTO customers(id,email,nickname) VALUES($1,$2,$3) ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email RETURNING id',[crypto.randomUUID(),email,String(nickname||'').trim().slice(0,40)||null]);access=token();await db.query("INSERT INTO sessions(token_hash,customer_id,expires_at) VALUES($1,$2,now()+interval '14 days')",[sha(access),customer.rows[0].id]);await db.query("INSERT INTO customer_activity(customer_id,kind) VALUES($1,'registered') ON CONFLICT DO NOTHING",[customer.rows[0].id]);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
   oauthReply(res,row.origin,{accessToken:access});
  }catch{oauthReply(res,row.origin,{error:'Social sign-in failed.'});}
 }
 async function startPasswordRegistration(req,res){
  const payload=await body(req),email=String(payload.email||'').trim().toLowerCase(),nickname=String(payload.nickname||'').trim();
  if(!validEmail(email))return response(res,400,{error:'Enter a valid email address.'});
  if(!nickname||nickname.length>40||/[\x00-\x1f\x7f]/.test(nickname))return response(res,400,{error:'Enter a nickname (up to 40 characters).'});
  if(!validPassword(payload.password))return response(res,400,{error:'Password must contain 8 to 128 characters.'});
  const existing=await pool.query('SELECT password_hash FROM customers WHERE email=$1',[email]);
  if(existing.rows[0]?.password_hash)return response(res,202,{challengeId:crypto.randomUUID(),expiresIn:600});
  const recent=await pool.query("SELECT count(*)::int AS n FROM password_auth_challenges WHERE email=$1 AND created_at>now()-interval '15 minutes'",[email]);
  if(recent.rows[0].n>=5)return response(res,429,{error:'Please wait before requesting another code.'});
  const id=crypto.randomUUID(),code=String(crypto.randomInt(0,100000000)).padStart(8,'0');
  const passwordHash=await hashPassword(payload.password);
  await pool.query("INSERT INTO password_auth_challenges(id,email,kind,nickname,password_hash,code_hash,expires_at) VALUES($1,$2,'register',$3,$4,$5,now()+interval '10 minutes')",[id,email,nickname,passwordHash,sha(id+':'+code)]);
  try{await send(email,'MUKVIK — confirm your account / Підтвердьте акаунт','Your account confirmation code: '+code+'\nValid for 10 minutes. Never share this code.\n\nКод підтвердження акаунта: '+code+'\nДіє 10 хвилин. Нікому не повідомляйте код.','password/register/'+id);}
  catch(error){await pool.query('UPDATE password_auth_challenges SET used_at=now() WHERE id=$1',[id]);throw error;}
  response(res,202,{challengeId:id,expiresIn:600});
 }
 async function confirmPasswordChallenge(req,res,kind){
  const payload=await body(req),id=String(payload.challengeId||''),code=String(payload.code||'');
  if(!uuidPattern.test(id)||!/^\d{8}$/.test(code))return response(res,400,{error:'Enter the 8-digit code from your email.'});
  if(kind==='reset'&&!validPassword(payload.password))return response(res,400,{error:'Password must contain 8 to 128 characters.'});
  const newPasswordHash=kind==='reset'?await hashPassword(payload.password):null;
  const db=await pool.connect();let access,customerId,email;
  try{
   await db.query('BEGIN');
   const result=await db.query('SELECT * FROM password_auth_challenges WHERE id=$1 AND kind=$2 FOR UPDATE',[id,kind]);
   const row=result.rows[0];
   if(!row||row.used_at||new Date(row.expires_at)<=new Date()||row.attempts>=5){await db.query('ROLLBACK');return response(res,410,{error:'Code expired or used. Request a new code.'});}
   if(!crypto.timingSafeEqual(Buffer.from(row.code_hash,'hex'),Buffer.from(sha(id+':'+code),'hex'))){
    await db.query('UPDATE password_auth_challenges SET attempts=attempts+1 WHERE id=$1',[id]);await db.query('COMMIT');return response(res,400,{error:'Incorrect code.'});
   }
   email=row.email;
   await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[email]);
   const customer=await db.query('SELECT id,password_hash FROM customers WHERE email=$1 FOR UPDATE',[email]);
   if(kind==='register'){
    if(customer.rows[0]?.password_hash){await db.query('ROLLBACK');return response(res,409,{error:'This account already exists. Sign in or reset your password.'});}
    if(customer.rowCount){customerId=customer.rows[0].id;await db.query('UPDATE customers SET password_hash=$2,email_verified_at=now(),nickname=coalesce(nickname,$3) WHERE id=$1',[customerId,row.password_hash,row.nickname]);}
    else{customerId=crypto.randomUUID();await db.query('INSERT INTO customers(id,email,nickname,password_hash,email_verified_at) VALUES($1,$2,$3,$4,now())',[customerId,email,row.nickname,row.password_hash]);}
    await db.query('UPDATE sessions SET revoked_at=now() WHERE customer_id=$1 AND revoked_at IS NULL',[customerId]);
    access=token();
    await db.query("INSERT INTO sessions(token_hash,customer_id,expires_at) VALUES($1,$2,now()+interval '14 days')",[sha(access),customerId]);
    await db.query("INSERT INTO customer_activity(customer_id,kind) VALUES($1,'registered') ON CONFLICT DO NOTHING",[customerId]);
    await db.query('INSERT INTO registration_email_outbox(customer_id) VALUES($1) ON CONFLICT DO NOTHING',[customerId]);
   }else{
    if(!customer.rowCount){await db.query('ROLLBACK');return response(res,410,{error:'Code expired or used. Request a new code.'});}
    customerId=customer.rows[0].id;
    await db.query('UPDATE customers SET password_hash=$2,email_verified_at=coalesce(email_verified_at,now()) WHERE id=$1',[customerId,newPasswordHash]);
    await db.query('UPDATE sessions SET revoked_at=now() WHERE customer_id=$1 AND revoked_at IS NULL',[customerId]);
   }
   await db.query('UPDATE password_auth_challenges SET used_at=now() WHERE email=$1 AND used_at IS NULL',[email]);
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  if(kind==='register'){
   response(res,200,{accessToken:access,expiresIn:1209600});
   setImmediate(()=>flushRegistrationEmails().catch(error=>console.error('Registration notification unavailable:',error.code||error.name||'error')));
  }else{
   response(res,200,{message:'Password updated. Sign in with your new password.'});
   setImmediate(()=>send(email,'MUKVIK — password changed / Пароль змінено','Your Routine Pack password was changed. If this was not you, contact MUKVIK.\n\nПароль Routine Pack змінено. Якщо це були не ви, зв’яжіться з MUKVIK.','password/changed/'+id).catch(error=>console.error('Password change notice unavailable:',error.code||error.name||'error')));
  }
 }
 async function loginWithPassword(req,res){
  const payload=await body(req),email=String(payload.email||'').trim().toLowerCase(),password=payload.password;
  if(!validEmail(email)||!validPassword(password))return response(res,401,{error:'Incorrect email or password.'});
  const emailHash=sha(email);
  await pool.query('INSERT INTO password_login_attempts(email_hash) VALUES($1)',[emailHash]);
  const attempts=await pool.query("SELECT count(*)::int AS n FROM password_login_attempts WHERE email_hash=$1 AND created_at>now()-interval '15 minutes'",[emailHash]);
  if(attempts.rows[0].n>10)return response(res,429,{error:'Too many attempts. Try again later.'});
  const customer=await pool.query('SELECT id,password_hash,email_verified_at FROM customers WHERE email=$1',[email]);
  const row=customer.rows[0];
  const matches=row?.password_hash?await verifyPassword(password,row.password_hash):(await hashPassword(password),false);
  if(!matches||!row.email_verified_at)return response(res,401,{error:'Incorrect email or password.'});
  const access=token();
  await pool.query("INSERT INTO sessions(token_hash,customer_id,expires_at) VALUES($1,$2,now()+interval '14 days')",[sha(access),row.id]);
  await pool.query('DELETE FROM password_login_attempts WHERE email_hash=$1',[emailHash]);
  response(res,200,{accessToken:access,expiresIn:1209600});
 }
 async function startPasswordReset(req,res){
  const payload=await body(req),email=String(payload.email||'').trim().toLowerCase();
  if(!validEmail(email))return response(res,400,{error:'Enter a valid email address.'});
  const id=crypto.randomUUID();
  const customer=await pool.query('SELECT id FROM customers WHERE email=$1',[email]);
  if(!customer.rowCount)return response(res,202,{challengeId:id,expiresIn:600});
  const recent=await pool.query("SELECT count(*)::int AS n FROM password_auth_challenges WHERE email=$1 AND created_at>now()-interval '15 minutes'",[email]);
  if(recent.rows[0].n>=5)return response(res,429,{error:'Please wait before requesting another code.'});
  const code=String(crypto.randomInt(0,100000000)).padStart(8,'0');
  await pool.query("INSERT INTO password_auth_challenges(id,email,kind,code_hash,expires_at) VALUES($1,$2,'reset',$3,now()+interval '10 minutes')",[id,email,sha(id+':'+code)]);
  try{await send(email,'MUKVIK — password reset / Відновлення пароля','Your password reset code: '+code+'\nValid for 10 minutes. Never share this code.\n\nКод відновлення пароля: '+code+'\nДіє 10 хвилин. Нікому не повідомляйте код.','password/reset/'+id);}
  catch(error){await pool.query('UPDATE password_auth_challenges SET used_at=now() WHERE id=$1',[id]);throw error;}
  response(res,202,{challengeId:id,expiresIn:600});
 }
 async function flushRegistrationEmails(){
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   const list=await db.query("SELECT o.customer_id,c.email,c.nickname FROM registration_email_outbox o JOIN customers c ON c.id=o.customer_id WHERE o.sent_at IS NULL AND o.attempts<20 AND (o.last_attempt_at IS NULL OR o.last_attempt_at<now()-interval '1 minute') ORDER BY c.created_at LIMIT 10 FOR UPDATE OF o SKIP LOCKED");
   for(const row of list.rows){
    try{
     await send(adminEmail,'MUKVIK — new account / Новий акаунт','A new account was confirmed.\nEmail: '+row.email+'\nNickname: '+(row.nickname||'—')+'\n\nПідтверджено новий акаунт.\nEmail: '+row.email+'\nНікнейм: '+(row.nickname||'—'),'registration/'+row.customer_id);
     await db.query('UPDATE registration_email_outbox SET sent_at=now(),attempts=attempts+1,last_attempt_at=now() WHERE customer_id=$1',[row.customer_id]);
    }catch{await db.query('UPDATE registration_email_outbox SET attempts=attempts+1,last_attempt_at=now() WHERE customer_id=$1',[row.customer_id]);}
   }
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 async function startCode(req,res){
  const payload=await body(req),email=String(payload.email||'').trim().toLowerCase();
  const nickname=String(payload.nickname||'').trim().slice(0,40);
  if(email.length<5||email.length>254||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(email))return response(res,400,{error:'Enter a valid email address.'});
  const db=await pool.connect();let id,customerId,code;
  try{
   await db.query('BEGIN');
   const customer=await db.query("INSERT INTO customers(id,email) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email RETURNING id",[crypto.randomUUID(),email]);
   customerId=customer.rows[0].id;
   await db.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE',[customerId]);
   const recent=await db.query("SELECT count(*)::int AS n FROM email_codes WHERE customer_id=$1 AND created_at>now()-interval '15 minutes'",[customerId]);
   if(recent.rows[0].n>=5){await db.query('ROLLBACK');return response(res,429,{error:'Please wait before requesting another code.'});}
   id=crypto.randomUUID();code=String(crypto.randomInt(0,100000000)).padStart(8,'0');
   await db.query("INSERT INTO email_codes(id,customer_id,code_hash,nickname,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",[id,customerId,sha(id+':'+code),nickname||null]);
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  try{await send(email,'MUKVIK — confirmation code / Код підтвердження','Your confirmation code: '+code+'\nValid for 10 minutes. Enter it in the window on the MUKVIK website. Never share this code.\n\nВаш код підтвердження: '+code+'\nДіє 10 хвилин. Введіть його у вікні на сайті MUKVIK. Нікому не повідомляйте код.','code/'+id);}
  catch(error){await pool.query('UPDATE email_codes SET used_at=now() WHERE id=$1',[id]);throw error;}
  response(res,202,{challengeId:id,expiresIn:600});
 }
 async function verifyCode(req,res){
  const payload=await body(req);
  if(!uuidPattern.test(String(payload.challengeId||''))||!/^\d{8}$/.test(String(payload.code||'')))return response(res,400,{error:'Enter the 8-digit code from your email.'});
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   const claim=await db.query('SELECT * FROM email_codes WHERE id=$1 FOR UPDATE',[payload.challengeId]);
   const row=claim.rows[0];
   if(!row||row.used_at||new Date(row.expires_at)<=new Date()||row.attempts>=5){await db.query('ROLLBACK');return response(res,410,{error:'Code expired or used. Request a new code.'});}
   if(!crypto.timingSafeEqual(Buffer.from(row.code_hash,'hex'),Buffer.from(sha(payload.challengeId+':'+payload.code),'hex'))){
    await db.query('UPDATE email_codes SET attempts=attempts+1 WHERE id=$1',[row.id]);await db.query('COMMIT');return response(res,400,{error:'Incorrect code.'});
   }
   await db.query('UPDATE email_codes SET used_at=now() WHERE id=$1',[row.id]);
   if(row.nickname)await db.query('UPDATE customers SET nickname=coalesce(nickname,$2) WHERE id=$1',[row.customer_id,row.nickname]);
   const access=token();
   await db.query("INSERT INTO sessions(token_hash,customer_id,expires_at) VALUES($1,$2,now()+interval '14 days')",[sha(access),row.customer_id]);
   await db.query("INSERT INTO customer_activity(customer_id,kind) VALUES($1,'registered') ON CONFLICT DO NOTHING",[row.customer_id]);
   await db.query('COMMIT');response(res,200,{accessToken:access,expiresIn:1209600});
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 async function start(req,res){
  const payload=await body(req),email=String(payload.email||'').trim().toLowerCase();
  if(email.length<5||email.length>254||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(email))return response(res,400,{error:'Enter a valid email address.'});
  const customer=await pool.query("INSERT INTO customers(id,email) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email RETURNING id",[crypto.randomUUID(),email]);
  const id=customer.rows[0].id;
  const attempts=await pool.query("SELECT count(*)::int AS count FROM login_challenges WHERE customer_id=$1 AND created_at>now()-interval '15 minutes'",[id]);
  if(attempts.rows[0].count>=5)return response(res,202,{message:'If you can receive email at this address, check your inbox.'});
  const secret=token();
  await pool.query("INSERT INTO login_challenges(token_hash,customer_id,expires_at) VALUES($1,$2,now()+interval '15 minutes')",[sha(secret),id]);
  const link=webOrigin+'/account/#ticket='+encodeURIComponent(secret);
  await send(email,'Routine Pack — sign in','Open this link to sign in. It expires in 15 minutes:\n'+link+'\n\nВідкрийте посилання для входу. Воно діє 15 хвилин.','signin/'+sha(secret));
  return response(res,202,{message:'If you can receive email at this address, check your inbox.'});
 }
 async function redeem(req,res){
  const payload=await body(req),secret=payload.ticket;
  if(typeof secret!=='string'||!(/^[a-zA-Z0-9_-]{40,100}$/).test(secret))return response(res,400,{error:'Invalid sign-in link.'});
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   const claim=await db.query("UPDATE login_challenges SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING customer_id",[sha(secret)]);
   if(!claim.rowCount){await db.query('ROLLBACK');return response(res,410,{error:'This sign-in link has expired or was used.'});}
   const access=token();
   await db.query("INSERT INTO sessions(token_hash,customer_id,expires_at) VALUES($1,$2,now()+interval '14 days')",[sha(access),claim.rows[0].customer_id]);
   await db.query("INSERT INTO customer_activity(customer_id,kind) VALUES($1,'registered') ON CONFLICT DO NOTHING",[claim.rows[0].customer_id]);
   await db.query('COMMIT');
   return response(res,200,{accessToken:access,expiresIn:1209600});
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 async function logout(req,res){
  const match=/^Bearer ([a-zA-Z0-9_-]{40,100})$/.exec(String(req.headers.authorization||''));
  if(match)await pool.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1',[sha(match[1])]);
  response(res,200,{ok:true});
 }
 async function putCart(req,res,user){
  const payload=await body(req);
  if(!Array.isArray(payload.productCodes)||payload.productCodes.length>7||payload.productCodes.some(code=>typeof code!=='string'||!CATALOG[code]))return response(res,400,{error:'Invalid cart.'});
  const codes=[...new Set(payload.productCodes)];
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   // Serialize cart writes for this customer, including an initially empty cart.
   await db.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE',[user.id]);
   const previous=await db.query('SELECT product_code FROM cart_items WHERE customer_id=$1 ORDER BY product_code',[user.id]);
   const before=previous.rows.map(item=>item.product_code);
   await db.query('DELETE FROM cart_items WHERE customer_id=$1',[user.id]);
   for(const code of codes)await db.query('INSERT INTO cart_items(customer_id,product_code) VALUES($1,$2)',[user.id,code]);
   const added=codes.filter(code=>!before.includes(code)),removed=before.filter(code=>!codes.includes(code));
   if(added.length||removed.length){
    const describe=code=>({code,name:CATALOG[code]?.name||code});
    await db.query("INSERT INTO customer_activity(customer_id,kind,payload) VALUES($1,'cart_updated',$2::jsonb)",[user.id,JSON.stringify({added:added.map(describe),removed:removed.map(describe),products:codes.map(describe)})]);
   }
   await db.query('COMMIT');
   response(res,200,{productCodes:codes});
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 async function cart(res,user){
  const r=await pool.query('SELECT product_code FROM cart_items WHERE customer_id=$1 ORDER BY created_at,product_code',[user.id]);
  response(res,200,{items:r.rows.map(x=>({code:x.product_code,...CATALOG[x.product_code]}))});
 }
 async function newOrder(req,res,user){
  const payload=await body(req),key=payload.idempotencyKey;
  if(typeof key!=='string'||!uuidPattern.test(key))return response(res,400,{error:'Invalid idempotency key.'});
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   await db.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE',[user.id]);
   const prior=await db.query('SELECT id,status,total_cents FROM orders WHERE customer_id=$1 AND idempotency_key=$2',[user.id,key]);
   if(prior.rowCount){await db.query('COMMIT');return response(res,200,{order:prior.rows[0]});}
   const c=await db.query('SELECT product_code FROM cart_items WHERE customer_id=$1 ORDER BY product_code FOR UPDATE',[user.id]);
   if(!c.rowCount){await db.query('ROLLBACK');return response(res,400,{error:'Cart is empty.'});}
   const products=c.rows.map(x=>({code:x.product_code,...CATALOG[x.product_code]}));
   if(products.some(x=>!Number.isInteger(x.cents))){await db.query('ROLLBACK');return response(res,400,{error:'Invalid product.'});}
   const total=products.reduce((sum,x)=>sum+x.cents,0),orderId=crypto.randomUUID();
   const created=await db.query("INSERT INTO orders(id,customer_id,idempotency_key,currency,total_cents) VALUES($1,$2,$3,'USD',$4) ON CONFLICT(customer_id,idempotency_key) DO NOTHING RETURNING id,status,total_cents",[orderId,user.id,key,total]);
   if(!created.rowCount){
    const existing=await db.query('SELECT id,status,total_cents FROM orders WHERE customer_id=$1 AND idempotency_key=$2',[user.id,key]);
    await db.query('COMMIT');return response(res,200,{order:existing.rows[0]});
   }
   for(const p of products)await db.query('INSERT INTO order_items(order_id,product_code,name,price_cents) VALUES($1,$2,$3,$4)',[orderId,p.code,p.name,p.cents]);
   await db.query("INSERT INTO order_events(order_id,actor_id,event_type) VALUES($1,$2,'order_created')",[orderId,user.id]);
   if(telegram)await db.query("INSERT INTO telegram_notifications(order_id,kind) VALUES($1,'new_order') ON CONFLICT DO NOTHING",[orderId]);
   await db.query('DELETE FROM cart_items WHERE customer_id=$1',[user.id]);
   await db.query('COMMIT');
   response(res,201,{order:created.rows[0],message:'Contact Mukvik to pay; access is granted only after approval.'});
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 async function me(res,user){
  const r=await pool.query("SELECT o.id,o.status,o.total_cents,o.currency,o.created_at,i.product_code,i.name,i.price_cents,(e.order_id IS NOT NULL AND o.status='approved') AS accessible FROM orders o JOIN order_items i ON i.order_id=o.id LEFT JOIN entitlements e ON e.order_id=i.order_id AND e.product_code=i.product_code AND e.customer_id=$1 WHERE o.customer_id=$1 ORDER BY o.created_at DESC,i.product_code",[user.id]);
  const orders=new Map();
  for(const row of r.rows){
   if(!orders.has(row.id))orders.set(row.id,{id:row.id,status:row.status,totalCents:row.total_cents,currency:row.currency,createdAt:row.created_at,items:[]});
   orders.get(row.id).items.push({code:row.product_code,name:row.name,priceCents:row.price_cents,accessible:row.accessible,files:row.accessible?(files[row.product_code]||[]).map((file,index)=>({index,name:file.name})):[]});
  }
  response(res,200,{email:user.email,nickname:user.nickname||null,admin:user.email===adminEmail,orders:[...orders.values()]});
 }
 async function adminOrders(res){
  const r=await pool.query("SELECT o.id,o.status,o.total_cents,o.currency,o.created_at,c.email,coalesce(json_agg(json_build_object('code',i.product_code,'name',i.name,'priceCents',i.price_cents) ORDER BY i.product_code) FILTER(WHERE i.product_code IS NOT NULL),'[]') AS items FROM orders o JOIN customers c ON c.id=o.customer_id LEFT JOIN order_items i ON i.order_id=o.id GROUP BY o.id,c.email ORDER BY o.created_at DESC LIMIT 100");
  response(res,200,{orders:r.rows});
 }
 async function approveResult(user,orderId){
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   const order=await db.query('SELECT id,customer_id,status FROM orders WHERE id=$1 FOR UPDATE',[orderId]);
   if(!order.rowCount){await db.query('ROLLBACK');return {http:404,error:'Order not found.'};}
   if(order.rows[0].status==='approved'){await db.query('COMMIT');return {http:200,status:'approved',alreadyApproved:true};}
   if(order.rows[0].status!=='awaiting_manual_review'){await db.query('ROLLBACK');return {http:409,error:'Order cannot be approved.'};}
   await db.query("UPDATE orders SET status='approved',approved_at=now(),approved_by=$2 WHERE id=$1",[orderId,user.id]);
   await db.query('INSERT INTO entitlements(order_id,customer_id,product_code) SELECT i.order_id,$2,i.product_code FROM order_items i WHERE i.order_id=$1 ON CONFLICT(order_id,product_code) DO NOTHING',[orderId,order.rows[0].customer_id]);
   await db.query("INSERT INTO order_events(order_id,actor_id,event_type) VALUES($1,$2,'manual_approved')",[orderId,user.id]);
   await db.query("INSERT INTO notification_outbox(order_id,kind) VALUES($1,'approved') ON CONFLICT(order_id,kind) DO NOTHING",[orderId]);
   if(telegram)await db.query("INSERT INTO telegram_notifications(order_id,kind) VALUES($1,'approved') ON CONFLICT DO NOTHING",[orderId]);
   await db.query('COMMIT');
   return {http:200,status:'approved'};
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 async function approve(res,user,orderId){
  const result=await approveResult(user,orderId);
  const {http,...payload}=result;
  response(res,http,payload);
 }
 const telegram=require('./telegram').createTelegramBot(settings,{
  pool,
  approveOrder:async orderId=>{
   const actor=await pool.query('INSERT INTO customers(id,email) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email RETURNING id',[crypto.randomUUID(),adminEmail]);
   return approveResult({id:actor.rows[0].id},orderId);
  },
  fetchImpl:overrides.telegramFetch||fetch
 });
 async function flushNotifications(){
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   const list=await db.query("SELECT n.id,o.id AS order_id,c.email FROM notification_outbox n JOIN orders o ON o.id=n.order_id JOIN customers c ON c.id=o.customer_id WHERE n.sent_at IS NULL AND n.attempts<20 ORDER BY n.id LIMIT 10 FOR UPDATE OF n SKIP LOCKED");
   for(const row of list.rows){
    try{
     await send(row.email,'Routine Pack — your order is ready','Your order '+row.order_id+' is approved. Sign in to your account at '+webOrigin+'/account/ to download your purchases.\n\nВаше замовлення підтверджено. Увійдіть в особистий кабінет для завантаження.','order/'+row.order_id+'/approved');
     await db.query("UPDATE notification_outbox SET sent_at=now(),attempts=attempts+1,last_attempt_at=now() WHERE id=$1",[row.id]);
    }catch{
     await db.query("UPDATE notification_outbox SET attempts=attempts+1,last_attempt_at=now() WHERE id=$1",[row.id]);
    }
   }
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 async function issueDownload(res,user,orderId,code,index){
  if(!fileAt(code,index))return response(res,404,{error:'File unavailable.'});
  const access=await pool.query("SELECT 1 FROM entitlements e JOIN orders o ON o.id=e.order_id WHERE e.order_id=$1 AND e.product_code=$2 AND e.customer_id=$3 AND o.status='approved'",[orderId,code,user.id]);
  if(!access.rowCount)return response(res,403,{error:'Purchase required.'});
  const secret=token();
  await pool.query("INSERT INTO download_tickets(token_hash,order_id,product_code,file_index,customer_id,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '60 seconds')",[sha(secret),orderId,code,index,user.id]);
  response(res,200,{url:'/api/v2/download/'+secret,expiresIn:60});
 }
 async function download(req,res,secret){
  if(!(/^[a-zA-Z0-9_-]{40,100}$/).test(secret))return response(res,404,{error:'File not found.'});
  const ticket=await pool.query("SELECT t.order_id,t.product_code,t.file_index FROM download_tickets t JOIN orders o ON o.id=t.order_id WHERE t.token_hash=$1 AND t.redeemed_at IS NULL AND t.expires_at>now() AND o.status='approved'",[sha(secret)]);
  if(!ticket.rowCount)return response(res,410,{error:'Download link expired or already used.'});
  const t=ticket.rows[0],file=fileAt(t.product_code,t.file_index);
  if(!file)return response(res,404,{error:'File unavailable.'});
  const driveToken=await (overrides.driveToken||auth.getAccessToken.bind(auth))();
  const upstream=await (overrides.fetch||fetch)('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.fileId)+'?alt=media',{headers:{Authorization:'Bearer '+driveToken}});
  if(!upstream.ok||!upstream.body){
   upstream.body?.cancel();
   return response(res,502,{error:'Download is temporarily unavailable.'});
  }
  const claimed=await pool.query("UPDATE download_tickets SET redeemed_at=now() WHERE token_hash=$1 AND redeemed_at IS NULL AND expires_at>now() AND EXISTS(SELECT 1 FROM orders WHERE id=download_tickets.order_id AND status='approved') RETURNING order_id",[sha(secret)]);
  if(!claimed.rowCount){await upstream.body.cancel();return response(res,410,{error:'Download link expired or already used.'});}
  await pool.query("INSERT INTO order_events(order_id,event_type) VALUES($1,'download_started')",[t.order_id]);
  const filename=encodeURIComponent(file.name);
  const headers={'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+filename,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  if(upstream.headers.get('content-length'))headers['Content-Length']=upstream.headers.get('content-length');
  res.writeHead(200,headers);
  try{await pipeline(Readable.fromWeb(upstream.body),res);}catch{res.destroy();}
 }
 async function handle(req,res,url){
  if(!url.pathname.startsWith('/api/v2/'))return false;
  try{
   if(req.method==='POST'&&url.pathname==='/api/v2/telegram/webhook'&&telegram){await telegram.handle(req,res);return true;}
   const oauthRoute=/^\/api\/v2\/auth\/oauth\/(google|facebook|apple)(\/callback)?$/.exec(url.pathname);
   if(oauthRoute&&(req.method==='GET'||(req.method==='POST'&&oauthRoute[2]))){await oauth(req,res,url,oauthRoute[1],Boolean(oauthRoute[2]));return true;}
   if(req.method==='GET'&&url.pathname==='/api/v2/catalog'){response(res,200,{currency:'USD',products:Object.entries(CATALOG).map(([code,p])=>({code,name:p.name,priceCents:p.cents}))});return true;}
   if(req.method==='POST'&&url.pathname==='/api/v2/auth/password/register/start'){await startPasswordRegistration(req,res);return true;}
   if(req.method==='POST'&&url.pathname==='/api/v2/auth/password/register/confirm'){await confirmPasswordChallenge(req,res,'register');return true;}
   if(req.method==='POST'&&url.pathname==='/api/v2/auth/password/login'){await loginWithPassword(req,res);return true;}
   if(req.method==='POST'&&url.pathname==='/api/v2/auth/password/reset/start'){await startPasswordReset(req,res);return true;}
   if(req.method==='POST'&&url.pathname==='/api/v2/auth/password/reset/confirm'){await confirmPasswordChallenge(req,res,'reset');return true;}
   if(req.method==='POST'&&['/api/v2/auth/code/start','/api/v2/auth/code/verify','/api/v2/auth/start','/api/v2/auth/redeem'].includes(url.pathname)){response(res,410,{error:'Use password sign-in or password recovery.'});return true;}
   if(req.method==='GET'&&url.pathname==='/api/v2/auth/providers'){response(res,200,Object.fromEntries(Object.entries(providerConfig).map(([key,c])=>[key,Boolean(c.client&&c.secret)])));return true;}
   if(req.method==='GET'&&url.pathname.startsWith('/api/v2/download/')){await download(req,res,url.pathname.split('/')[4]);return true;}
   const user=await session(req);
   if(!user){response(res,401,{error:'Sign in required.'});return true;}
   if(req.method==='POST'&&url.pathname==='/api/v2/auth/logout'){await logout(req,res);return true;}
   if(req.method==='GET'&&url.pathname==='/api/v2/me'){await me(res,user);return true;}
   if(req.method==='GET'&&url.pathname==='/api/v2/cart'){await cart(res,user);return true;}
   if(req.method==='PUT'&&url.pathname==='/api/v2/cart'){await putCart(req,res,user);return true;}
   if(req.method==='POST'&&url.pathname==='/api/v2/orders'){await newOrder(req,res,user);return true;}
   if(url.pathname.startsWith('/api/v2/admin/')){
    if(user.email!==adminEmail){response(res,403,{error:'Admin access required.'});return true;}
    if(req.method==='GET'&&url.pathname==='/api/v2/admin/orders'){await adminOrders(res);return true;}
    const approveMatch=/^\/api\/v2\/admin\/orders\/([0-9a-f-]{36})\/approve$/.exec(url.pathname);
    if(req.method==='POST'&&approveMatch&&uuidPattern.test(approveMatch[1])){await approve(res,user,approveMatch[1]);return true;}
   }
   const fileMatch=/^\/api\/v2\/orders\/([0-9a-f-]{36})\/files\/([a-z0-9]+)\/(\d+)\/ticket$/.exec(url.pathname);
   if(req.method==='POST'&&fileMatch&&uuidPattern.test(fileMatch[1])){await issueDownload(res,user,fileMatch[1],fileMatch[2],Number(fileMatch[3]));return true;}
   response(res,404,{error:'Not found.'});return true;
  }catch(error){
   if(error.status){response(res,error.status,{error:error.message});return true;}
   console.error('Commerce request failed:',error.code||error.message||error.name||'error');
   if(!res.headersSent)response(res,503,{error:'Service temporarily unavailable.'});else res.destroy();
   return true;
  }
 }
 const timer=setInterval(()=>{
  flushNotifications().catch(error=>console.error('Notification delivery unavailable:',error.code||error.name||'error'));
  flushRegistrationEmails().catch(error=>console.error('Registration notification unavailable:',error.code||error.name||'error'));
  pool.query("DELETE FROM password_login_attempts WHERE created_at<now()-interval '1 day'").catch(error=>console.error('Login attempt cleanup unavailable:',error.code||error.name||'error'));
 },60000);
 const telegramTimer=telegram?setInterval(()=>telegram.flushNotifications().catch(error=>console.error('Telegram notification unavailable:',error.code||error.name||'error')),15000):null;
 telegramTimer?.unref?.();
 if(telegram)setImmediate(()=>telegram.installWebhook().then(()=>console.log('Telegram webhook registered for @'+String(settings.TELEGRAM_BOT_USERNAME||'owner-bot').replace(/[^A-Za-z0-9_]/g,''))).catch(error=>console.error('Telegram webhook unavailable:',error.code||error.name||'error')));
 timer.unref?.();
 return {handle,flushNotifications,flushRegistrationEmails,close:async()=>{clearInterval(timer);if(telegramTimer)clearInterval(telegramTimer);await pool.end();}};
}
module.exports={createCommerce,CATALOG,gmailRawMessage};
})(require,module,exports);
