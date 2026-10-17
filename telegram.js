'use strict';
const crypto = require('node:crypto');

function createTelegramBot(settings, {pool, approveOrder, fetchImpl = fetch}) {
  if (settings.TELEGRAM_ENABLED !== 'true') return null;
  const {TELEGRAM_BOT_TOKEN: botToken, TELEGRAM_ADMIN_CHAT_ID: ownerId, TELEGRAM_WEBHOOK_URL: webhookUrl} = settings;
  // Derive a separate webhook secret from the high-entropy BotFather token when no explicit secret is configured.
  const webhookSecret = settings.TELEGRAM_WEBHOOK_SECRET || (botToken && crypto.createHmac('sha256',botToken).update('routinepack-telegram-webhook-v1').digest('hex'));
  if (!/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(botToken || '') || !/^[A-Za-z0-9_-]{16,256}$/.test(webhookSecret || '') || !/^\d{4,20}$/.test(ownerId || '') || !/^https:\/\/[^\s/]+\/api\/v2\/telegram\/webhook$/.test(webhookUrl || '')) throw new Error('Telegram bot configuration is incomplete');
  const endpoint = 'https://api.telegram.org/bot' + botToken + '/';
  async function call(method, payload) {
    const result = await fetchImpl(endpoint + method, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
    const data = await result.json();
    if (!result.ok || !data.ok) throw new Error('Telegram API request failed: ' + method);
    return data.result;
  }
  const menu={keyboard:[[{text:'📊 Посещаемость'},{text:'🛍 Заказы'}],[{text:'⏳ Ожидают оплаты'},{text:'💰 Общая статистика'}],[{text:'🟢 Состояние'},{text:'🧾 События'}]],resize_keyboard:true,is_persistent:true};
  const send = (text, options = {}) => call('sendMessage',{chat_id:ownerId,text,disable_web_page_preview:true,reply_markup:menu,...options});
  const statusLabels=Object.freeze({awaiting_manual_review:'ожидает проверки оплаты',approved:'подтверждён',cancelled:'отменён',refunded:'возврат'});
  const eventLabels=Object.freeze({order_created:'создан заказ',manual_approved:'открыт доступ',monobank_paid:'Monobank подтвердил оплату, доступ открыт',monobank_reversed:'Monobank сообщил о возврате, доступ закрыт',download_started:'начата загрузка',registered:'подтверждена регистрация',cart_updated:'изменена корзина'});
  const statusLabel=value=>statusLabels[value]||'неизвестен';
  const eventLabel=value=>eventLabels[value]||'другое событие';
  const money=(cents,currency)=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:currency||'USD'}).format(cents/100);
  const date=value=>new Date(value).toLocaleString('ru-RU',{timeZone:'UTC'})+' UTC';
  async function installWebhook() {
    if(settings.TELEGRAM_BOT_USERNAME) {
      const identity=await call('getMe',{});
      if(String(identity?.username||'').toLowerCase()!==settings.TELEGRAM_BOT_USERNAME.replace(/^@/,'').toLowerCase())throw new Error('Telegram bot username does not match configuration');
    }
    await call('setWebhook',{url:webhookUrl,secret_token:webhookSecret,allowed_updates:['message','callback_query'],drop_pending_updates:false});
    try {
      await call('setMyCommands',{scope:{type:'chat',chat_id:ownerId},language_code:'ru',commands:[
        {command:'start',description:'Открыть панель владельца'},
        {command:'help',description:'Показать команды'},
        {command:'orders',description:'Последние заказы'},
        {command:'pending',description:'Заказы на проверке'},
        {command:'order',description:'Информация о заказе'},
        {command:'stats',description:'💰 Посещения, заказы и загрузки'},
        {command:'visits',description:'📊 Посещаемость сайта'},
        {command:'status',description:'Состояние подключений'},
        {command:'events',description:'Последние события'}
      ]});
    } catch(error) {console.error('Telegram command menu unavailable:',error.code||error.name||'error');}
    return true;
  }
  async function notify(orderId,kind) {
    await pool.query('INSERT INTO telegram_notifications(order_id,kind) VALUES($1,$2) ON CONFLICT DO NOTHING',[orderId,kind]);
  }
  async function flushNotifications() {
    const db=await pool.connect();
    try {
      await db.query('BEGIN');
      const pending=await db.query("SELECT n.id,n.order_id,n.kind,o.status,o.total_cents,o.currency,c.email,paid.invoice_id,paid.amount_kop FROM telegram_notifications n JOIN orders o ON o.id=n.order_id JOIN customers c ON c.id=o.customer_id LEFT JOIN LATERAL (SELECT invoice_id,amount_kop FROM monobank_invoices WHERE order_id=o.id AND status IN ('success','reversed') ORDER BY id DESC LIMIT 1) paid ON true WHERE n.sent_at IS NULL AND n.attempts<20 ORDER BY n.id LIMIT 10 FOR UPDATE OF n SKIP LOCKED");
      for(const n of pending.rows) {
        try {
          const label=n.kind==='new_order'?'🛍 Новый заказ':n.kind==='monobank_paid'?'Monobank подтвердил оплату. Доступ открыт. Оформите чек.':n.kind==='monobank_reversed'?'Monobank сообщил о возврате. Доступ закрыт. Проверьте чек возврата.':'Заказ подтверждён';
          const payment=n.invoice_id?'\nMonobank invoice: '+n.invoice_id+'\nОплачено: '+money(n.amount_kop,'UAH'):'';
          await send(label+'\nНомер: '+n.order_id+'\nПокупатель: '+n.email+'\nКаталог: '+money(n.total_cents,n.currency)+payment+'\nСтатус: '+statusLabel(n.status), n.kind==='new_order'?{reply_markup:{inline_keyboard:[[{text:'Посмотреть заказ',callback_data:'view:'+n.order_id}]]}}:{});
          await db.query('UPDATE telegram_notifications SET sent_at=now(),attempts=attempts+1 WHERE id=$1',[n.id]);
        } catch {
          await db.query('UPDATE telegram_notifications SET attempts=attempts+1 WHERE id=$1',[n.id]);
        }
      }
      const activity=await db.query("SELECT a.id,a.kind,a.payload,c.email FROM customer_activity a JOIN customers c ON c.id=a.customer_id WHERE a.sent_at IS NULL AND a.attempts<20 ORDER BY a.id LIMIT 10 FOR UPDATE OF a SKIP LOCKED");
      for(const a of activity.rows){
        try {
          const lines=[a.kind==='registered'?'👤 Новый зарегистрированный покупатель':'🛒 Изменение корзины','Покупатель: '+a.email];
          if(a.kind==='registered')lines.push('Email подтверждён.');
          else {
            for(const item of a.payload.added||[])lines.push('Добавлено: '+item.name);
            for(const item of a.payload.removed||[])lines.push('Убрано: '+item.name);
            lines.push('В корзине: '+((a.payload.products||[]).map(item=>item.name).join(', ')||'пусто'));
          }
          await send(lines.join('\n'));
          await db.query('UPDATE customer_activity SET sent_at=now(),attempts=attempts+1 WHERE id=$1',[a.id]);
        } catch {
          await db.query('UPDATE customer_activity SET attempts=attempts+1 WHERE id=$1',[a.id]);
        }
      }
      await db.query('COMMIT');
    } catch(error) {await db.query('ROLLBACK');throw error;} finally {db.release();}
  }
  const orderIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  async function showOrder(id) {
    if(!orderIdPattern.test(id))return send('Неверный номер заказа.');
    const r=await pool.query("SELECT o.id,o.status,o.total_cents,o.currency,o.created_at,c.email,json_agg(json_build_object('name',i.name,'price_cents',i.price_cents) ORDER BY i.product_code) AS items FROM orders o JOIN customers c ON c.id=o.customer_id JOIN order_items i ON i.order_id=o.id WHERE o.id=$1 GROUP BY o.id,c.email",[id]);
    if(!r.rowCount)return send('Заказ не найден.');
    const x=r.rows[0];
    const reply_markup=x.status==='awaiting_manual_review'&&settings.MONOBANK_ENABLED!=='true'?{inline_keyboard:[[{text:'Я проверил оплату · подтвердить',callback_data:'confirm:'+id}]]}:undefined;
    await send('Заказ '+x.id+'\nПокупатель: '+x.email+'\nСтатус: '+statusLabel(x.status)+'\nСумма: '+money(x.total_cents,x.currency)+'\n'+x.items.map(item=>'• '+item.name+' — '+money(item.price_cents,x.currency)).join('\n')+'\nСоздан: '+date(x.created_at),reply_markup?{reply_markup}:{});
  }
  async function command(text) {
    const shortcuts={'📊 Посещаемость':'/visits','🛍 Заказы':'/orders','⏳ Ожидают оплаты':'/pending','💰 Общая статистика':'/stats','🟢 Состояние':'/status','🧾 События':'/events'};
    text=shortcuts[text]||text;
    const [name,arg]=(text||'').trim().split(/\s+/,2);
    if(name==='/visits'){
      const days=['1','7','30'].includes(arg)?Number(arg):7;
      return send(await require('./analytics').report(pool,days),{reply_markup:{inline_keyboard:[[{text:'Сегодня',callback_data:'visits:1'},{text:'7 дней',callback_data:'visits:7'},{text:'30 дней',callback_data:'visits:30'}]]}});
    }
    if(name==='/start'||name==='/help')return send('🎛 Панель владельца Routine Pack\n\n📊 /visits — посещаемость сайта\n🛍 /orders — последние заказы\n⏳ /pending — заказы, ожидающие оплаты\n/order UUID — подробности заказа\n💰 /stats — посещения сайта, заказы и загрузки\n🟢 /status — состояние подключений\n🧾 /events — история событий\nПри оплате Monobank доступ открывается автоматически после подтверждения банка. Чек оформляйте вручную.');
    if(name==='/status') {
      const emailReady=settings.MAIL_PROVIDER==='resend'?Boolean(settings.RESEND_API_KEY&&settings.SMTP_FROM):settings.MAIL_PROVIDER==='gmail_api'
        ? ['GMAIL_OAUTH_CLIENT_ID','GMAIL_OAUTH_CLIENT_SECRET','GMAIL_OAUTH_REFRESH_TOKEN'].every(key=>Boolean(settings[key]))
        : settings.MAIL_PROVIDER==='smtp'&&['SMTP_HOST','SMTP_USER','SMTP_PASSWORD'].every(key=>Boolean(settings[key]));
      const filesReady=Boolean(settings.GOOGLE_SERVICE_ACCOUNT_JSON&&settings.COMMERCE_FILES_JSON);
      return send([
        'Состояние Routine Pack',
        'Бот: на связи',
        'Кабинет и корзина: '+(settings.COMMERCE_ENABLED==='true'?'включены':'выключены'),
        'Почта: '+(emailReady?'учётные данные указаны, нужна проверка отправки':'нет серверных учётных данных'),
        'Защищённая выдача: '+(filesReady?'учётные данные указаны, нужна проверка доступа':'нет доступа сервера к закрытым файлам'),
        'Monobank: '+(settings.MONOBANK_ENABLED==='true'?'включён':'выключен')
      ].join('\n'));
    }
    if(name==='/events') {
      const r=await pool.query("SELECT * FROM (SELECT e.order_id,e.event_type,e.created_at,c.email FROM order_events e JOIN orders o ON o.id=e.order_id JOIN customers c ON c.id=o.customer_id UNION ALL SELECT NULL::uuid AS order_id,a.kind AS event_type,a.created_at,c.email FROM customer_activity a JOIN customers c ON c.id=a.customer_id) history ORDER BY created_at DESC LIMIT 20");
      return send(r.rows.length?r.rows.map(e=>date(e.created_at)+' · '+eventLabel(e.event_type)+' · '+(e.email||'')+(e.order_id?' · '+e.order_id:'')).join('\n').slice(0,4000):'Событий пока нет.');
    }
    if(name==='/stats') {
      const r=await pool.query("SELECT (SELECT count(*)::int FROM orders) AS orders,(SELECT count(*)::int FROM orders WHERE status='awaiting_manual_review') AS pending,(SELECT count(*)::int FROM orders WHERE status='approved') AS approved,(SELECT count(*)::int FROM order_events WHERE event_type='download_started') AS downloads");
      const x=r.rows[0];
      let traffic='Посещения сайта: статистика временно недоступна.';
      try{
        const v=await require('./analytics').summary(pool);
        traffic='📊 Посещения сайта (по Киеву, приблизительно)\n'+
          'Сегодня: уникальных посетителей — '+v.today_people+', просмотров — '+v.today_views+'\n'+
          'Вчера: уникальных посетителей — '+v.yesterday_people+', просмотров — '+v.yesterday_views+'\n'+
          'За 7 дней: уникальных посетителей — '+v.week_people+', просмотров — '+v.week_views+'\n'+
          'За 30 дней: уникальных посетителей — '+(v.month_people||0)+', просмотров — '+(v.month_views||0);
      }catch(error){console.error('Traffic report unavailable:',error.code||error.name||'error');}
      return send(traffic+'\n\nЗаказов: '+x.orders+'\nЖдут проверки: '+x.pending+'\nПодтверждено: '+x.approved+'\nНачато загрузок: '+x.downloads);
    }
    if(name==='/pending'||name==='/orders') {
      const r=await pool.query("SELECT o.id,o.status,o.total_cents,o.currency,c.email FROM orders o JOIN customers c ON c.id=o.customer_id WHERE ($1::boolean=false OR o.status='awaiting_manual_review') ORDER BY o.created_at DESC LIMIT 20",[name==='/pending']);
      return send(r.rows.length?r.rows.map(o=>o.id+' · '+statusLabel(o.status)+' · '+money(o.total_cents,o.currency)+' · '+o.email).join('\n'):'Заказов пока нет.');
    }
    if(name==='/order')return showOrder(arg||'');
    return send('Список команд: /help');
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
        if(action==='visits'&&['1','7','30'].includes(id))await command('/visits '+id);
        if(orderIdPattern.test(id||'')&&action==='view')await showOrder(id);
        if(orderIdPattern.test(id||'')&&action==='confirm') {
          await send('Вы лично проверили оплату заказа '+id+'? После подтверждения покупатель получит доступ.',{reply_markup:{inline_keyboard:[[{text:'Да · открыть доступ',callback_data:'approve:'+id},{text:'Отмена',callback_data:'cancel:'+id}]]}});
        }
        if(orderIdPattern.test(id||'')&&action==='approve') {
          const result=await approveOrder(id);
          await send(result.status==='approved'?'Доступ по заказу '+id+' открыт'+(result.alreadyApproved?' (уже был открыт)':''):('Не удалось подтвердить заказ '+id+': '+(result.error==='Customer purchases are not enabled.'?'выдача покупателям ещё не включена':result.error==='Order cannot be approved.'?'заказ нельзя подтвердить в текущем статусе':'проверьте заказ и попробуйте позже')));
        }
        if(action==='cancel')await send('Подтверждение отменено.');
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
