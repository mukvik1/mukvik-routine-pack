'use strict';

// Read-only deployment preflight. Never print configuration or credential values.
const {Pool}=require('pg');
const {CATALOG}=require('../commerce');

async function main(){
 const settings=process.env,failures=[];
 const fail=name=>failures.push(name);
 const provider=settings.MAIL_PROVIDER||'smtp';
 const required=['DATABASE_URL','WEB_ORIGIN','ADMIN_EMAIL','SMTP_FROM','GOOGLE_SERVICE_ACCOUNT_JSON','COMMERCE_FILES_JSON',
  ...(provider==='resend'?['RESEND_API_KEY']:provider==='gmail_api'?['GMAIL_OAUTH_CLIENT_ID','GMAIL_OAUTH_CLIENT_SECRET','GMAIL_OAUTH_REFRESH_TOKEN']:['SMTP_HOST','SMTP_USER','SMTP_PASSWORD']),
  'TELEGRAM_BOT_TOKEN','TELEGRAM_ADMIN_CHAT_ID','TELEGRAM_WEBHOOK_URL','TELEGRAM_BOT_USERNAME'];
 for(const name of required)if(!settings[name])fail(name+': missing');
 if(!['smtp','gmail_api','resend'].includes(provider))fail('MAIL_PROVIDER: unsupported');
 if(settings.WEB_ORIGIN){
  try{const url=new URL(settings.WEB_ORIGIN);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)fail('WEB_ORIGIN: HTTPS origin required');}
  catch{fail('WEB_ORIGIN: invalid');}
 }
 if(settings.ADMIN_EMAIL&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.ADMIN_EMAIL))fail('ADMIN_EMAIL: invalid');
 if(settings.GOOGLE_SERVICE_ACCOUNT_JSON){
  try{const value=JSON.parse(settings.GOOGLE_SERVICE_ACCOUNT_JSON);if(!value?.client_email||!value?.private_key)fail('GOOGLE_SERVICE_ACCOUNT_JSON: incomplete');}
  catch{fail('GOOGLE_SERVICE_ACCOUNT_JSON: invalid JSON');}
 }
 if(settings.COMMERCE_FILES_JSON){
  try{
   const value=JSON.parse(settings.COMMERCE_FILES_JSON);
   for(const code of Object.keys(CATALOG)){
    const files=value?.[code];
    if(!Array.isArray(files)||!files.length||files.some(file=>!file||!/^[-\w]{10,128}$/.test(file.fileId)||typeof file.name!=='string'||!file.name.length||file.name.length>160))fail('COMMERCE_FILES_JSON: missing or invalid product '+code);
   }
  }catch{fail('COMMERCE_FILES_JSON: invalid JSON');}
 }
 if(settings.TELEGRAM_BOT_USERNAME&&settings.TELEGRAM_BOT_USERNAME.replace(/^@/,'').toLowerCase()!=='routinepack_bot')fail('TELEGRAM_BOT_USERNAME: wrong intended bot');
 if(settings.TELEGRAM_ADMIN_CHAT_ID&&!/^\d{4,20}$/.test(settings.TELEGRAM_ADMIN_CHAT_ID))fail('TELEGRAM_ADMIN_CHAT_ID: numeric ID required');
 if(settings.TELEGRAM_BOT_TOKEN&&!/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(settings.TELEGRAM_BOT_TOKEN))fail('TELEGRAM_BOT_TOKEN: invalid format');
 if(settings.TELEGRAM_WEBHOOK_URL&&!/^https:\/\/[^\s/]+\/api\/v2\/telegram\/webhook$/.test(settings.TELEGRAM_WEBHOOK_URL))fail('TELEGRAM_WEBHOOK_URL: invalid HTTPS endpoint');
 if(settings.TELEGRAM_WEBHOOK_SECRET&&!/^[A-Za-z0-9_-]{16,256}$/.test(settings.TELEGRAM_WEBHOOK_SECRET))fail('TELEGRAM_WEBHOOK_SECRET: invalid format');
 if(settings.DATABASE_URL){
  const pool=new Pool({connectionString:settings.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:5000,ssl:settings.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
  try{
   const tables=['customers','login_challenges','sessions','cart_items','orders','order_items','entitlements','download_tickets','order_events','notification_outbox','telegram_updates','telegram_notifications','customer_activity'];
   const result=await pool.query('SELECT name,to_regclass(name) IS NOT NULL AS present FROM unnest($1::text[]) AS name',[tables]);
   for(const table of result.rows)if(!table.present)fail('Database schema: missing '+table.name);
  }catch{fail('Database connection/schema: check failed');}finally{await pool.end();}
 }
 console.log('COMMERCE_ENABLED: '+(settings.COMMERCE_ENABLED==='true'?'enabled':'disabled'));
 console.log('TELEGRAM_ENABLED: '+(settings.TELEGRAM_ENABLED==='true'?'enabled':'disabled'));
 if(failures.length){for(const failure of failures)console.log('CHECK: '+failure);process.exitCode=1;}
 else console.log('Configuration shape and required schema checked.');
 console.log('Live email delivery, private file access and Telegram identity still require functional verification. No email sent, webhook changed or database data written.');
}
main().catch(()=>{console.error('Configuration check failed; inspect deployment access.');process.exitCode=1;});
