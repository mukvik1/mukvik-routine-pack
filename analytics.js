'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const net=require('node:net');
const path=require('node:path');
const {Pool}=require('pg');

const allowedOrigins=new Set(['https://routinepack.download','https://www.routinepack.download']);
const kyivDate=()=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]));
function today(){const parts=kyivDate();return `${parts.year}-${parts.month}-${parts.day}`;}
function sectionFor(raw){
 if(raw==='/')return 'home';
 if(raw==='/about/')return 'about';
 for(const section of ['packs','routines','free','legal'])if(raw===`/${section}/`||raw.startsWith(`/${section}/`))return section;
 return null;
}
function clientIp(req){
 const value=String(req.headers['cf-connecting-ip']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').split(',')[0].trim();
 const ip=value.startsWith('::ffff:')?value.slice(7):value;
 return net.isIP(ip)?ip:null;
}
function reply(res,status){res.writeHead(status,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end();}
async function readPath(req){let length=0,parts=[];for await(const chunk of req){const bytes=Buffer.from(chunk);length+=bytes.length;if(length>256)return null;parts.push(bytes);}return Buffer.concat(parts).toString('utf8').trim();}

function createAnalytics(settings=process.env,{pool=new Pool({connectionString:settings.DATABASE_URL,ssl:settings.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined})}={}){
 const source=settings.ANALYTICS_SECRET||settings.TELEGRAM_BOT_TOKEN;
 const key=source?crypto.createHmac('sha256',source).update('routinepack-traffic-v1').digest():null;
 const schema=fs.readFileSync(path.join(__dirname,'db','003_site_traffic.sql'),'utf8');
 const ready=key&&settings.DATABASE_URL?pool.query(schema).then(()=>true,error=>{console.error('Traffic schema unavailable:',error.code||error.name||'error');return false;}):Promise.resolve(false);
 const prune=async()=>{if(await ready)await pool.query("DELETE FROM site_traffic WHERE visit_day < ((now() AT TIME ZONE 'Europe/Kyiv')::date - 90)");};
 prune().catch(error=>console.error('Traffic cleanup unavailable:',error.code||error.name||'error'));
 const timer=setInterval(()=>prune().catch(error=>console.error('Traffic cleanup unavailable:',error.code||error.name||'error')),24*60*60*1000);timer.unref?.();
 async function handle(req,res){
  if(!allowedOrigins.has(req.headers.origin))return reply(res,403);
  const ua=String(req.headers['user-agent']||'').slice(0,256),ip=clientIp(req);
  const page=await readPath(req),section=sectionFor(page);
  if(!ua||!ip||!section||/bot|crawl|spider|preview|headless|lighthouse|curl|wget/i.test(ua))return reply(res,204);
  if(!await ready)return reply(res,503);
  const hash=crypto.createHmac('sha256',key).update(ip+'\0'+ua).digest('hex');
  try{await pool.query('INSERT INTO site_traffic(visit_day,visitor_hash,section,views) VALUES($1,$2,$3,1) ON CONFLICT(visit_day,visitor_hash,section) DO UPDATE SET views=site_traffic.views+1',[today(),hash,section]);return reply(res,204);}
  catch(error){console.error('Traffic write unavailable:',error.code||error.name||'error');return reply(res,503);}
 }
 return {handle,ready,close:async()=>{clearInterval(timer);await pool.end();}};
}

async function summary(pool){
 const result=await pool.query(`WITH dates AS (SELECT (now() AT TIME ZONE 'Europe/Kyiv')::date AS today)
 SELECT COUNT(DISTINCT visitor_hash) FILTER (WHERE visit_day=dates.today)::int AS today_people,
        COALESCE(SUM(views) FILTER (WHERE visit_day=dates.today),0)::int AS today_views,
        COUNT(DISTINCT visitor_hash) FILTER (WHERE visit_day=dates.today-1)::int AS yesterday_people,
        COALESCE(SUM(views) FILTER (WHERE visit_day=dates.today-1),0)::int AS yesterday_views,
        COUNT(DISTINCT visitor_hash) FILTER (WHERE visit_day BETWEEN dates.today-6 AND dates.today)::int AS week_people,
        COALESCE(SUM(views) FILTER (WHERE visit_day BETWEEN dates.today-6 AND dates.today),0)::int AS week_views
 FROM site_traffic CROSS JOIN dates WHERE visit_day BETWEEN dates.today-6 AND dates.today`);
 return result.rows[0];
}
module.exports={createAnalytics,summary,sectionFor};
