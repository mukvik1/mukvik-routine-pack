'use strict';

const kyiv = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
});
const plan = tier => tier === 'pro' ? 'Ultra' : tier === 'standard' ? 'Pro' : 'Прежний тариф';
const labels = {
  active: 'оплачено · доступ активен',
  active_cancelled: 'оплачено · без продления',
  ended: 'оплаченный период закончился',
  cancelled: 'отменено без оплаты',
  expired: 'срок ссылки истёк',
  pending: 'ссылка выдана · оплаты пока нет',
  error: 'не удалось открыть оплату'
};

async function readSubscriptionReport(pool, includeRecent = false) {
  const {rows: [x]} = await pool.query(`
    WITH subscriptions AS (
      SELECT s.*, CASE
        WHEN s.paid_until > now() AND s.cancelled_at IS NOT NULL THEN 'active_cancelled'
        WHEN s.paid_until > now() THEN 'active'
        WHEN s.paid_until IS NOT NULL THEN 'ended'
        WHEN s.cancelled_at IS NOT NULL THEN 'cancelled'
        WHEN s.checkout_expires_at <= now() THEN 'expired'
        ELSE 'pending' END AS state
      FROM standard_subscriptions s
    ), recent AS (
      SELECT s.customer_id,s.tier,s.state,COALESCE(s.checked_at,s.created_at) AS at,NULL::text AS error_code FROM subscriptions s
      UNION ALL
      SELECT e.customer_id,e.tier,'error',e.created_at,e.error_code FROM subscription_checkout_errors e
    )
    SELECT
      (SELECT count(*)::int FROM customers WHERE email_verified_at >= now()-interval '7 days') AS registrations,
      (SELECT count(DISTINCT customer_id)::int FROM free_downloads
        WHERE finished_at >= now()-interval '7 days' AND status='completed') AS free_users,
      (SELECT count(DISTINCT customer_id)::int FROM subscriptions WHERE created_at >= now()-interval '7 days') AS started,
      (SELECT count(*)::int FROM subscription_checkout_errors WHERE created_at >= now()-interval '7 days') AS errors,
      (SELECT count(DISTINCT customer_id)::int FROM subscriptions WHERE paid_until IS NOT NULL) AS paid_customers,
      (SELECT count(DISTINCT customer_id)::int FROM subscriptions WHERE state IN ('active','active_cancelled') AND tier='standard') AS pro,
      (SELECT count(DISTINCT customer_id)::int FROM subscriptions WHERE state IN ('active','active_cancelled') AND tier='pro') AS ultra,
      (SELECT count(DISTINCT customer_id)::int FROM subscriptions WHERE state IN ('active','active_cancelled') AND tier='legacy') AS legacy,
      (SELECT count(DISTINCT customer_id)::int FROM subscriptions WHERE state='pending') AS pending,
      (SELECT count(*)::int FROM subscriptions WHERE state='expired' AND created_at >= now()-interval '7 days') AS expired,
      CASE WHEN $1 THEN (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.at DESC), '[]'::jsonb) FROM (
        SELECT c.email,a.tier,a.state,a.at,a.error_code FROM recent a
        JOIN customers c ON c.id=a.customer_id ORDER BY a.at DESC LIMIT 8
      ) r) ELSE '[]'::jsonb END AS recent`, [includeRecent]);
  return x;
}

async function subscriptionReport(pool) {
  const x = await readSubscriptionReport(pool, true);
  return [
    '💳 Подписки Routine Pack',
    '',
    'За последние 7 дней:',
    'Подтвердили email: '+x.registrations,
    'Получили бесплатные файлы: '+x.free_users,
    'Получили ссылку Monobank: '+x.started,
    'Истекло ссылок без оплаты: '+x.expired,
    'Ошибок при оформлении: '+x.errors,
    '',
    'Сейчас активны: Pro — '+x.pro+', Ultra — '+x.ultra+(x.legacy?', прежний тариф — '+x.legacy:''),
    'Сейчас ждут оплаты: '+x.pending,
    'Клиентов с подтверждённой оплатой за всё время: '+x.paid_customers,
    '',
    'Последняя активность (Киев)',
    ...(x.recent.length ? x.recent.map(r =>
      kyiv.format(new Date(r.at))+' · '+plan(r.tier)+' · '+labels[r.state]+
      (r.error_code?' ('+r.error_code+')':'')+' · '+r.email
    ) : ['Попыток оформить подписку пока нет.'])
  ].join('\n').slice(0,4000);
}
module.exports = { readSubscriptionReport, subscriptionReport };

const periods = {'1':'Сегодня', '7':'7 дней', '30':'30 дней', '0':'Всё время'};
const views = {all:'История', active:'Активные', cancelled:'Без продления'};
const pageSize = 6;
const fullDate = new Intl.DateTimeFormat('ru-RU', {
  timeZone:'Europe/Kyiv', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
});
async function subscriptionDetail(pool, period='0', view='all', page=0) {
  const {rows:[summary]} = await pool.query(`
    WITH bounds AS (
      SELECT CASE $1::int WHEN 0 THEN '-infinity'::timestamptz
        WHEN 1 THEN date_trunc('day',now() AT TIME ZONE 'Europe/Kyiv') AT TIME ZONE 'Europe/Kyiv'
        ELSE now()-make_interval(days=>$1::int) END AS since
    ), history AS (
      SELECT s.id::text AS id,c.email,s.tier,s.created_at,s.first_paid_at,s.paid_until,s.cancelled_at,
        NULL::text AS error_code,
        CASE WHEN s.paid_until>now() AND s.cancelled_at IS NOT NULL THEN 'active_cancelled'
             WHEN s.paid_until>now() THEN 'active'
             WHEN s.first_paid_at IS NOT NULL OR s.paid_until IS NOT NULL THEN 'ended'
             WHEN s.cancelled_at IS NOT NULL THEN 'cancelled'
             WHEN s.checkout_expires_at<=now() THEN 'expired' ELSE 'pending' END AS state,
        greatest(s.created_at,s.first_paid_at,s.cancelled_at) AS activity_at
      FROM standard_subscriptions s JOIN customers c ON c.id=s.customer_id
      UNION ALL
      SELECT 'error-'||e.id,c.email,e.tier,e.created_at,NULL,NULL,NULL,e.error_code,'error',e.created_at
      FROM subscription_checkout_errors e JOIN customers c ON c.id=e.customer_id
    ), page_rows AS (
      SELECT h.* FROM history h CROSS JOIN bounds b
      WHERE ($2='all' AND h.activity_at>=b.since)
        OR ($2='active' AND h.state IN ('active','active_cancelled'))
        OR ($2='cancelled' AND h.cancelled_at IS NOT NULL AND h.cancelled_at>=b.since)
      ORDER BY CASE WHEN $2='cancelled' THEN h.cancelled_at ELSE h.activity_at END DESC,h.id DESC
      LIMIT 7 OFFSET $3
    )
    SELECT
      (SELECT count(*) FROM customers WHERE email_verified_at>=b.since)::int AS registrations,
      count(DISTINCT email) FILTER (WHERE state<>'error' AND created_at>=b.since)::int AS started,
      count(DISTINCT email) FILTER (WHERE first_paid_at>=b.since OR ($1::int=0 AND paid_until IS NOT NULL))::int AS paid,
      count(*) FILTER (WHERE state='error' AND created_at>=b.since)::int AS errors,
      count(*) FILTER (WHERE state='expired' AND created_at>=b.since)::int AS expired,
      count(DISTINCT email) FILTER (WHERE state IN ('active','active_cancelled'))::int AS active,
      count(DISTINCT email) FILTER (WHERE state IN ('active','active_cancelled') AND tier='standard')::int AS pro,
      count(DISTINCT email) FILTER (WHERE state IN ('active','active_cancelled') AND tier='pro')::int AS ultra,
      count(DISTINCT email) FILTER (WHERE state='pending')::int AS pending,
      count(DISTINCT email) FILTER (WHERE cancelled_at>=b.since)::int AS cancelled,
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY CASE WHEN $2='cancelled' THEN p.cancelled_at ELSE p.activity_at END DESC,p.id DESC) FROM page_rows p) AS items
    FROM bounds b LEFT JOIN history ON true GROUP BY b.since`,[period,view,page*pageSize]);
  const items=summary.items||[], fmt=value=>fullDate.format(new Date(value));
  const lines=[
    '💳 Подписки Routine Pack · '+periods[period],
    'Подтвердили email: '+summary.registrations+' · Получили ссылку: '+summary.started,
    'Подтверждённая первая оплата: '+summary.paid+' · Ошибки: '+summary.errors,
    'Истекшие ссылки без оплаты: '+summary.expired+' · Отменили: '+summary.cancelled,
    'Сейчас активны: '+summary.active+' (Pro: '+summary.pro+', Ultra: '+summary.ultra+') · Ждут оплаты: '+summary.pending,
    '',
    views[view]+(view==='active'?' · на данный момент':' · '+periods[period])+' · стр. '+(page+1)+' · время Киева'
  ];
  if(period!=='0')lines.push('Старые оплаты без даты подтверждения видны в «Всё время».');
  if(!items.length)lines.push('Записей нет.');
  for(const r of items.slice(0,pageSize)){
    lines.push('',r.email.slice(0,254)+' · '+plan(r.tier)+' · '+labels[r.state],
      (r.state==='error'?'Ошибка: ':'Ссылка выдана: ')+fmt(r.created_at)+(r.error_code?' · '+r.error_code:''));
    if(r.first_paid_at)lines.push('Первая оплата подтверждена: '+fmt(r.first_paid_at));
    else if(r.paid_until)lines.push('Оплата подтверждена · точная дата не записана');
    if(r.paid_until)lines.push('Доступ до: '+fmt(r.paid_until));
    if(r.cancelled_at)lines.push('Отмена: '+fmt(r.cancelled_at));
  }
  const button=(text,p,v,n=0)=>({text,callback_data:'subs:'+p+':'+v+':'+n});
  const keyboard=[
    ['1','7','30','0'].map(p=>button((p===period?'✓ ':'')+periods[p],p,view)),
    Object.keys(views).map(v=>button((v===view?'✓ ':'')+views[v],period,v))
  ];
  const pagination=[];
  if(page>0)pagination.push(button('← Назад',period,view,page-1));
  if(items.length>pageSize&&page<9999)pagination.push(button('Далее →',period,view,page+1));
  if(pagination.length)keyboard.push(pagination);
  return {text:lines.join('\n'),reply_markup:{inline_keyboard:keyboard}};
}
module.exports.subscriptionDetail=subscriptionDetail;
