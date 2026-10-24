'use strict';
const {USD_UAH_RATE}=require('./monobank');
const CASH_RATE_URL='https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=5';
async function checkFxReminder({db,fetchImpl,send,now=new Date()}){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
 if(Number(parts.hour)<10)return;
 const day=parts.year+'-'+parts.month+'-'+parts.day;
 const claim=await db.query(`INSERT INTO fx_rate_reminders(day,claimed_at) VALUES($1,now())
 ON CONFLICT(day) DO UPDATE SET claimed_at=now()
 WHERE fx_rate_reminders.sent_at IS NULL AND fx_rate_reminders.claimed_at<now()-interval '15 minutes' RETURNING day`,[day]);
 if(!claim.rows?.length)return;
 let message;
 try{
  const response=await fetchImpl(CASH_RATE_URL,{signal:AbortSignal.timeout(8000),cache:'no-store'});
  if(!response.ok)throw Error('Rate source unavailable');
  const rows=await response.json();
  const item=Array.isArray(rows)?rows.find(x=>x.ccy==='USD'&&x.base_ccy==='UAH'):null;
  const sale=Number(item?.sale);
  if(!Number.isFinite(sale)||sale<1||sale>1000)throw Error('Invalid cash sale rate');
  message=['💵 Курс доллара · '+day,'В Routine Pack: '+USD_UAH_RATE+' грн/$','Наличный курс продажи USD ПриватБанка: '+sale.toFixed(2)+' грн/$','Это цена покупки доллара клиентом в кассе банка; не средний курс обменников.',Math.abs(sale-USD_UAH_RATE)>=0.5?'⚠️ Разница от 0,50 грн: стоит проверить курс сайта.':'Курс сайта можно оставить без изменений.','Курс оплаты автоматически не меняется.','Источник: https://privatbank.ua/obmin-valiut'].join('\n');
 }catch{message='💵 Напоминание о курсе: в Routine Pack '+USD_UAH_RATE+' грн/$.\nНе удалось получить наличный курс продажи USD. Проверьте обменники вручную.\nОплата продолжает работать по установленному курсу.';}
 await send(message);
 await db.query('UPDATE fx_rate_reminders SET sent_at=now() WHERE day=$1',[day]);
}
module.exports={checkFxReminder};
