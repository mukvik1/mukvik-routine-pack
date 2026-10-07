'use strict';
const crypto = require('node:crypto');

function createTelegramBot(settings, {pool, approveOrder, fetchImpl = fetch}) {
  if (settings.TELEGRAM_ENABLED !== 'true') return null;
  const {TELEGRAM_BOT_TOKEN: botToken, TELEGRAM_WEBHOOK_SECRET: webhookSecret, TELEGRAM_ADMIN_CHAT_ID: ownerId, TELEGRAM_WEBHOOK_URL: webhookUrl} = settings;
  if (!/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(botToken || '') || !/^[A-Za-z0-9_-]{16,256}$/.test(webhookSecret || '') || !/^\d{4,20}$/.test(ownerId || '') || !/^https:\/\/[^\s/]+\/api\/v2\/telegram\/webhook$/.test(webhookUrl || '')) throw new Error('Telegram bot configuration is incomplete');
  const endpoint = 'https://api.telegram.org/bot' + botToken + '/';
  async function call(method, payload) {
    const result = await fetchImpl(endpoint + method, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
    const data = await result.json();
    if (!result.ok || !data.ok) throw new Error('Telegram API request failed: ' + method);
    return data.result;
  }
  const send = (text, options = {}) => call('sendMessage',{chat_id:ownerId,text,disable_web_page_preview:true,...options});
  async function installWebhook() {
    return call('setWebhook',{url:webhookUrl,secret_token:webhookSecret,allowed_updates:['message','callback_query'],drop_pending_updates:false});
  }
  async function notify(orderId,kind) {
    await pool.query('INSERT INTO telegram_notifications(order_id,kind) VALUES($1,$2) ON CONFLICT DO NOTHING',[orderId,kind]);
  }
  async function flushNotifications() {
    const db=await pool.connect();
    try {
      await db.query('BEGIN');
      const pending=await db.query("SELECT n.id,n.order_id,n.kind,o.status,o.total_cents,o.currency,c.email FROM telegram_notifications n JOIN orders o ON o.id=n.order_id JOIN customers c ON c.id=o.customer_id WHERE n.sent_at IS NULL AND n.attempts<20 ORDER BY n.id LIMIT 10 FOR UPDATE OF n SKIP LOCKED");
      for(const n of pending.rows) {
        try {
          const label=n.kind==='new_order'?'New order':'Order approved';
          await send(label+'\n'+n.order_id+'\n'+n.email+'\n'+(n.total_cents/100).toFixed(2)+' '+n.currency+'\nStatus: '+n.status, n.kind==='new_order'?{reply_markup:{inline_keyboard:[[{text:'Review order',callback_data:'view:'+n.order_id}]]}}:{});
          await db.query('UPDATE telegram_notifications SET sent_at=now(),attempts=attempts+1 WHERE id=$1',[n.id]);
        } catch {
          await db.query('UPDATE telegram_notifications SET attempts=attempts+1 WHERE id=$1',[n.id]);
        }
      }
      await db.query('COMMIT');
    } catch(error) {await db.query('ROLLBACK');throw error;} finally {db.release();}
  }
  const orderIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  async function showOrder(id) {
    if(!orderIdPattern.test(id))return send('Invalid order ID.');
    const r=await pool.query("SELECT o.id,o.status,o.total_cents,o.currency,o.created_at,c.email,coalesce(string_agg(i.name || ' — ' || (i.price_cents / 100.0)::text || ' ' || o.currency,E'\n' ORDER BY i.product_code),'') AS items FROM orders o JOIN customers c ON c.id=o.customer_id JOIN order_items i ON i.order_id=o.id WHERE o.id=$1 GROUP BY o.id,c.email",[id]);
    if(!r.rowCount)return send('Order not found.');
    const x=r.rows[0];
    const reply_markup=x.status==='awaiting_manual_review'?{inline_keyboard:[[{text:'I checked payment · approve',callback_data:'confirm:'+id}]]}:undefined;
    await send('Order '+x.id+'\nBuyer: '+x.email+'\nStatus: '+x.status+'\nTotal: '+(x.total_cents/100).toFixed(2)+' '+x.currency+'\n'+x.items+'\nCreated: '+new Date(x.created_at).toISOString(),reply_markup?{reply_markup}:{});
  }
  async function command(text) {
    const [name,arg]=(text||'').trim().split(/\s+/,2);
    if(name==='/start'||name==='/help')return send('Routine Pack owner panel\n/orders — latest orders\n/pending — orders awaiting review\n/order UUID — order details\n/stats — order and delivery counts\nApprove only after you have verified the payment yourself.');
    if(name==='/events') {
      const r=await pool.query("SELECT e.order_id,e.event_type,e.created_at FROM order_events e ORDER BY e.id DESC LIMIT 20");
      return send(r.rows.length?r.rows.map(e=>new Date(e.created_at).toISOString()+' · '+e.event_type+' · '+e.order_id).join('\\n'):'No events found.');
    }
    if(name==='/stats') {
      const r=await pool.query("SELECT (SELECT count(*)::int FROM orders) AS orders,(SELECT count(*)::int FROM orders WHERE status='awaiting_manual_review') AS pending,(SELECT count(*)::int FROM orders WHERE status='approved') AS approved,(SELECT count(*)::int FROM order_events WHERE event_type='download_started') AS downloads");
      const x=r.rows[0];
      return send('Orders: '+x.orders+'\nPending: '+x.pending+'\nApproved: '+x.approved+'\nDownloads started: '+x.downloads);
    }
    if(name==='/pending'||name==='/orders') {
      const r=await pool.query("SELECT o.id,o.status,o.total_cents,o.currency,c.email FROM orders o JOIN customers c ON c.id=o.customer_id WHERE ($1::boolean=false OR o.status='awaiting_manual_review') ORDER BY o.created_at DESC LIMIT 20",[name==='/pending']);
      return send(r.rows.length?r.rows.map(o=>o.id+' · '+o.status+' · '+(o.total_cents/100).toFixed(2)+' '+o.currency+' · '+o.email).join('\n'):'No orders found.');
    }
    if(name==='/order')return showOrder(arg||'');
    return send('Use /help for available commands.');
  }
  function authorized(id,chat) {return String(id)===ownerId && String(chat)===ownerId;}
  async function handle(req,res) {
    const reply=status=>{res.writeHead(status,{'Cache-Control':'no-store'});res.end();};
    const supplied=String(req.headers['x-telegram-bot-api-secret-token']||'');
    const a=Buffer.from(supplied),b=Buffer.from(webhookSecret);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return reply(401);
    let size=0,parts=[];
    for await (const chunk of req) {size+=chunk.length;if(size>16384)return reply(413);parts.push(chunk);}
    let update;
    try {update=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{return reply(400);}
    if(!Number.isSafeInteger(update.update_id)||update.update_id<0)return reply(400);
    const message=update.message,callback=update.callback_query;
    const actor=message?.from?.id ?? callback?.from?.id;
    const chat=message?.chat?.id ?? callback?.message?.chat?.id;
    // Telegram user ID and private chat ID must both match the owner's configured ID.
    if(!authorized(actor,chat))return reply(200);
    const claimed=await pool.query('INSERT INTO telegram_updates(update_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING update_id',[update.update_id]);
    if(!claimed.rowCount)return reply(200);
    try {
      if(message?.text)await command(message.text);
      if(callback) {
        await call('answerCallbackQuery',{callback_query_id:callback.id});
        const data=String(callback.data||'');
        const [action,id]=data.split(':');
        if(orderIdPattern.test(id||'')&&action==='view')await showOrder(id);
        if(orderIdPattern.test(id||'')&&action==='confirm') {
          await send('Final check: confirm payment for order '+id+'?',{reply_markup:{inline_keyboard:[[{text:'Yes · grant access',callback_data:'approve:'+id},{text:'Cancel',callback_data:'cancel:'+id}]]}});
        }
        if(orderIdPattern.test(id||'')&&action==='approve') {
          const result=await approveOrder(id);
          await send(result.status==='approved'?'Access granted for '+id+(result.alreadyApproved?' (already approved)':''):('Could not approve '+id+': '+result.error));
        }
        if(action==='cancel')await send('Approval cancelled.');
      }
      reply(200);
    }catch(error) {
      // Failed updates are retried by Telegram; approval itself is idempotent in PostgreSQL.
      await pool.query('DELETE FROM telegram_updates WHERE update_id=$1',[update.update_id]);
      reply(503);
    }
  }
  return {handle,installWebhook,notify,flushNotifications};
}
module.exports={createTelegramBot};
