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
